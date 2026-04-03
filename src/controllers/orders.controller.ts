import { NextFunction, Response } from 'express';
import db from '../db/knex';
import { AppError } from '../errors/AppError';
import { AuthRequest } from '../middleware/authMiddleware';
import {
  CompanyModel,
  DishModel,
  OrderItemModel,
  OrderModel,
  OrderStatusHistoryModel,
  RouteModel,
  UserModel,
} from '../models';
import { hasCompanyManagementAccess } from '../utils/companyAccess';
import { toNullableIsoString } from '../utils/dateMapper';
import { requireEntity } from '../utils/entityGuards';
import { calculateOrderBilling } from '../utils/orderBilling';
import { parseRequiredId } from '../utils/requestParams';
import {
  requireAuthenticatedUser,
  USER_COLUMNS,
} from '../utils/userQueries';

const orderColumns = [
  'id',
  'order_number',
  'user_id',
  'company_id',
  'route_id',
  'status',
  'subtotal_cents',
  'delivery_fee_cents',
  'discount_cents',
  'total_cents',
  'company_paid_cents',
  'employee_debt_cents',
  'created_at',
  'updated_at',
  'deleted_at',
  'cancelled_at',
] as const;

const dishColumns = [
  'id',
  'category_id',
  'name',
  'description',
  'image_url',
  'base_price_cents',
  'discount_price_cents',
  'is_active',
  'created_at',
  'updated_at',
  'deleted_at',
] as const;

const routeColumns = [
  'id',
  'name',
  'departure_at',
  'order_acceptance_ends_at',
  'description',
  'created_at',
  'updated_at',
  'deleted_at',
] as const;

const hasActiveSubscription = (company?: Pick<CompanyModel, 'subscription_expires_at'> | null): boolean =>
  Boolean(company?.subscription_expires_at && new Date(company.subscription_expires_at).getTime() > Date.now());

type RequestedOrderItem = {
  dishId: number;
  qty: number;
};

type OrderPricingSource = {
  dishId: number;
  categoryId: number;
  qty: number;
  basePriceCents: number;
  discountPriceCents: number;
};

type PricedOrderItem = OrderPricingSource & {
  discountedQty: number;
  priceCents: number;
  lineTotalCents: number;
};

const toOrderDto = (order: OrderModel, items?: OrderItemModel[]) => ({
  id: order.id,
  orderNumber: order.order_number,
  userId: order.user_id,
  companyId: order.company_id,
  routeId: order.route_id,
  status: order.status,
  subtotalCents: order.subtotal_cents,
  deliveryFeeCents: order.delivery_fee_cents,
  discountCents: order.discount_cents,
  totalCents: order.total_cents,
  companyPaidCents: order.company_paid_cents,
  employeeDebtCents: order.employee_debt_cents,
  createdAt: toNullableIsoString(order.created_at),
  updatedAt: toNullableIsoString(order.updated_at),
  items: items?.map((item) => ({
    dishId: item.dish_id,
    categoryId: item.category_id,
    qty: item.qty,
    priceCents: item.price_cents,
    basePriceCents: item.base_price_cents,
    discountPriceCents: item.discount_price_cents,
    discountedQty: item.discounted_qty,
    lineTotalCents: item.line_total_cents,
  })),
});

const loadCurrentUser = async (req: AuthRequest): Promise<UserModel> => {
  return requireAuthenticatedUser(req.user);
};

const loadOrderById = async (id: number): Promise<OrderModel | undefined> =>
  db<OrderModel>('orders')
    .select(...orderColumns)
    .where({ id })
    .whereNull('deleted_at')
    .first();

const loadOrderItems = async (orderId: number): Promise<OrderItemModel[]> =>
  db<OrderItemModel>('order_items')
    .select(
      'order_id',
      'dish_id',
      'category_id',
      'qty',
      'price_cents',
      'base_price_cents',
      'discount_price_cents',
      'discounted_qty',
      'line_total_cents',
      'created_at',
      'updated_at'
    )
    .where({ order_id: orderId })
    .orderBy('dish_id', 'asc');

