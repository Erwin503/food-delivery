import { NextFunction, Response } from 'express';
import type { Knex } from 'knex';
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
import { BusinessDay, getBusinessDay, getBusinessIsoWeekday } from '../utils/businessTime';
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
  'items_revision',
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
  'available_weekdays',
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

const orderReadTransaction = { isolationLevel: 'repeatable read' } as const;

const hasActiveSubscription = (
  user?: Pick<UserModel, 'subscription_expires_at'> | null
): boolean =>
  Boolean(user?.subscription_expires_at && new Date(user.subscription_expires_at).getTime() > Date.now());

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

type OrderItemWithDishName = OrderItemModel & {
  dish_name: string;
};

type DetailedOrderItem = OrderItemWithDishName & {
  dish_is_active: boolean;
  dish_deleted_at: Date | null;
  dish_available_weekdays: DishModel['available_weekdays'];
};

type OrderRoute = Pick<RouteModel, 'id' | 'departure_at' | 'order_acceptance_ends_at'>;

const toOrderItemDto = (item: OrderItemWithDishName) => ({
  dishId: item.dish_id,
  dishName: item.dish_name,
  categoryId: item.category_id,
  qty: item.qty,
  priceCents: item.price_cents,
  basePriceCents: item.base_price_cents,
  discountPriceCents: item.discount_price_cents,
  discountedQty: item.discounted_qty,
  lineTotalCents: item.line_total_cents,
});

const toOrderDto = (order: OrderModel, items?: OrderItemWithDishName[]) => ({
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
  items: items?.map(toOrderItemDto),
});

const loadCurrentUser = async (req: AuthRequest): Promise<UserModel> => {
  return requireAuthenticatedUser(req.user);
};

const loadOrderById = async (id: number, connection = db): Promise<OrderModel | undefined> =>
  connection<OrderModel>('orders')
    .select(...orderColumns)
    .where({ id })
    .whereNull('deleted_at')
    .first();

const loadOrderItems = async (orderId: number, connection = db): Promise<DetailedOrderItem[]> =>
  connection<OrderItemModel>('order_items as oi')
    .join('dishes as d', 'd.id', 'oi.dish_id')
    .select(
      'oi.order_id',
      'oi.dish_id',
      'oi.category_id',
      'oi.qty',
      'oi.price_cents',
      'oi.base_price_cents',
      'oi.discount_price_cents',
      'oi.discounted_qty',
      'oi.line_total_cents',
      'oi.created_at',
      'oi.updated_at',
      'd.name as dish_name',
      'd.is_active as dish_is_active',
      'd.deleted_at as dish_deleted_at',
      'd.available_weekdays as dish_available_weekdays'
    )
    .where({ 'oi.order_id': orderId })
    .orderBy('oi.dish_id', 'asc') as unknown as Promise<DetailedOrderItem[]>;

const loadOrderItemsByOrderIds = async (
  orderIds: number[],
  connection = db
): Promise<Map<number, OrderItemWithDishName[]>> => {
  if (orderIds.length === 0) {
    return new Map();
  }

  const items = await connection<OrderItemModel>('order_items as oi')
    .join('dishes as d', 'd.id', 'oi.dish_id')
    .select(
      'oi.order_id',
      'oi.dish_id',
      'oi.category_id',
      'oi.qty',
      'oi.price_cents',
      'oi.base_price_cents',
      'oi.discount_price_cents',
      'oi.discounted_qty',
      'oi.line_total_cents',
      'oi.created_at',
      'oi.updated_at',
      'd.name as dish_name'
    )
    .whereIn('oi.order_id', orderIds)
    .orderBy('oi.order_id', 'asc')
    .orderBy('oi.dish_id', 'asc') as unknown as OrderItemWithDishName[];

  const itemsByOrderId = new Map<number, OrderItemWithDishName[]>();

  for (const item of items) {
    const bucket = itemsByOrderId.get(item.order_id) ?? [];
    bucket.push(item);
    itemsByOrderId.set(item.order_id, bucket);
  }

  return itemsByOrderId;
};

