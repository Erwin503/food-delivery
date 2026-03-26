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
  'created_at',
  'updated_at',
  'deleted_at',
  'cancelled_at',
] as const;

const userColumns = [
  'id',
  'email',
  'role',
  'company_id',
  'password_hash',
  'email_verified_at',
  'full_name',
  'phone',
  'avatar_url',
  'created_at',
  'updated_at',
  'deleted_at',
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

const toIsoString = (value: string | Date | undefined | null): string | null =>
  value ? new Date(value).toISOString() : null;

const hasActiveSubscription = (company?: Pick<CompanyModel, 'subscription_expires_at'> | null): boolean =>
  Boolean(company?.subscription_expires_at && new Date(company.subscription_expires_at).getTime() > Date.now());

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
  createdAt: toIsoString(order.created_at),
  updatedAt: toIsoString(order.updated_at),
  items: items?.map((item) => ({
    dishId: item.dish_id,
    qty: item.qty,
    priceCents: item.price_cents,
    lineTotalCents: item.line_total_cents,
  })),
});

const loadCurrentUser = async (req: AuthRequest): Promise<UserModel> => {
  if (!req.user?.id) {
    throw new AppError('Unauthorized', 401);
  }

  const user = await db<UserModel>('users')
    .select(...userColumns)
    .where({ id: req.user.id })
    .whereNull('deleted_at')
    .first();

  if (!user) {
    throw new AppError('User not found', 404);
  }

  return user;
};

const loadOrderById = async (id: number): Promise<OrderModel | undefined> =>
  db<OrderModel>('orders')
    .select(...orderColumns)
    .where({ id })
    .whereNull('deleted_at')
    .first();

const loadOrderItems = async (orderId: number): Promise<OrderItemModel[]> =>
  db<OrderItemModel>('order_items')
    .select('order_id', 'dish_id', 'qty', 'price_cents', 'line_total_cents', 'created_at', 'updated_at')
    .where({ order_id: orderId })
    .orderBy('dish_id', 'asc');

const requireOrder = async (id: number): Promise<OrderModel> => {
  const order = await loadOrderById(id);

  if (!order) {
    throw new AppError('Order not found', 404);
  }

  return order;
};

const requireDish = async (id: number): Promise<DishModel> => {
  const dish = await db<DishModel>('dishes')
    .select(...dishColumns)
    .where({ id })
    .whereNull('deleted_at')
    .first();

  if (!dish || !dish.is_active) {
    throw new AppError('Dish not found', 404);
  }

  return dish;
};

const loadCompany = async (id: number): Promise<Pick<CompanyModel, 'id' | 'address' | 'subscription_expires_at'> | undefined> =>
  db<CompanyModel>('companies')
    .select('id', 'address', 'subscription_expires_at')
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

