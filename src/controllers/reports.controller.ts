import { NextFunction, Response } from 'express';
import db from '../db/knex';
import { AppError } from '../errors/AppError';
import { AuthRequest } from '../middleware/authMiddleware';
import { RouteModel } from '../models/route.model';
import { BUSINESS_TIME_ZONE, BusinessDay, getBusinessDay, getBusinessDayForDate } from '../utils/businessTime';
import { applyReportFont, createPdfBuffer, createZipArchive, sendPdf, sendZip } from '../utils/reportFiles';
import { getNextScheduledRoute, readRouteSchedule } from '../utils/routeSchedule';
import { requireAuthenticatedUser } from '../utils/userQueries';

type TodayOrderRow = {
  order_id: number;
  order_number: string | null;
  status: string;
  total_cents: number;
  company_id: number;
  company_name: string;
  user_name: string | null;
  route_id: number;
  route_name: string;
  departure_at: Date;
  dish_name: string | null;
  qty: number | null;
  base_price_cents: number | null;
  discount_price_cents: number | null;
  discounted_qty: number | null;
  line_total_cents: number | null;
};

type TodayDishSummaryRow = {
  dish_name: string;
  total_qty: number;
  company_count: number;
};

type OrderDish = {
  dishName: string;
  qty: number;
  basePriceCents: number;
  discountPriceCents: number;
  discountedQty: number;
  lineTotalCents: number;
};

type AggregatedOrder = {
  orderId: number;
  orderNumber: string | null;
  userName: string | null;
  status: string;
  routeName: string;
  departureAt: Date;
  totalCents: number;
  dishes: OrderDish[];
};

type CompanyOrders = {
  companyName: string;
  orders: AggregatedOrder[];
};

type RouteOrders = {
  routeId: number;
  routeName: string;
  departureAt: Date;
  companies: CompanyOrders[];
};

type StickerOrder = AggregatedOrder & {
  companyName: string;
};

const PAGE_MARGIN = 36;
const LABEL_COLUMNS = 2;
const LABEL_ROWS = 4;
const LABEL_GAP = 10;

const ORDER_STATUS_LABELS: Record<string, string> = {
  created: 'Создан',
  paid: 'Оплачен',
  cooking: 'Готовится',
  delivering: 'В доставке',
  completed: 'Завершён',
  cancelled: 'Отменён',
};