const requireOrder = async (id: number): Promise<OrderModel> =>
  requireEntity(() => loadOrderById(id), 'Order not found');

const requireDish = async (id: number): Promise<DishModel> => {
  const dish = await requireEntity(
    () =>
      db<DishModel>('dishes')
        .select(...dishColumns)
        .where({ id })
        .whereNull('deleted_at')
        .first(),
    'Dish not found'
  );

  if (!dish.is_active) {
    throw new AppError('Dish not found', 404);
  }

  return dish;
};

const loadCompany = async (id: number): Promise<Pick<CompanyModel, 'id' | 'address' | 'subscription_expires_at'> | undefined> =>
  db<CompanyModel>('companies')
    .select('id', 'address', 'subscription_expires_at', 'debt_cents')
    .where({ id })
    .whereNull('deleted_at')
    .first();

const loadRouteById = async (
  id: number
): Promise<Pick<RouteModel, 'id' | 'departure_at' | 'order_acceptance_ends_at'> | undefined> =>
  db<RouteModel>('routes')
    .select('id', 'departure_at', 'order_acceptance_ends_at')
    .where({ id })
    .whereNull('deleted_at')
    .first();

const getAvailableRouteForCompany = async (
  companyId: number
): Promise<Pick<RouteModel, 'id' | 'departure_at' | 'order_acceptance_ends_at'> | undefined> =>
  db<RouteModel>('routes as r')
    .join('route_companies as rc', 'rc.route_id', 'r.id')
    .select('r.id', 'r.departure_at', 'r.order_acceptance_ends_at')
    .where('rc.company_id', companyId)
    .whereNull('r.deleted_at')
    .andWhere('r.order_acceptance_ends_at', '>', new Date())
    .andWhere('r.departure_at', '>', new Date())
    .orderBy('r.departure_at', 'asc')
    .first();

const getTodayBounds = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return { start, end };
};

const normalizeRequestedItems = (items: RequestedOrderItem[]): RequestedOrderItem[] => {
  const aggregated = new Map<number, number>();

  for (const item of items) {
    aggregated.set(item.dishId, (aggregated.get(item.dishId) ?? 0) + item.qty);
  }

  return Array.from(aggregated.entries())
    .map(([dishId, qty]) => ({ dishId, qty }))
    .sort((left, right) => left.dishId - right.dishId);
};

const buildPricedOrderItems = (
  items: OrderPricingSource[],
  hasSubscription: boolean
): PricedOrderItem[] => {
  const pricedItems: PricedOrderItem[] = items.map((item) => ({
    ...item,
    discountedQty: 0,
    priceCents: item.basePriceCents,
    lineTotalCents: item.qty * item.basePriceCents,
  }));

  if (!hasSubscription) {
    return pricedItems;
  }

  const cheapestItemByCategory = new Map<number, PricedOrderItem>();

  for (const item of pricedItems) {
    if (item.qty < 1) {
      continue;
    }

    const current = cheapestItemByCategory.get(item.categoryId);

    if (
      !current ||
      item.discountPriceCents < current.discountPriceCents ||
      (item.discountPriceCents === current.discountPriceCents && item.basePriceCents < current.basePriceCents) ||
      (item.discountPriceCents === current.discountPriceCents &&
        item.basePriceCents === current.basePriceCents &&
        item.dishId < current.dishId)
    ) {
      cheapestItemByCategory.set(item.categoryId, item);
    }
  }

  for (const item of pricedItems) {
    const discountedQty = cheapestItemByCategory.get(item.categoryId)?.dishId === item.dishId ? 1 : 0;
    const fullPriceQty = item.qty - discountedQty;

    item.discountedQty = discountedQty;
    item.priceCents = discountedQty > 0 ? item.discountPriceCents : item.basePriceCents;
    item.lineTotalCents = item.basePriceCents * fullPriceQty + item.discountPriceCents * discountedQty;
  }

  return pricedItems;
};