const requireOrder = async (id: number, connection = db): Promise<OrderModel> =>
  requireEntity(() => loadOrderById(id, connection), 'Order not found');

const lockOrder = (trx: Knex.Transaction, id: number): Promise<OrderModel> =>
  requireEntity(
    () => trx<OrderModel>('orders').select(...orderColumns).where({ id }).whereNull('deleted_at').forUpdate().first(),
    'Order not found'
  );

const isAvailableOnWeekday = (value: DishModel['available_weekdays'], weekday: number): boolean => {
  try {
    const days = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(days) && days.includes(weekday);
  } catch {
    return false;
  }
};

const requireDish = async (id: number, weekday: number, connection = db): Promise<DishModel> => {
  const dish = await requireEntity(
    () =>
      connection<DishModel>('dishes')
        .select(...dishColumns)
        .where({ id })
        .whereNull('deleted_at')
        .first(),
    'Dish not found'
  );

  if (!dish.is_active) {
    throw new AppError('Dish not found', 404);
  }
  if (!isAvailableOnWeekday(dish.available_weekdays, weekday)) {
    throw new AppError(`Dish ${id} is unavailable above quantity 0`, 422);
  }

  return dish;
};

const loadCompany = async (id: number, connection = db): Promise<{ id: number; address: string | null; debt_cents: number } | undefined> =>
  connection<CompanyModel>('companies')
    .select('id', 'address', 'debt_cents')
    .where({ id })
    .whereNull('deleted_at')
    .first();

const selectOrderRoute = (id: number, connection = db) =>
  connection<RouteModel>('routes')
    .select('id', 'departure_at', 'order_acceptance_ends_at')
    .where({ id })
    .whereNull('deleted_at');

