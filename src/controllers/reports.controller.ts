import { NextFunction, Response } from 'express';
import db from '../db/knex';
import { AppError } from '../errors/AppError';
import { AuthRequest } from '../middleware/authMiddleware';
import { OrderStatusHistoryModel, UserModel } from '../models';
import { applyReportFont, createPdfBuffer, createZipArchive, sendPdf, sendZip } from '../utils/reportFiles';

type TodayOrderRow = {
  order_id: number;
  order_number: string | null;
  status: string;
  total_cents: number;
  company_id: number;
  company_name: string;
  user_name: string | null;
  route_name: string;
  departure_at: string | Date;
  dish_name: string | null;
  qty: number | null;
};

type TodayDishSummaryRow = {
  dish_name: string;
  total_qty: number;
  company_count: number;
};

type OrderDish = {
  dishName: string;
  qty: number;
};

type AggregatedOrder = {
  orderNumber: string | null;
  userName: string | null;
  status: string;
  routeName: string;
  departureAt: string | Date;
  totalCents: number;
  dishes: OrderDish[];
};

type CompanyOrders = {
  companyName: string;
  orders: AggregatedOrder[];
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

const USER_COLUMNS = [
  'id',
  'email',
  'role',
  'company_id',
  'password_hash',
  'email_verified_at',
  'full_name',
  'phone',
  'avatar_url',
  'order_limit_cents',
  'debt_cents',
  'created_at',
  'updated_at',
  'deleted_at',
] as const;

const getTodayRange = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return { start, end };
};

const formatDateTime = (value: string | Date): string =>
  new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

const formatTime = (value: string | Date): string =>
  new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

const formatMoney = (cents: number): string => `${(cents / 100).toFixed(2)} ₽`;

const ensurePageSpace = (doc: PDFKit.PDFDocument, minY: number) => {
  if (doc.y > minY) {
    doc.addPage();
    applyReportFont(doc);
  }
};

const requireAdmin = async (req: AuthRequest): Promise<UserModel> => {
  if (!req.user?.id) {
    throw new AppError('Unauthorized', 401);
  }

  const user = await db<UserModel>('users')
    .select(...USER_COLUMNS)
    .where({ id: req.user.id })
    .whereNull('deleted_at')
    .first();

  if (!user) {
    throw new AppError('User not found', 404);
  }

  if (user.role !== 'admin') {
    throw new AppError('Forbidden', 403);
  }

  return user;
};

const loadTodayOrders = async (): Promise<TodayOrderRow[]> => {
  const { start, end } = getTodayRange();

  return db('orders as o')
    .join('companies as c', 'c.id', 'o.company_id')
    .join('users as u', 'u.id', 'o.user_id')
    .join('routes as r', 'r.id', 'o.route_id')
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
      'r.name as route_name',
      'r.departure_at',
      'd.name as dish_name',
      'oi.qty'
    )
    .whereNull('o.deleted_at')
    .whereNull('c.deleted_at')
    .whereNull('u.deleted_at')
    .whereNull('r.deleted_at')
    .where('r.departure_at', '>=', start)
    .andWhere('r.departure_at', '<', end)
    .orderBy('c.name', 'asc')
    .orderBy('u.full_name', 'asc')
    .orderBy('o.id', 'asc')
    .orderBy('d.name', 'asc');
};

const loadTodayDishSummary = async (): Promise<TodayDishSummaryRow[]> => {
  const { start, end } = getTodayRange();

  return db('orders as o')
    .join('routes as r', 'r.id', 'o.route_id')
    .join('order_items as oi', 'oi.order_id', 'o.id')
    .join('dishes as d', 'd.id', 'oi.dish_id')
    .whereNull('o.deleted_at')
    .whereNull('r.deleted_at')
    .where('r.departure_at', '>=', start)
    .andWhere('r.departure_at', '<', end)
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

    let order = company.orders.find((item) => item.orderNumber === row.order_number);

    if (!order) {
      order = {
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
      });
    }

    companyMap.set(companyKey, company);
  }

  return Array.from(companyMap.values());
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