const loadPricingSourcesForRequestedItems = async (
  items: RequestedOrderItem[]
): Promise<OrderPricingSource[]> => {
  const normalizedItems = normalizeRequestedItems(items);
  const dishesById = new Map<number, DishModel>();

  for (const item of normalizedItems) {
    const dish = await requireDish(item.dishId);
    dishesById.set(item.dishId, dish);
  }

  return normalizedItems.map((item) => {
    const dish = dishesById.get(item.dishId);

    if (!dish) {
      throw new AppError('Dish not found', 404);
    }

    return {
      dishId: item.dishId,
      categoryId: dish.category_id,
      qty: item.qty,
      basePriceCents: dish.base_price_cents,
      discountPriceCents: dish.discount_price_cents,
    };
  });
};

const ensureUserCanCreateOnlyOneOrderPerDay = async (userId: number): Promise<void> => {
  const { start, end } = getTodayBounds();
  const existingOrder = await db<OrderModel>('orders')
    .select('id')
    .where({ user_id: userId })
    .whereNull('deleted_at')
    .whereNot('status', 'cancelled')
    .andWhere('created_at', '>=', start)
    .andWhere('created_at', '<', end)
    .first();

  // if (existingOrder) {
  //   throw new AppError('User can create only one order per day', 409);
  // }
};

const requireOrderViewer = async (req: AuthRequest, order: OrderModel): Promise<UserModel> => {
  const user = await loadCurrentUser(req);

  if (hasCompanyManagementAccess(user, order.company_id)) {
    return user;
  }

  if (user.id === order.user_id) {
    return user;
  }

  throw new AppError('Forbidden', 403);
};

const requireOrderEditor = async (req: AuthRequest, order: OrderModel): Promise<UserModel> => {
  const user = await requireOrderViewer(req, order);

  if (user.role === 'admin' || user.role === 'manager' || user.id === order.user_id) {
    return user;
  }

  throw new AppError('Forbidden', 403);
};

const requireManagerOrAdminForOrder = async (req: AuthRequest, order: OrderModel): Promise<UserModel> => {
  const user = await loadCurrentUser(req);

  if (hasCompanyManagementAccess(user, order.company_id)) {
    return user;
  }

  throw new AppError('Forbidden', 403);
};

const ensureOrderIsEditable = async (order: OrderModel) => {
  if (order.status !== 'created') {
    throw new AppError('Only created orders can be edited', 409);
  }

  const route = await loadRouteById(order.route_id);

  if (!route) {
    throw new AppError('Route not found', 404);
  }

  if (new Date(route.order_acceptance_ends_at).getTime() <= Date.now()) {
    throw new AppError('Order acceptance time has ended for this route', 409);
  }
};