const getAvailableRouteForCompany = async (
  companyId: number,
  now: Date,
  connection = db
): Promise<OrderRoute | undefined> =>
  connection<RouteModel>('routes as r')
    .join('route_companies as rc', 'rc.route_id', 'r.id')
    .select('r.id', 'r.departure_at', 'r.order_acceptance_ends_at')
    .where('rc.company_id', companyId)
    .whereNull('r.deleted_at')
    .andWhereRaw('r.order_acceptance_ends_at > FROM_UNIXTIME(?)', [now.getTime() / 1000])
    .andWhereRaw('r.departure_at > FROM_UNIXTIME(?)', [now.getTime() / 1000])
    .orderBy('r.departure_at', 'asc')
    .first();

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
  items: RequestedOrderItem[],
  weekday: number,
  connection = db
): Promise<OrderPricingSource[]> => {
  const normalizedItems = normalizeRequestedItems(items);
  const dishesById = new Map<number, DishModel>();

  for (const item of normalizedItems) {
    const dish = await requireDish(item.dishId, weekday, connection);
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

const loadReplacementPricing = async (
  trx: Knex.Transaction,
  orderId: number,
  requestedItems: RequestedOrderItem[],
  weekday: number
): Promise<OrderPricingSource[]> => {
  const items = normalizeRequestedItems(requestedItems);
  const dishes = await trx<DishModel>('dishes')
    .select('id', 'category_id', 'base_price_cents', 'discount_price_cents', 'is_active', 'deleted_at', 'available_weekdays')
    .whereIn('id', items.map((item) => item.dishId))
    .orderBy('id')
    .forShare();
  const dishesById = new Map(dishes.map((dish) => [dish.id, dish]));
  const previousItems = await trx<OrderItemModel>('order_items')
    .select('dish_id', 'category_id', 'qty', 'base_price_cents', 'discount_price_cents')
    .where({ order_id: orderId });
  const previousItemsById = new Map(previousItems.map((item) => [item.dish_id, item]));

  return items.map(({ dishId, qty }) => {
    const dish = dishesById.get(dishId);
    if (!dish) throw new AppError('Dish not found', 404);

    if (!dish.is_active || dish.deleted_at || !isAvailableOnWeekday(dish.available_weekdays, weekday)) {
      const previousItem = previousItemsById.get(dishId);
      if (!previousItem || qty > previousItem.qty) {
        throw new AppError(`Dish ${dishId} is unavailable above quantity ${previousItem?.qty ?? 0}`, 422);
      }
      return {
        dishId,
        qty,
        categoryId: previousItem.category_id,
        basePriceCents: previousItem.base_price_cents,
        discountPriceCents: previousItem.discount_price_cents,
      };
    }

    return {
      dishId,
      qty,
      categoryId: dish.category_id,
      basePriceCents: dish.base_price_cents,
      discountPriceCents: dish.discount_price_cents,
    };
  });
};

const getUserOrderAvailability = async (userId: number, day = getBusinessDay(), connection = db) => {
  const existingOrder = await connection<OrderModel>('orders')
    .select(...orderColumns)
    .where({ user_id: userId })
    .andWhereRaw('created_at >= FROM_UNIXTIME(?)', [day.start.getTime() / 1000])
    .andWhereRaw('created_at < FROM_UNIXTIME(?)', [day.end.getTime() / 1000])
    .orderBy('created_at', 'desc')
    .first();

  return {
    canCreateOrder: !existingOrder,
    existingOrder: existingOrder ?? null,
  };
};

const ensureUserCanCreateOrderToday = async (
  userId: number,
  day: BusinessDay,
  connection = db
): Promise<void> => {
  const availability = await getUserOrderAvailability(userId, day, connection);

  if (!availability.canCreateOrder) {
    throw new AppError('User already has an order today', 409);
  }
};

const ensureOrderViewer = (user: UserModel, order: OrderModel): void => {
  if (user.id !== order.user_id && !hasCompanyManagementAccess(user, order.company_id)) {
    throw new AppError('Forbidden', 403);
  }
};

const requireOrderViewer = async (req: AuthRequest, order: OrderModel): Promise<UserModel> => {
  const user = await loadCurrentUser(req);
  ensureOrderViewer(user, order);
  return user;
};

const canEditOrder = (user: UserModel, order: OrderModel): boolean =>
  user.role === 'admin' || user.role === 'manager' || user.id === order.user_id;

const requireOrderEditor = async (req: AuthRequest, order: OrderModel): Promise<UserModel> => {
  const user = await requireOrderViewer(req, order);

  if (canEditOrder(user, order)) {
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

const isOrderAcceptanceOpen = (route: OrderRoute): boolean =>
  new Date(route.order_acceptance_ends_at).getTime() > Date.now();

const ensureOrderAcceptanceIsOpen = (route: OrderRoute): void => {
  if (!isOrderAcceptanceOpen(route)) {
    throw new AppError('Order acceptance time has ended for this route', 409);
  }
};

const toOrderDetailsDto = (
  order: OrderModel,
  items: DetailedOrderItem[],
  viewer: UserModel,
  route: OrderRoute | undefined
) => {
  const weekday = getBusinessIsoWeekday();
  return {
    ...toOrderDto(order),
    itemsRevision: order.items_revision,
    items: items.map((item) => ({
      ...toOrderItemDto(item),
      canIncrease: Boolean(item.dish_is_active) && !item.dish_deleted_at &&
        isAvailableOnWeekday(item.dish_available_weekdays, weekday),
    })),
    canEdit: canEditOrder(viewer, order) && order.status === 'created' && Boolean(route && isOrderAcceptanceOpen(route)),
    orderAcceptanceEndsAt: toNullableIsoString(route?.order_acceptance_ends_at),
  };
};

const ensureOrderIsEditable = async (order: OrderModel, trx?: Knex.Transaction): Promise<OrderRoute> => {
  if (order.status !== 'created') {
    throw new AppError('Only created orders can be edited', 409);
  }

  const routeQuery = selectOrderRoute(order.route_id, trx ?? db);
  const route = await (trx ? routeQuery.forShare() : routeQuery).first();

  if (!route) {
    throw new AppError('Route not found', 404);
  }

  ensureOrderAcceptanceIsOpen(route);
  return route;
};

const recalculateOrderTotals = async (trx: typeof db, orderId: number, itemsChanged = false): Promise<void> => {
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
    hasActiveSubscription(user)
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
    ...(itemsChanged ? { items_revision: order.items_revision + 1 } : {}),
    updated_at: new Date(),
  });
};

const insertStatusHistory = async (
  trx: typeof db,
  payload: Omit<OrderStatusHistoryModel, 'id'>
): Promise<void> => {
  await trx('order_status_history').insert(payload);
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
  items: RequestedOrderItem[],
  user: Pick<UserModel, 'order_limit_cents' | 'subscription_expires_at'>,
  weekday: number
) => {
  const pricedItems = buildPricedOrderItems(
    await loadPricingSourcesForRequestedItems(items, weekday),
    hasActiveSubscription(user)
  );

  const subtotalCents = pricedItems.reduce((sum, item) => sum + item.lineTotalCents, 0);
  const totalCents = subtotalCents;
  const billing = calculateOrderBilling(totalCents, {
    orderLimitCents: user.order_limit_cents,
  });

  return {
    subtotalCents,
    totalCents,
    orderLimitCents: Math.max(Number(user.order_limit_cents ?? 0) || 0, 0),
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

    const viewer = await loadCurrentUser(req);
    const details = await db.transaction(async (trx) => {
      const order = await requireOrder(orderId, trx);
      ensureOrderViewer(viewer, order);
      const items = await loadOrderItems(orderId, trx);
      const route = await selectOrderRoute(order.route_id, trx).first();
      return toOrderDetailsDto(order, items, viewer, route);
    }, orderReadTransaction);

    res.json(details);
  } catch (error) {
    next(error);
  }
};

export const getMyOrders = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const currentUser = await loadCurrentUser(req);

    const orders = await db.transaction(async (trx) => {
      const myOrders = await trx<OrderModel>('orders')
        .select(...orderColumns)
        .where({ user_id: currentUser.id })
        .orderBy('created_at', 'desc')
        .orderBy('id', 'desc');
      const itemsByOrderId = await loadOrderItemsByOrderIds(myOrders.map((order) => order.id), trx);
      return myOrders.map((order) => toOrderDto(order, itemsByOrderId.get(order.id) ?? []));
    }, orderReadTransaction);

    res.json(orders);
  } catch (error) {
    next(error);
  }
};