const buildOrdersReportPdf = async (): Promise<Buffer> => {
  const companies = aggregateOrdersByCompany(await loadTodayOrders());

  return createPdfBuffer((doc) => {
    doc.fontSize(20).text('Заказы на сегодня', { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(12).text(`Сформировано: ${formatDateTime(new Date())}`);
    doc.moveDown(0.8);

    if (companies.length === 0) {
      doc.fontSize(14).text('На сегодня заказов нет.');
      return;
    }

    const columns = [
      { label: 'Заказ', x: PAGE_MARGIN, width: 84 },
      { label: 'Сотрудник', x: PAGE_MARGIN + 84, width: 116 },
      { label: 'Статус', x: PAGE_MARGIN + 200, width: 90 },
      { label: 'Рейс', x: PAGE_MARGIN + 290, width: 95 },
      { label: 'Выезд', x: PAGE_MARGIN + 385, width: 65 },
      { label: 'Состав', x: PAGE_MARGIN + 450, width: 96 },
      { label: 'Сумма', x: PAGE_MARGIN + 546, width: 58 },
    ];

    for (const company of companies) {
      ensurePageSpace(doc, doc.page.height - 180);
      doc.fontSize(15).fillColor('#0F172A').text(company.companyName);
      doc.moveDown(0.25);

      const headerY = doc.y;
      const headerHeight = 26;
      const rowHeight = 42;
      drawTableHeader(doc, columns, headerY, headerHeight);
      doc.y = headerY + headerHeight;

      company.orders.forEach((order, index) => {
        ensurePageSpace(doc, doc.page.height - 120);
        const rowY = doc.y;

        if (index % 2 === 1) {
          doc.save();
          doc.rect(PAGE_MARGIN, rowY, doc.page.width - PAGE_MARGIN * 2, rowHeight).fill('#F7F9FC');
          doc.restore();
        }

        const cells = [
          { x: PAGE_MARGIN, width: 84, text: order.orderNumber ?? 'н/д' },
          { x: PAGE_MARGIN + 84, width: 116, text: order.userName ?? 'Не указан' },
          { x: PAGE_MARGIN + 200, width: 90, text: ORDER_STATUS_LABELS[order.status] ?? order.status },
          { x: PAGE_MARGIN + 290, width: 95, text: order.routeName },
          { x: PAGE_MARGIN + 385, width: 65, text: formatTime(order.departureAt) },
          {
            x: PAGE_MARGIN + 450,
            width: 96,
            text: order.dishes.map((dish) => `${dish.dishName} x${dish.qty}`).join(', '),
          },
          { x: PAGE_MARGIN + 546, width: 58, text: formatMoney(order.totalCents) },
        ];

        doc.fillColor('#111111').fontSize(11);

        for (const cell of cells) {
          doc.text(cell.text, cell.x + 4, rowY + 6, {
            width: cell.width - 8,
            height: rowHeight - 10,
            ellipsis: true,
          });
        }

        doc
          .moveTo(PAGE_MARGIN, rowY + rowHeight)
          .lineTo(doc.page.width - PAGE_MARGIN, rowY + rowHeight)
          .stroke('#D6DEE8');
        doc.y = rowY + rowHeight;
      });

      doc.moveDown(0.9);
    }
  });
};

const buildDishesReportPdf = async (): Promise<Buffer> => {
  const rows = await loadTodayDishSummary();

  return createPdfBuffer((doc) => {
    doc.fontSize(20).text('Список блюд на сегодня', { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(12).text(`Сформировано: ${formatDateTime(new Date())}`);
    doc.moveDown(0.8);

    if (rows.length === 0) {
      doc.fontSize(14).text('На сегодня заказанных блюд нет.');
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

  const itemsText = order.dishes.length
    ? order.dishes.map((dish) => `${dish.dishName} x${dish.qty}`).join(', ')
    : 'Нет позиций';

  doc.fontSize(10).fillColor('#111111').text(itemsText, x + 10, y + 86, {
    width: width - 20,
    height: height - 96,
    ellipsis: true,
  });
  doc.restore();
};

const buildLabelsReportPdf = async (): Promise<Buffer> => {
  const orders = buildStickerOrders(await loadTodayOrders());

  return createPdfBuffer((doc) => {
    doc.fontSize(20).text('Наклейки на заказы', { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(12).text(`Сформировано: ${formatDateTime(new Date())}`);
    doc.moveDown(0.2);
    doc
      .fontSize(10)
      .fillColor('#475569')
      .text('Лист рассчитан на разрезание A4 на 8 карточек: 2 колонки x 4 ряда.');
    doc.moveDown(0.8);

    if (orders.length === 0) {
      doc.fontSize(14).fillColor('#111111').text('На сегодня нет заказов для печати наклеек.');
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

const cleanupTemporaryReportData = async (orderIds: number[], routeIds: number[]) => {
  if (orderIds.length > 0) {
    await db('order_status_history').whereIn('order_id', orderIds).delete();
    await db('order_items').whereIn('order_id', orderIds).delete();
    await db('orders').whereIn('id', orderIds).delete();
  }

  if (routeIds.length > 0) {
    await db('route_companies').whereIn('route_id', routeIds).delete();
    await db('routes').whereIn('id', routeIds).delete();
  }
};

const createTemporaryOrdersForReportTest = async (adminId: number) => {
  const createdOrderIds: number[] = [];
  const createdRouteIds: number[] = [];
  const testOrderPrefix = `TEST-RPT-${Date.now()}`;
  const now = new Date();
  const departureAt = new Date(now);
  departureAt.setHours(Math.max(now.getHours() + 2, 12), 0, 0, 0);
  const cutoffAt = new Date(departureAt.getTime() - 60 * 60 * 1000);

  const routeInsert = await db('routes').insert({
    name: `Тестовый рейс отчётов ${testOrderPrefix}`,
    departure_at: departureAt,
    order_acceptance_ends_at: cutoffAt,
    description: 'Временный рейс для проверки PDF-отчётов',
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });

  const routeId = Array.isArray(routeInsert) ? Number(routeInsert[0]) : Number(routeInsert);
  createdRouteIds.push(routeId);

  await db('route_companies').insert([
    { route_id: routeId, company_id: 1, created_at: now },
    { route_id: routeId, company_id: 2, created_at: now },
  ]);

  const testOrders = [
    {
      order_number: `${testOrderPrefix}-001`,
      user_id: 4,
      company_id: 1,
      status: 'created',
      items: [
        { dish_id: 1, qty: 2, price_cents: 59900 },
        { dish_id: 4, qty: 1, price_cents: 14900 },
      ],
    },
    {
      order_number: `${testOrderPrefix}-002`,
      user_id: 5,
      company_id: 1,
      status: 'paid',
      items: [{ dish_id: 2, qty: 1, price_cents: 74900 }],
    },
    {
      order_number: `${testOrderPrefix}-003`,
      user_id: 6,
      company_id: 2,
      status: 'paid',
      items: [
        { dish_id: 2, qty: 2, price_cents: 74900 },
        { dish_id: 4, qty: 3, price_cents: 14900 },
      ],
    },
  ] as const;

  for (const testOrder of testOrders) {
    const subtotal = testOrder.items.reduce((sum, item) => sum + item.qty * item.price_cents, 0);

    const orderInsert = await db('orders').insert({
      order_number: testOrder.order_number,
      user_id: testOrder.user_id,
      company_id: testOrder.company_id,
      route_id: routeId,
      status: testOrder.status,
      subtotal_cents: subtotal,
      delivery_fee_cents: 0,
      discount_cents: 0,
      total_cents: subtotal,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      cancelled_at: null,
    });

    const orderId = Array.isArray(orderInsert) ? Number(orderInsert[0]) : Number(orderInsert);
    createdOrderIds.push(orderId);

    await db('order_items').insert(
      testOrder.items.map((item) => ({
        order_id: orderId,
        dish_id: item.dish_id,
        qty: item.qty,
        price_cents: item.price_cents,
        line_total_cents: item.qty * item.price_cents,
        created_at: now,
        updated_at: now,
      }))
    );

    await db<OrderStatusHistoryModel>('order_status_history').insert({
      order_id: orderId,
      from_status: null,
      to_status: testOrder.status,
      changed_by_user_id: adminId,
      created_at: now,
    });
  }

  return { createdOrderIds, createdRouteIds };
};

export const downloadTodayOrdersReport = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    await requireAdmin(req);
    sendPdf(res, 'orders-today.pdf', await buildOrdersReportPdf());
  } catch (error) {
    next(error);
  }
};

export const downloadTodayDishesReport = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    await requireAdmin(req);
    sendPdf(res, 'dishes-today.pdf', await buildDishesReportPdf());
  } catch (error) {
    next(error);
  }
};

export const downloadTodayLabelsReport = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    await requireAdmin(req);
    sendPdf(res, 'labels-today.pdf', await buildLabelsReportPdf());
  } catch (error) {
    next(error);
  }
};

export const runTodayReportsTestRequest = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  let createdOrderIds: number[] = [];
  let createdRouteIds: number[] = [];

  try {
    const admin = await requireAdmin(req);
    const temporaryData = await createTemporaryOrdersForReportTest(admin.id);

    createdOrderIds = temporaryData.createdOrderIds;
    createdRouteIds = temporaryData.createdRouteIds;

    const [ordersPdf, dishesPdf, labelsPdf] = await Promise.all([
      buildOrdersReportPdf(),
      buildDishesReportPdf(),
      buildLabelsReportPdf(),
    ]);

    const archive = createZipArchive([
      { filename: 'orders-today.pdf', content: ordersPdf },
      { filename: 'dishes-today.pdf', content: dishesPdf },
      { filename: 'labels-today.pdf', content: labelsPdf },
    ]);

    await cleanupTemporaryReportData(createdOrderIds, createdRouteIds);
    sendZip(res, 'reports-test-run-today.zip', archive);
  } catch (error) {
    await cleanupTemporaryReportData(createdOrderIds, createdRouteIds);
    next(error);
  }
};