const recalculateOrderTotals = async (trx: typeof db, orderId: number): Promise<void> => {
  const order = await trx<OrderModel>('orders').select(...orderColumns).where({ id: orderId }).first();

  if (!order) {
    throw new AppError('Order not found', 404);
  }

  const user = await trx<UserModel>('users')
    .select(...USER_COLUMNS)
    .where({ id: order.user_id })
    .whereNull('deleted_at')
    .first();

  if (!user) {
    throw new AppError('User not found', 404);
  }

  const company = await trx<CompanyModel>('companies')
    .select('id', 'subscription_expires_at')
    .where({ id: order.company_id })
    .whereNull('deleted_at')
    .first();

  if (!company) {
    throw new AppError('Company not found', 404);
  }

  const items = await trx<OrderItemModel>('order_items')
    .select(
      'order_id',
      'dish_id',
      'category_id',
      'qty',
      'price_cents',
      'base_price_cents',
      'discount_price_cents',
      'discounted_qty',
      'line_total_cents',
      'created_at',
      'updated_at'
    )
    .where({ order_id: orderId })
    .orderBy('dish_id', 'asc');

  const repricedItems = buildPricedOrderItems(
    items.map((item) => ({
      dishId: item.dish_id,
      categoryId: item.category_id,
      qty: item.qty,
      basePriceCents: item.base_price_cents,
      discountPriceCents: item.discount_price_cents,
    })),
    hasActiveSubscription(company)
  );

  const now = new Date();
  for (const item of repricedItems) {
    await trx('order_items')
      .where({ order_id: orderId, dish_id: item.dishId })
      .update({
        price_cents: item.priceCents,
        discounted_qty: item.discountedQty,
        line_total_cents: item.lineTotalCents,
        updated_at: now,
      });
  }

  const subtotalCents = repricedItems.reduce((sum, item) => sum + item.lineTotalCents, 0);
  const totalCents = Math.max(subtotalCents + order.delivery_fee_cents - order.discount_cents, 0);
  const billing = calculateOrderBilling(totalCents, {
    orderLimitCents: user.order_limit_cents,
  });

  await trx('orders').where({ id: orderId }).update({
    subtotal_cents: subtotalCents,
    total_cents: totalCents,
    company_paid_cents: billing.companyPaidCents,
    employee_debt_cents: billing.employeeDebtCents,
    updated_at: new Date(),
  });
};

const insertStatusHistory = async (
  trx: typeof db,
  payload: Omit<OrderStatusHistoryModel, 'id'>
): Promise<void> => {
  await trx('order_status_history').insert(payload);
};

const getNextOrderNumber = async (): Promise<string> => {
  const now = new Date();
  const y = now.getFullYear().toString();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const prefix = `${y}${m}${d}`;
  const countRow = await db<OrderModel>('orders')
    .where('order_number', 'like', `${prefix}-%`)
    .count<{ count: number }>('id as count')
    .first();
  const nextNumber = String(Number(countRow?.count ?? 0) + 1).padStart(6, '0');
  return `${prefix}-${nextNumber}`;
};

const parseCreateOrderItems = (payload: unknown): RequestedOrderItem[] => {
  if (!Array.isArray(payload) || payload.length === 0) {
    throw new AppError('Order items are required', 400);
  }

  return payload.map((item) => {
    const dishId = Number((item as { dishId?: unknown })?.dishId);
    const qty = Number((item as { qty?: unknown })?.qty);

    if (!dishId || !qty || qty < 1) {
      throw new AppError('Each order item must include dishId and qty >= 1', 400);
    }

    return { dishId, qty };
  });
};

const calculateDraftOrderFromItems = async (
  companyId: number,
  items: RequestedOrderItem[],
  user: Pick<UserModel, 'order_limit_cents'>
) => {
  const company = await loadCompany(companyId);

  if (!company) {
    throw new AppError('Company not found', 404);
  }

  const pricedItems = buildPricedOrderItems(
    await loadPricingSourcesForRequestedItems(items),
    hasActiveSubscription(company)
  );

  const subtotalCents = pricedItems.reduce((sum, item) => sum + item.lineTotalCents, 0);
  const totalCents = subtotalCents;
  const billing = calculateOrderBilling(totalCents, {
    orderLimitCents: user.order_limit_cents,
  });

  return {
    subtotalCents,
    totalCents,
    companyPaidCents: billing.companyPaidCents,
    employeeDebtCents: billing.employeeDebtCents,
    items: pricedItems,
  };
};

export const getOrders = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const currentUser = await loadCurrentUser(req);

    const query = db<OrderModel>('orders')
      .select(...orderColumns)
      .whereNull('deleted_at')
      .orderBy('id', 'desc');

  if (currentUser.role === 'manager' && currentUser.company_id) {
    query.andWhere('company_id', currentUser.company_id);
  }

  if (req.query.status) {
    query.andWhere('status', String(req.query.status));
  }

  if (req.query.companyId && currentUser.role === 'admin') {
    query.andWhere('company_id', Number(req.query.companyId));
  }

  if (req.query.userId) {
    query.andWhere('user_id', Number(req.query.userId));
  }

  if (req.query.routeId) {
    query.andWhere('route_id', Number(req.query.routeId));
  }

    const orders = await query;
    res.json(orders.map((order) => toOrderDto(order)));
  } catch (error) {
    next(error);
  }
};