const formatDateTime = (value: Date): string =>
  new Intl.DateTimeFormat('ru-RU', {
    timeZone: BUSINESS_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);

const formatTime = (value: Date): string =>
  new Intl.DateTimeFormat('ru-RU', {
    timeZone: BUSINESS_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);

const formatMoney = (cents: number): string => `${(cents / 100).toFixed(2)} \u20bd`;

const ensurePageSpace = (doc: PDFKit.PDFDocument, minY: number) => {
  if (doc.y > minY) {
    doc.addPage();
    applyReportFont(doc);
  }
};

const reportOrdersQuery = async ({ start, end }: BusinessDay) => {
  const yesterday = getBusinessDay(new Date(start.getTime() - 1));
  const schedules = await db<RouteModel>('routes').whereNull('deleted_at').select('schedule');
  let lastDeparture: Date | undefined;
  for (const { schedule } of schedules) {
    const { departureAt } = getNextScheduledRoute(readRouteSchedule(schedule), yesterday.start);
    if (departureAt < start && (!lastDeparture || departureAt > lastDeparture)) {
      lastDeparture = departureAt;
    }
  }

  const query = db('orders as o')
    .join('companies as c', 'c.id', 'o.company_id')
    .join('users as u', 'u.id', 'o.user_id')
    .join('routes as r', 'r.id', 'o.route_id')
    .whereNull('o.deleted_at')
    .whereNull('c.deleted_at')
    .whereNull('u.deleted_at')
    .whereNull('r.deleted_at')
    .where('o.route_departure_unix', '>=', start.getTime() / 1000)
    .where('o.route_departure_unix', '<', end.getTime() / 1000)
    .where('o.created_at', lastDeparture ? '>' : '>=', db.raw('FROM_UNIXTIME(?)', [(lastDeparture ?? start).getTime() / 1000]))
    .where('o.created_at', '<', db.raw('FROM_UNIXTIME(??)', ['o.route_acceptance_ends_unix']))
    .whereNot('o.status', 'cancelled');
  return { query };
};

const loadReportOrders = async (day: BusinessDay): Promise<TodayOrderRow[]> => {
  const { query } = await reportOrdersQuery(day);
  const rows: Array<Omit<TodayOrderRow, 'departure_at'> & { departure_at: string | number }> = await query
    .leftJoin('order_items as oi', 'oi.order_id', 'o.id')
    .leftJoin('dishes as d', 'd.id', 'oi.dish_id')
    .select(
      'o.id as order_id',
      'o.order_number',
      'o.status',
      'o.total_cents',
      'c.id as company_id',
      'c.name as company_name',
      'u.full_name as user_name',
      'r.id as route_id',
      'r.name as route_name',
      'o.route_departure_unix as departure_at',
      'd.name as dish_name',
      'oi.qty',
      'oi.base_price_cents',
      'oi.discount_price_cents',
      'oi.discounted_qty',
      'oi.line_total_cents'
    )
    .orderBy('o.route_departure_unix', 'asc')
    .orderBy('c.name', 'asc')
    .orderBy('u.full_name', 'asc')
    .orderBy('o.id', 'asc')
    .orderBy('d.name', 'asc');

  return rows.map((row) => ({ ...row, departure_at: new Date(Number(row.departure_at) * 1000) }));
};

const loadReportDishSummary = async (day: BusinessDay): Promise<TodayDishSummaryRow[]> => {
  const { query } = await reportOrdersQuery(day);
  return query
    .join('order_items as oi', 'oi.order_id', 'o.id')
    .join('dishes as d', 'd.id', 'oi.dish_id')
    .groupBy('d.id', 'd.name')
    .select(
      'd.name as dish_name',
      db.raw('SUM(oi.qty) as total_qty'),
      db.raw('COUNT(DISTINCT o.company_id) as company_count')
    )
    .orderBy('d.name', 'asc');
};

const aggregateOrdersByCompany = (rows: TodayOrderRow[]): CompanyOrders[] => {
  const companyMap = new Map<string, CompanyOrders>();

  for (const row of rows) {
    const companyKey = `${row.company_id}:${row.company_name}`;
    const company = companyMap.get(companyKey) ?? {
      companyName: row.company_name,
      orders: [],
    };

    let order = company.orders.find((item) => item.orderId === row.order_id);

    if (!order) {
      order = {
        orderId: row.order_id,
        orderNumber: row.order_number,
        userName: row.user_name,
        status: row.status,
        routeName: row.route_name,
        departureAt: row.departure_at,
        totalCents: row.total_cents,
        dishes: [],
      };
      company.orders.push(order);
    }

    if (row.dish_name && row.qty) {
      order.dishes.push({
        dishName: row.dish_name,
        qty: row.qty,
        basePriceCents: Number(row.base_price_cents ?? 0),
        discountPriceCents: Number(row.discount_price_cents ?? 0),
        discountedQty: Number(row.discounted_qty ?? 0),
        lineTotalCents: Number(row.line_total_cents ?? 0),
      });
    }

    companyMap.set(companyKey, company);
  }

  return Array.from(companyMap.values());
};

const aggregateOrdersByRoute = (rows: TodayOrderRow[]): RouteOrders[] => {
  const routes = new Map<string, RouteOrders>();

  for (const row of rows) {
    const occurrenceKey = `${row.route_id}:${row.departure_at.getTime()}`;
    const route = routes.get(occurrenceKey) ?? {
      routeId: row.route_id,
      routeName: row.route_name,
      departureAt: row.departure_at,
      companies: [],
    };
    let company = route.companies.find((item) => item.companyName === row.company_name);

    if (!company) {
      company = { companyName: row.company_name, orders: [] };
      route.companies.push(company);
    }

    let order = company.orders.find((item) => item.orderId === row.order_id);

    if (!order) {
      order = {
        orderId: row.order_id,
        orderNumber: row.order_number,
        userName: row.user_name,
        status: row.status,
        routeName: row.route_name,
        departureAt: row.departure_at,
        totalCents: row.total_cents,
        dishes: [],
      };
      company.orders.push(order);
    }

    if (row.dish_name && row.qty) {
      order.dishes.push({
        dishName: row.dish_name,
        qty: row.qty,
        basePriceCents: Number(row.base_price_cents ?? 0),
        discountPriceCents: Number(row.discount_price_cents ?? 0),
        discountedQty: Number(row.discounted_qty ?? 0),
        lineTotalCents: Number(row.line_total_cents ?? 0),
      });
    }

    routes.set(occurrenceKey, route);
  }

  return Array.from(routes.values());
};

const buildStickerOrders = (rows: TodayOrderRow[]): StickerOrder[] =>
  aggregateOrdersByCompany(rows).flatMap((company) =>
    company.orders.map((order) => ({
      ...order,
      companyName: company.companyName,
    }))
  );

const drawTableHeader = (
  doc: PDFKit.PDFDocument,
  columns: Array<{ label: string; x: number; width: number }>,
  topY: number,
  rowHeight: number
) => {
  doc.save();
  doc.rect(PAGE_MARGIN, topY, doc.page.width - PAGE_MARGIN * 2, rowHeight).fill('#E9EEF5');
  doc.fillColor('#111111').fontSize(12);

  for (const column of columns) {
    doc.text(column.label, column.x + 4, topY + 7, { width: column.width - 8 });
  }

  doc.restore();
  doc
    .moveTo(PAGE_MARGIN, topY + rowHeight)
    .lineTo(doc.page.width - PAGE_MARGIN, topY + rowHeight)
    .stroke('#B8C2CC');
};

const buildOrdersReportPdf = async (day: BusinessDay, rows: TodayOrderRow[]): Promise<Buffer> => {
  const routes = aggregateOrdersByRoute(rows);

  return createPdfBuffer((doc) => {
    doc.fontSize(20).text(`Заказы за ${day.day}`, { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(12).text(`Сформировано: ${formatDateTime(day.capturedAt)}`);
    doc.moveDown(0.8);

    if (routes.length === 0) {
      doc.fontSize(14).text('За выбранную дату заказов нет.');
      return;
    }

    const columns = [
      { label: 'Заказ', x: PAGE_MARGIN, width: 58 },
      { label: 'Сотрудник', x: PAGE_MARGIN + 58, width: 93 },
      { label: 'Компания', x: PAGE_MARGIN + 151, width: 74 },
      { label: 'Статус', x: PAGE_MARGIN + 225, width: 62 },
      { label: 'Состав', x: PAGE_MARGIN + 287, width: 150 },
      { label: 'Сумма', x: PAGE_MARGIN + 437, width: 54 },
      { label: 'Отм.', x: PAGE_MARGIN + 491, width: 32 },
    ];
    const headerHeight = 26;
    const rowHeight = 42;

    const drawRouteHeading = (route: RouteOrders, continuation = false) => {
      const contentWidth = doc.page.width - PAGE_MARGIN * 2;
      doc.fontSize(15).fillColor('#0F172A').text(
        `Рейс: ${route.routeName}${continuation ? ' (продолжение)' : ''}`,
        PAGE_MARGIN,
        doc.y,
        { width: contentWidth }
      );
      doc.fontSize(10).fillColor('#475569').text(
        `Выезд: ${formatDateTime(route.departureAt)}`,
        PAGE_MARGIN,
        doc.y,
        { width: contentWidth }
      );
      doc.moveDown(0.25);
    };

    const drawCompanyHeading = (companyName: string) => {
      doc.fontSize(12).fillColor('#0F172A').text(companyName, PAGE_MARGIN, doc.y, {
        width: doc.page.width - PAGE_MARGIN * 2,
      });
      doc.moveDown(0.15);
    };

    const drawOrdersHeader = () => {
      const headerY = doc.y;
      drawTableHeader(doc, columns, headerY, headerHeight);
      doc.y = headerY + headerHeight;
    };

    for (const route of routes) {
      ensurePageSpace(doc, doc.page.height - 180);
      drawRouteHeading(route);

      for (const company of route.companies) {
        drawCompanyHeading(company.companyName);
        drawOrdersHeader();

        company.orders.forEach((order, index) => {
          if (doc.y + rowHeight > doc.page.height - PAGE_MARGIN) {
            doc.addPage();
            applyReportFont(doc);
            drawRouteHeading(route, true);
            drawCompanyHeading(company.companyName);
            drawOrdersHeader();
          }

          const rowY = doc.y;

          if (index % 2 === 1) {
            doc.save();
            doc.rect(PAGE_MARGIN, rowY, doc.page.width - PAGE_MARGIN * 2, rowHeight).fill('#F7F9FC');
            doc.restore();
          }

          const cells = [
            { x: columns[0].x, width: columns[0].width, text: order.orderNumber ?? 'н/д' },
            { x: columns[1].x, width: columns[1].width, text: order.userName ?? 'Не указан' },
            { x: columns[2].x, width: columns[2].width, text: company.companyName },
            { x: columns[3].x, width: columns[3].width, text: ORDER_STATUS_LABELS[order.status] ?? order.status },
            {
              x: columns[4].x,
              width: columns[4].width,
              text: order.dishes.map((dish) => `${dish.dishName} x${dish.qty}`).join(', '),
            },
            { x: columns[5].x, width: columns[5].width, text: formatMoney(order.totalCents) },
          ];

          doc.fillColor('#111111').fontSize(9);

          for (const cell of cells) {
            doc.text(cell.text, cell.x + 4, rowY + 6, {
              width: cell.width - 8,
              height: rowHeight - 10,
              ellipsis: true,
            });
          }

          doc.rect(columns[6].x + 10, rowY + 14, 12, 12).lineWidth(1).stroke('#475569');
          doc
            .moveTo(PAGE_MARGIN, rowY + rowHeight)
            .lineTo(doc.page.width - PAGE_MARGIN, rowY + rowHeight)
            .stroke('#D6DEE8');
          doc.y = rowY + rowHeight;
        });

        doc.moveDown(0.6);
      }

      doc.moveDown(0.4);
    }
  });
};

const buildDishesReportPdf = async (day: BusinessDay, rows: TodayDishSummaryRow[]): Promise<Buffer> => {
  return createPdfBuffer((doc) => {
    doc.fontSize(20).text(`Список блюд за ${day.day}`, { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(12).text(`Сформировано: ${formatDateTime(day.capturedAt)}`);
    doc.moveDown(0.8);

    if (rows.length === 0) {
      doc.fontSize(14).text('За выбранную дату заказанных блюд нет.');
      return;
    }

    const columns = [
      { label: 'Блюдо', x: PAGE_MARGIN, width: 310 },
      { label: 'Количество', x: PAGE_MARGIN + 310, width: 110 },
      { label: 'Компаний', x: PAGE_MARGIN + 420, width: 110 },
    ];

    const headerY = doc.y;
    const headerHeight = 28;
    const rowHeight = 30;
    drawTableHeader(doc, columns, headerY, headerHeight);
    doc.y = headerY + headerHeight;

    rows.forEach((row, index) => {
      ensurePageSpace(doc, doc.page.height - 100);
      const rowY = doc.y;

      if (index % 2 === 1) {
        doc.save();
        doc.rect(PAGE_MARGIN, rowY, doc.page.width - PAGE_MARGIN * 2, rowHeight).fill('#F7F9FC');
        doc.restore();
      }

      doc.fontSize(12).fillColor('#111111');
      doc.text(row.dish_name, columns[0].x + 4, rowY + 7, { width: columns[0].width - 8 });
      doc.text(String(Number(row.total_qty)), columns[1].x + 4, rowY + 7, { width: columns[1].width - 8 });
      doc.text(String(Number(row.company_count)), columns[2].x + 4, rowY + 7, {
        width: columns[2].width - 8,
      });
      doc
        .moveTo(PAGE_MARGIN, rowY + rowHeight)
        .lineTo(doc.page.width - PAGE_MARGIN, rowY + rowHeight)
        .stroke('#D6DEE8');
      doc.y = rowY + rowHeight;
    });
  });
};

const formatDishPriceBreakdown = (dish: OrderDish): string => {
  const discountedQty = Math.min(Math.max(dish.discountedQty, 0), dish.qty);
  const standardQty = Math.max(dish.qty - discountedQty, 0);
  const parts: string[] = [];

  if (discountedQty > 0) {
    parts.push(`${discountedQty} x ${formatMoney(dish.discountPriceCents)}`);
  }

  if (standardQty > 0) {
    parts.push(`${standardQty} x ${formatMoney(dish.basePriceCents)}`);
  }

  const calculatedTotal = discountedQty * dish.discountPriceCents + standardQty * dish.basePriceCents;
  return `${parts.join(' + ')} = ${formatMoney(dish.lineTotalCents || calculatedTotal)}`;
};

const drawStickerCell = (
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  order: StickerOrder
) => {
  doc.save();
  doc.roundedRect(x, y, width, height, 8).lineWidth(1).stroke('#7C8A9A');
  doc.fontSize(15).fillColor('#111111').text(order.userName ?? 'Сотрудник', x + 10, y + 10, {
    width: width - 20,
    ellipsis: true,
  });
  doc.fontSize(10).fillColor('#475569').text(order.companyName, x + 10, y + 31, {
    width: width - 20,
    ellipsis: true,
  });

  const metaText = `Заказ ${order.orderNumber ?? 'н/д'} • ${order.routeName} • ${formatTime(order.departureAt)}`;
  doc.fontSize(9).fillColor('#64748B').text(metaText, x + 10, y + 48, {
    width: width - 20,
    ellipsis: true,
  });

  doc.moveTo(x + 10, y + 64).lineTo(x + width - 10, y + 64).stroke('#CBD5E1');
  doc.fontSize(11).fillColor('#0F172A').text('Состав:', x + 10, y + 70);

  if (order.dishes.length === 0) {
    doc.fontSize(10).fillColor('#111111').text('Нет позиций', x + 10, y + 88);
    doc.restore();
    return;
  }

  const itemRowHeight = 28;
  const maxRows = Math.max(1, Math.floor((height - 94) / itemRowHeight));
  const visibleDishes =
    order.dishes.length > maxRows ? order.dishes.slice(0, maxRows - 1) : order.dishes;

  visibleDishes.forEach((dish, index) => {
    const itemY = y + 86 + index * itemRowHeight;

    doc.rect(x + 10, itemY + 4, 10, 10).lineWidth(1).stroke('#475569');
    doc.fontSize(9).fillColor('#111111').text(`${dish.qty} x ${dish.dishName}`, x + 26, itemY, {
      width: width - 36,
      height: 11,
      ellipsis: true,
    });
    doc.fontSize(8).fillColor('#475569').text(formatDishPriceBreakdown(dish), x + 26, itemY + 11, {
      width: width - 36,
      height: 11,
      ellipsis: true,
    });
  });

  if (order.dishes.length > maxRows) {
    const itemY = y + 86 + visibleDishes.length * itemRowHeight;
    doc.rect(x + 10, itemY + 4, 10, 10).fill('#FFFFFF').stroke('#475569');
    doc.fontSize(8).fillColor('#475569').text(`Ещё позиций: ${order.dishes.length - maxRows + 1}`, x + 26, itemY + 3, {
      width: width - 36,
      height: 12,
      ellipsis: true,
    });
  }
  doc.restore();
};

const buildLabelsReportPdf = async (day: BusinessDay, rows: TodayOrderRow[]): Promise<Buffer> => {
  const orders = buildStickerOrders(rows);

  return createPdfBuffer((doc) => {
    doc.fontSize(20).text(`Наклейки на заказы за ${day.day}`, { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(12).text(`Сформировано: ${formatDateTime(day.capturedAt)}`);
    doc.moveDown(0.2);
    doc
      .fontSize(10)
      .fillColor('#475569')
      .text('Лист рассчитан на разрезание A4 на 8 карточек: 2 колонки x 4 ряда.');
    doc.moveDown(0.8);

    if (orders.length === 0) {
      doc.fontSize(14).fillColor('#111111').text('За выбранную дату нет заказов для печати наклеек.');
      return;
    }

    const usableWidth = doc.page.width - PAGE_MARGIN * 2 - LABEL_GAP;
    const usableHeight = doc.page.height - PAGE_MARGIN * 2 - 24 - LABEL_GAP * (LABEL_ROWS - 1);
    const cellWidth = usableWidth / LABEL_COLUMNS;
    const cellHeight = usableHeight / LABEL_ROWS;
    let startY = doc.y;

    orders.forEach((order, index) => {
      const pageIndex = index % (LABEL_COLUMNS * LABEL_ROWS);

      if (pageIndex === 0 && index > 0) {
        doc.addPage();
        applyReportFont(doc);
        startY = PAGE_MARGIN;
      }

      const row = Math.floor(pageIndex / LABEL_COLUMNS);
      const column = pageIndex % LABEL_COLUMNS;
      const x = PAGE_MARGIN + column * (cellWidth + LABEL_GAP);
      const y = startY + row * (cellHeight + LABEL_GAP);

      drawStickerCell(doc, x, y, cellWidth, cellHeight, order);
    });
  });
};

const buildDemoReportRows = (day: BusinessDay) => {
  const dishes = [
    { name: 'Тестовое горячее', qty: 2, basePrice: 32000, discountPrice: 29000, discountedQty: 1 },
    { name: 'Тестовый напиток', qty: 1, basePrice: 12000, discountPrice: 12000, discountedQty: 0 },
  ].map((dish) => ({
    dish_name: dish.name,
    qty: dish.qty,
    base_price_cents: dish.basePrice,
    discount_price_cents: dish.discountPrice,
    discounted_qty: dish.discountedQty,
    line_total_cents: (dish.qty - dish.discountedQty) * dish.basePrice + dish.discountedQty * dish.discountPrice,
  }));
  const departureAt = new Date(day.start.getTime() + (day.end.getTime() - day.start.getTime()) / 2);
  const totalCents = dishes.reduce((total, dish) => total + dish.line_total_cents, 0);
  const orders: TodayOrderRow[] = dishes.map((dish) => ({
    ...dish,
    order_id: 1,
    order_number: `TEST-RPT-${day.day}-001`,
    status: 'paid',
    total_cents: totalCents,
    company_id: 1,
    company_name: 'Тестовая компания',
    user_name: 'Тестовый сотрудник',
    route_id: 1,
    route_name: 'Тестовый рейс отчётов',
    departure_at: departureAt,
  }));
  const summary: TodayDishSummaryRow[] = dishes.map((dish) => ({
    dish_name: dish.dish_name,
    total_qty: dish.qty,
    company_count: 1,
  }));
  return { orders, summary };
};

const downloadReport = (kind: string, buildPdf: (day: BusinessDay) => Promise<Buffer>) =>
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      await requireAuthenticatedUser(req.user);
      const date = req.query.date;
      const day = date === undefined ? getBusinessDay() : getBusinessDayForDate(date);
      if (!day) throw new AppError('date must be a valid date in YYYY-MM-DD format', 400);
      const pdf = await buildPdf(day);
      const validForMs = Math.max(0, day.end.getTime() - Date.now());
      res.set({
        'Cache-Control': 'private, no-store',
        'X-Report-Day': day.day,
        'X-Report-Valid-For-Ms': String(validForMs),
      });
      res.append('Access-Control-Expose-Headers', 'X-Report-Day, X-Report-Valid-For-Ms');
      sendPdf(res, `${kind}-${date === undefined ? 'today' : day.day}.pdf`, pdf);
    } catch (error) {
      next(error);
    }
  };

export const downloadTodayOrdersReport = downloadReport(
  'orders', async (day) => buildOrdersReportPdf(day, await loadReportOrders(day))
);
export const downloadTodayDishesReport = downloadReport(
  'dishes', async (day) => buildDishesReportPdf(day, await loadReportDishSummary(day))
);
export const downloadTodayLabelsReport = downloadReport(
  'labels', async (day) => buildLabelsReportPdf(day, await loadReportOrders(day))
);

export const runTodayReportsTestRequest = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    await requireAuthenticatedUser(req.user);
    const day = getBusinessDay();
    const { orders, summary } = buildDemoReportRows(day);
    const [ordersPdf, dishesPdf, labelsPdf] = await Promise.all([
      buildOrdersReportPdf(day, orders),
      buildDishesReportPdf(day, summary),
      buildLabelsReportPdf(day, orders),
    ]);
    const archive = createZipArchive([
      { filename: 'orders-today.pdf', content: ordersPdf },
      { filename: 'dishes-today.pdf', content: dishesPdf },
      { filename: 'labels-today.pdf', content: labelsPdf },
    ]);

    sendZip(res, 'reports-test-run-today.zip', archive);
  } catch (error) {
    next(error);
  }
};