export const getOrderAvailability = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const currentUser = await loadCurrentUser(req);
    const availability = await getUserOrderAvailability(currentUser.id);

    res.json({
      canCreateOrder: availability.canCreateOrder,
      existingOrder: availability.existingOrder ? toOrderDto(availability.existingOrder) : null,
    });
  } catch (error) {
    next(error);
  }
};

export const createOrder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const currentUser = await loadCurrentUser(req);
    const items = parseCreateOrderItems(req.body.items);

    const inserted = await db.transaction(async (trx) => {
      const user = await requireEntity(
        () => trx<UserModel>('users').select(...USER_COLUMNS)
          .where({ id: currentUser.id }).whereNull('deleted_at').forUpdate().first(),
        'User not found'
      );
      const companyId = user.company_id;
      if (!companyId) {
        throw new AppError('User must belong to a company to create an order', 409);
      }

      const day = getBusinessDay();
      const now = day.capturedAt;
      await ensureUserCanCreateOrderToday(user.id, day, trx);
      if (!await loadCompany(companyId, trx)) {
        throw new AppError('Company not found', 404);
      }
      const availableRoute = await getAvailableRouteForCompany(companyId, now, trx);
      if (!availableRoute) {
        throw new AppError('No active route is available for this company', 409);
      }

      const pricedItems = buildPricedOrderItems(
        await loadPricingSourcesForRequestedItems(items, getBusinessIsoWeekday(now), trx),
        hasActiveSubscription(user)
      );

      // A legacy date key can be occupied by an order outside the business day.
      const staleOrder = await trx('orders')
        .where({ user_id: user.id, order_day: day.day })
        .andWhere(function () {
          this.whereRaw('created_at < FROM_UNIXTIME(?)', [day.start.getTime() / 1000])
            .orWhereRaw('created_at >= FROM_UNIXTIME(?)', [day.end.getTime() / 1000]);
        })
        .first('id');
      if (staleOrder) {
        await trx('orders').where({ id: staleOrder.id }).update({ order_day: null });
      }

      const route = await selectOrderRoute(availableRoute.id, trx).forShare().first();
      const assignment = route && await trx('route_companies')
        .select('company_id')
        .where({ route_id: route.id, company_id: companyId })
        .forShare()
        .first();
      if (!route || !assignment || new Date(route.departure_at).getTime() <= Date.now()) {
        throw new AppError('No active route is available for this company', 409);
      }
      ensureOrderAcceptanceIsOpen(route);
      const result = await trx('orders').insert({
        user_id: user.id,
        company_id: companyId,
        route_id: route.id,
        status: 'created',
        subtotal_cents: 0,
        delivery_fee_cents: 0,
        discount_cents: 0,
        total_cents: 0,
        company_paid_cents: 0,
        employee_debt_cents: 0,
        created_at: trx.raw('FROM_UNIXTIME(?)', [now.getTime() / 1000]),
        order_day: day.day,
        updated_at: now,
        deleted_at: null,
        cancelled_at: null,
      });

      const orderId = Array.isArray(result) ? Number(result[0]) : Number(result);
      const orderNumber = `${day.day.replace(/-/g, '')}-${String(orderId).padStart(6, '0')}`;
      await trx('orders').where({ id: orderId }).update({ order_number: orderNumber });

      await insertStatusHistory(trx, {
        order_id: orderId,
        from_status: null,
        to_status: 'created',
        changed_by_user_id: user.id,
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

    const day = getBusinessDay();
    await ensureUserCanCreateOrderToday(currentUser.id, day);

    const calculated = await calculateDraftOrderFromItems(items, currentUser, getBusinessIsoWeekday(day.capturedAt));

    res.json(calculated);
  } catch (error) {
    next(error);
  }
};

export const updateOrder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const orderId = parseRequiredId(req.params.id, 'Order id');

    const order = await requireOrder(orderId);
    const editor = await requireOrderEditor(req, order);

    const patch: Record<string, unknown> = {
      updated_at: new Date(),
    };

    for (const [input, column] of [
      ['deliveryFeeCents', 'delivery_fee_cents'],
      ['discountCents', 'discount_cents'],
    ] as const) {
      if (input in req.body) {
        if (editor.role !== 'admin') {
          throw new AppError('Only administrators can change order charges', 403);
        }
        const amount = req.body[input];
        if (!Number.isInteger(amount) || amount < 0 || amount > 0xffffffff) {
          throw new AppError(`${input} must be a non-negative integer in cents`, 400);
        }
        patch[column] = amount;
      }
    }

    await db.transaction(async (trx) => {
      const lockedOrder = await lockOrder(trx, orderId);
      if (['completed', 'cancelled'].includes(lockedOrder.status)) {
        throw new AppError('Completed or cancelled orders cannot be updated', 409);
      }
      await ensureOrderIsEditable(lockedOrder, trx);
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

    await db.transaction(async (trx) => {
      const lockedOrder = await lockOrder(trx, orderId);
      if (['completed', 'cancelled'].includes(lockedOrder.status)) {
        throw new AppError('Order cannot be cancelled', 409);
      }
      await ensureOrderIsEditable(lockedOrder, trx);
      const now = new Date();
      await trx('orders').where({ id: orderId }).update({
        status: 'cancelled',
        cancelled_at: now,
        updated_at: now,
      });

      await insertStatusHistory(trx, {
        order_id: orderId,
        from_status: lockedOrder.status,
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

    await db.transaction(async (trx) => {
      const lockedOrder = await lockOrder(trx, orderId);
      await ensureOrderIsEditable(lockedOrder, trx);
      const now = new Date(Date.now());
      const dish = await requireDish(dishId, getBusinessIsoWeekday(now), trx);
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

      await recalculateOrderTotals(trx, orderId, true);
    });

    const updatedOrder = await requireOrder(orderId);
    const items = await loadOrderItems(orderId);
    res.json(toOrderDto(updatedOrder, items));
  } catch (error) {
    next(error);
  }
};

export const replaceOrderDishes = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const orderId = parseRequiredId(req.params.id, 'Order id');
    const requestedItems = parseCreateOrderItems(req.body.items);
    const expectedRevision = req.body.expectedItemsRevision;
    if (
      expectedRevision !== undefined &&
      (!Number.isInteger(expectedRevision) || expectedRevision < 0 || expectedRevision > 0xffffffff)
    ) {
      throw new AppError('expectedItemsRevision must be a non-negative integer', 400);
    }

    const order = await requireOrder(orderId);
    const editor = await requireOrderEditor(req, order);
    await ensureOrderIsEditable(order);

    const details = await db.transaction(async (trx) => {
      const lockedOrder = await lockOrder(trx, orderId);
      const route = await ensureOrderIsEditable(lockedOrder, trx);
      if (expectedRevision !== undefined && expectedRevision !== lockedOrder.items_revision) {
        throw new AppError('Order items have changed since it was opened', 409);
      }
      const pricingSources = await loadReplacementPricing(trx, orderId, requestedItems, getBusinessIsoWeekday());
      ensureOrderAcceptanceIsOpen(route);
      const now = new Date();
      await trx('order_items').where({ order_id: orderId }).delete();

      await trx('order_items').insert(
        pricingSources.map((item) => ({
          order_id: orderId,
          dish_id: item.dishId,
          category_id: item.categoryId,
          qty: item.qty,
          price_cents: item.basePriceCents,
          base_price_cents: item.basePriceCents,
          discount_price_cents: item.discountPriceCents,
          discounted_qty: 0,
          line_total_cents: item.qty * item.basePriceCents,
          created_at: now,
          updated_at: now,
        }))
      );

      await recalculateOrderTotals(trx, orderId, true);
      const updatedOrder = await lockOrder(trx, orderId);
      const items = await loadOrderItems(orderId, trx);
      return toOrderDetailsDto(updatedOrder, items, editor, route);
    });

    res.json(details);
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

    await db.transaction(async (trx) => {
      const lockedOrder = await lockOrder(trx, orderId);
      await ensureOrderIsEditable(lockedOrder, trx);
      const deleted = await trx('order_items').where({ order_id: orderId, dish_id: dishId }).delete();

      if (!deleted) {
        throw new AppError('Order item not found', 404);
      }

      await recalculateOrderTotals(trx, orderId, true);
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

    const currentUser = await requireOrderViewer(req, await requireOrder(orderId));

    const allowedTransitions: Record<OrderModel['status'], OrderModel['status'][]> = {
      created: ['paid', 'cancelled'],
      paid: ['cooking', 'cancelled'],
      cooking: ['delivering', 'cancelled'],
      delivering: ['completed', 'cancelled'],
      completed: [],
      cancelled: [],
    };

    await db.transaction(async (trx) => {
      const order = await lockOrder(trx, orderId);
      if (!allowedTransitions[order.status].includes(nextStatus)) {
        throw new AppError('Status transition is not allowed', 409);
      }

      const managerCanControl = hasCompanyManagementAccess(currentUser, order.company_id);
      const ownerCanPay = currentUser.id === order.user_id && order.status === 'created' && nextStatus === 'paid';

      if (!managerCanControl && !ownerCanPay) {
        throw new AppError('Forbidden', 403);
      }

      const now = new Date();
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

      const reverseCharges = nextStatus === 'cancelled' && ['paid', 'cooking', 'delivering'].includes(order.status);
      if (reverseCharges && order.employee_debt_cents > 0) {
        await trx('users').where({ id: order.user_id }).update({
          debt_cents: trx.raw('GREATEST(debt_cents - ?, 0)', [order.employee_debt_cents]),
          updated_at: now,
        });
      }

      if (reverseCharges && order.company_paid_cents > 0) {
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