export const getOrderById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const orderId = parseRequiredId(req.params.id, 'Order id');

    const order = await requireOrder(orderId);
    await requireOrderViewer(req, order);
    const items = await loadOrderItems(orderId);

    res.json(toOrderDto(order, items));
  } catch (error) {
    next(error);
  }
};

export const createOrder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const currentUser = await loadCurrentUser(req);
    const items = parseCreateOrderItems(req.body.items);

    if (!currentUser.company_id) {
      throw new AppError('User must belong to a company to create an order', 409);
    }

    await ensureUserCanCreateOnlyOneOrderPerDay(currentUser.id);

    const companyId = currentUser.company_id;
    const company = await loadCompany(companyId);

    if (!company) {
      throw new AppError('Company not found', 404);
    }

    const route = await getAvailableRouteForCompany(companyId);

    if (!route) {
      throw new AppError('No active route is available for this company', 409);
    }

    const now = new Date();
    const orderNumber = await getNextOrderNumber();
    const pricedItems = buildPricedOrderItems(
      await loadPricingSourcesForRequestedItems(items),
      hasActiveSubscription(company)
    );

    const inserted = await db.transaction(async (trx) => {
      const result = await trx('orders').insert({
        order_number: orderNumber,
        user_id: currentUser.id,
        company_id: companyId,
        route_id: route.id,
        status: 'created',
        subtotal_cents: 0,
        delivery_fee_cents: 0,
        discount_cents: 0,
        total_cents: 0,
        company_paid_cents: 0,
        employee_debt_cents: 0,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        cancelled_at: null,
      });

      const orderId = Array.isArray(result) ? Number(result[0]) : Number(result);

      await insertStatusHistory(trx, {
        order_id: orderId,
        from_status: null,
        to_status: 'created',
        changed_by_user_id: currentUser.id,
        created_at: now,
      });

      for (const item of pricedItems) {
        await trx('order_items').insert({
          order_id: orderId,
          dish_id: item.dishId,
          category_id: item.categoryId,
          qty: item.qty,
          price_cents: item.priceCents,
          base_price_cents: item.basePriceCents,
          discount_price_cents: item.discountPriceCents,
          discounted_qty: item.discountedQty,
          line_total_cents: item.lineTotalCents,
          created_at: now,
          updated_at: now,
        });
      }

      await recalculateOrderTotals(trx, orderId);

      return orderId;
    });

    const order = await requireOrder(inserted);
    const createdItems = await loadOrderItems(inserted);
    res.status(201).json(toOrderDto(order, createdItems));
  } catch (error) {
    next(error);
  }
};

export const calculateOrder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const currentUser = await loadCurrentUser(req);
    const items = parseCreateOrderItems(req.body.items);

    if (!currentUser.company_id) {
      throw new AppError('User must belong to a company to calculate an order', 409);
    }

    const calculated = await calculateDraftOrderFromItems(currentUser.company_id, items, currentUser);

    res.json(calculated);
  } catch (error) {
    next(error);
  }
};