const requireOrderViewer = async (req: AuthRequest, order: OrderModel): Promise<UserModel> => {
  const user = await loadCurrentUser(req);

  if (user.role === 'admin') {
    return user;
  }

  if (user.role === 'manager' && user.company_id === order.company_id) {
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

  if (user.role === 'admin') {
    return user;
  }

  if (user.role === 'manager' && user.company_id === order.company_id) {
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

const getOrderDishPrice = async (order: OrderModel, dish: DishModel): Promise<number> => {
  const company = await loadCompany(order.company_id);
  return hasActiveSubscription(company) ? dish.discount_price_cents : dish.base_price_cents;
};

const recalculateOrderTotals = async (trx: typeof db, orderId: number): Promise<void> => {
  const order = await trx<OrderModel>('orders').select(...orderColumns).where({ id: orderId }).first();

  if (!order) {
    throw new AppError('Order not found', 404);
  }

  const sumRow = await trx<OrderItemModel>('order_items')
    .where({ order_id: orderId })
    .sum<{ subtotal: number | null }>('line_total_cents as subtotal')
    .first();

  const subtotalCents = Number(sumRow?.subtotal ?? 0);
  const totalCents = Math.max(subtotalCents + order.delivery_fee_cents - order.discount_cents, 0);

  await trx('orders').where({ id: orderId }).update({
    subtotal_cents: subtotalCents,
    total_cents: totalCents,
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

export const getOrders = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const currentUser = await loadCurrentUser(req);

    if (!['admin', 'manager'].includes(currentUser.role)) {
      throw new AppError('Forbidden', 403);
    }

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
    const orderId = Number(req.params.id);

    if (!orderId) {
      throw new AppError('Order id is required', 400);
    }

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

    if (!['employee', 'manager'].includes(currentUser.role)) {
      throw new AppError('Only employees or managers can create orders', 403);
    }

    if (!currentUser.company_id) {
      throw new AppError('User must belong to a company to create an order', 409);
    }

    const company = await loadCompany(currentUser.company_id);

    if (!company) {
      throw new AppError('Company not found', 404);
    }

    const route = await getAvailableRouteForCompany(currentUser.company_id);

    if (!route) {
      throw new AppError('No active route is available for this company', 409);
    }

    const now = new Date();
    const orderNumber = await getNextOrderNumber();
    const deliveryFeeCents = Number(req.body.deliveryFeeCents ?? 0);
    const discountCents = Number(req.body.discountCents ?? 0);
    const totalCents = Math.max(deliveryFeeCents - discountCents, 0);

    const inserted = await db.transaction(async (trx) => {
      const result = await trx('orders').insert({
        order_number: orderNumber,
        user_id: currentUser.id,
        company_id: currentUser.company_id,
        route_id: route.id,
        status: 'created',
        subtotal_cents: 0,
        delivery_fee_cents: deliveryFeeCents,
        discount_cents: discountCents,
        total_cents: totalCents,
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

      return orderId;
    });

    const order = await requireOrder(inserted);
    res.status(201).json(toOrderDto(order, []));
  } catch (error) {
    next(error);
  }
};

export const updateOrder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const orderId = Number(req.params.id);

    if (!orderId) {
      throw new AppError('Order id is required', 400);
    }

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
    const orderId = Number(req.params.id);

    if (!orderId) {
      throw new AppError('Order id is required', 400);
    }

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
    const orderId = Number(req.params.id);
    const dishId = Number(req.body.dishId);
    const qty = Number(req.body.qty);

    if (!orderId || !dishId || !qty || qty < 1) {
      throw new AppError('order id, dishId, and qty >= 1 are required', 400);
    }

    const order = await requireOrder(orderId);
    await requireOrderEditor(req, order);
    await ensureOrderIsEditable(order);

    const dish = await requireDish(dishId);
    const priceCents = await getOrderDishPrice(order, dish);
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
          qty,
          price_cents: priceCents,
          line_total_cents: qty * priceCents,
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
    const orderId = Number(req.params.id);
    const dishId = Number(req.body.dishId);
    const qty = Number(req.body.qty);

    if (!orderId || !dishId || !qty || qty < 1) {
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
        line_total_cents: qty * item.price_cents,
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
    const orderId = Number(req.params.id);
    const dishId = Number(req.params.dishId);

    if (!orderId || !dishId) {
      throw new AppError('Order id and dish id are required', 400);
    }

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
    const orderId = Number(req.params.id);
    const nextStatus = String(req.body.status || '') as OrderModel['status'];

    if (!orderId || !nextStatus) {
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

    const managerCanControl =
      currentUser.role === 'admin' ||
      (currentUser.role === 'manager' && currentUser.company_id === order.company_id);
    const ownerCanPay = currentUser.id === order.user_id && order.status === 'created' && nextStatus === 'paid';

    if (!managerCanControl && !ownerCanPay) {
      throw new AppError('Forbidden', 403);
    }

    const now = new Date();
    await db.transaction(async (trx) => {
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