export const updateOrder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const orderId = parseRequiredId(req.params.id, 'Order id');

    const order = await requireOrder(orderId);
    await requireOrderEditor(req, order);

    if (['completed', 'cancelled'].includes(order.status)) {
      throw new AppError('Completed or cancelled orders cannot be updated', 409);
    }

    await ensureOrderIsEditable(order);

    const patch: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if ('deliveryFeeCents' in req.body) {
      patch.delivery_fee_cents = Number(req.body.deliveryFeeCents);
    }
    if ('discountCents' in req.body) {
      patch.discount_cents = Number(req.body.discountCents);
    }

    await db.transaction(async (trx) => {
      await trx('orders').where({ id: orderId }).update(patch);
      await recalculateOrderTotals(trx, orderId);
    });

    const updatedOrder = await requireOrder(orderId);
    const items = await loadOrderItems(orderId);
    res.json(toOrderDto(updatedOrder, items));
  } catch (error) {
    next(error);
  }
};

export const cancelOrder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const orderId = parseRequiredId(req.params.id, 'Order id');

    const order = await requireOrder(orderId);
    const currentUser = await requireOrderEditor(req, order);

    if (['completed', 'cancelled'].includes(order.status)) {
      throw new AppError('Order cannot be cancelled', 409);
    }

    await ensureOrderIsEditable(order);

    const now = new Date();
    await db.transaction(async (trx) => {
      await trx('orders').where({ id: orderId }).update({
        status: 'cancelled',
        cancelled_at: now,
        updated_at: now,
      });

      await insertStatusHistory(trx, {
        order_id: orderId,
        from_status: order.status,
        to_status: 'cancelled',
        changed_by_user_id: currentUser.id,
        created_at: now,
      });
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const addOrderDish = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const orderId = parseRequiredId(req.params.id, 'Order id');
    const dishId = Number(req.body.dishId);
    const qty = Number(req.body.qty);

    if (!dishId || !qty || qty < 1) {
      throw new AppError('order id, dishId, and qty >= 1 are required', 400);
    }

    const order = await requireOrder(orderId);
    await requireOrderEditor(req, order);
    await ensureOrderIsEditable(order);

    const dish = await requireDish(dishId);
    const now = new Date();

    await db.transaction(async (trx) => {
      const existingItem = await trx<OrderItemModel>('order_items')
        .where({ order_id: orderId, dish_id: dishId })
        .first();

      if (existingItem) {
        const nextQty = existingItem.qty + qty;
        await trx('order_items').where({ order_id: orderId, dish_id: dishId }).update({
          qty: nextQty,
          line_total_cents: nextQty * existingItem.price_cents,
          updated_at: now,
        });
      } else {
        await trx('order_items').insert({
          order_id: orderId,
          dish_id: dishId,
          category_id: dish.category_id,
          qty,
          price_cents: dish.base_price_cents,
          base_price_cents: dish.base_price_cents,
          discount_price_cents: dish.discount_price_cents,
          discounted_qty: 0,
          line_total_cents: qty * dish.base_price_cents,
          created_at: now,
          updated_at: now,
        });
      }

      await recalculateOrderTotals(trx, orderId);
    });

    const updatedOrder = await requireOrder(orderId);
    const items = await loadOrderItems(orderId);
    res.json(toOrderDto(updatedOrder, items));
  } catch (error) {
    next(error);
  }
};

export const updateOrderDish = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const orderId = parseRequiredId(req.params.id, 'Order id');
    const dishId = Number(req.body.dishId);
    const qty = Number(req.body.qty);

    if (!dishId || !qty || qty < 1) {
      throw new AppError('order id, dishId, and qty >= 1 are required', 400);
    }

    const order = await requireOrder(orderId);
    await requireOrderEditor(req, order);
    await ensureOrderIsEditable(order);

    await db.transaction(async (trx) => {
      const item = await trx<OrderItemModel>('order_items')
        .where({ order_id: orderId, dish_id: dishId })
        .first();

      if (!item) {
        throw new AppError('Order item not found', 404);
      }

      await trx('order_items').where({ order_id: orderId, dish_id: dishId }).update({
        qty,
        discounted_qty: 0,
        updated_at: new Date(),
      });

      await recalculateOrderTotals(trx, orderId);
    });

    const updatedOrder = await requireOrder(orderId);
    const items = await loadOrderItems(orderId);
    res.json(toOrderDto(updatedOrder, items));
  } catch (error) {
    next(error);
  }
};

export const removeOrderDish = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const orderId = parseRequiredId(req.params.id, 'Order id');
    const dishId = parseRequiredId(req.params.dishId, 'Dish id');

    const order = await requireOrder(orderId);
    await requireOrderEditor(req, order);
    await ensureOrderIsEditable(order);

    await db.transaction(async (trx) => {
      const deleted = await trx('order_items').where({ order_id: orderId, dish_id: dishId }).delete();

      if (!deleted) {
        throw new AppError('Order item not found', 404);
      }

      await recalculateOrderTotals(trx, orderId);
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const patchOrderStatus = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const orderId = parseRequiredId(req.params.id, 'Order id');
    const nextStatus = String(req.body.status || '') as OrderModel['status'];

    if (!nextStatus) {
      throw new AppError('Order id and status are required', 400);
    }

    const order = await requireOrder(orderId);
    const currentUser = await requireOrderViewer(req, order);

    const allowedTransitions: Record<OrderModel['status'], OrderModel['status'][]> = {
      created: ['paid', 'cancelled'],
      paid: ['cooking', 'cancelled'],
      cooking: ['delivering', 'cancelled'],
      delivering: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    };

    if (!allowedTransitions[order.status].includes(nextStatus)) {
      throw new AppError('Status transition is not allowed', 409);
    }

    const managerCanControl = hasCompanyManagementAccess(currentUser, order.company_id);
    const ownerCanPay = currentUser.id === order.user_id && order.status === 'created' && nextStatus === 'paid';

    if (!managerCanControl && !ownerCanPay) {
      throw new AppError('Forbidden', 403);
    }

    const now = new Date();
    await db.transaction(async (trx) => {
      if (order.status === 'created' && nextStatus === 'paid') {
        await recalculateOrderTotals(trx, orderId);

        const refreshedOrder = await trx<OrderModel>('orders')
          .select(...orderColumns)
          .where({ id: orderId })
          .first();

        if (!refreshedOrder) {
          throw new AppError('Order not found', 404);
        }

        if (refreshedOrder.employee_debt_cents > 0) {
          await trx('users').where({ id: refreshedOrder.user_id }).update({
            debt_cents: trx.raw('debt_cents + ?', [refreshedOrder.employee_debt_cents]),
            updated_at: now,
          });
        }

        if (refreshedOrder.company_paid_cents > 0) {
          await trx('companies').where({ id: refreshedOrder.company_id }).update({
            debt_cents: trx.raw('debt_cents + ?', [refreshedOrder.company_paid_cents]),
            updated_at: now,
          });
        }
      }

      if (order.status === 'paid' && nextStatus === 'cancelled' && order.employee_debt_cents > 0) {
        await trx('users').where({ id: order.user_id }).update({
          debt_cents: trx.raw('GREATEST(debt_cents - ?, 0)', [order.employee_debt_cents]),
          updated_at: now,
        });
      }

      if (order.status === 'paid' && nextStatus === 'cancelled' && order.company_paid_cents > 0) {
        await trx('companies').where({ id: order.company_id }).update({
          debt_cents: trx.raw('GREATEST(debt_cents - ?, 0)', [order.company_paid_cents]),
          updated_at: now,
        });
      }

      await trx('orders').where({ id: orderId }).update({
        status: nextStatus,
        cancelled_at: nextStatus === 'cancelled' ? now : order.cancelled_at,
        updated_at: now,
      });

      await insertStatusHistory(trx, {
        order_id: orderId,
        from_status: order.status,
        to_status: nextStatus,
        changed_by_user_id: currentUser.id,
        created_at: now,
      });
    });

    const updatedOrder = await requireOrder(orderId);
    const items = await loadOrderItems(orderId);
    res.json(toOrderDto(updatedOrder, items));
  } catch (error) {
    next(error);
  }
};
