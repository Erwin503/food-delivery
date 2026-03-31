export type OrderStatus =
  | 'created'
  | 'paid'
  | 'cooking'
  | 'delivering'
  | 'completed'
  | 'cancelled';

export interface OrderItemDto {
  dishId: number;
  categoryId: number;
  qty: number;
  priceCents: number;
  basePriceCents: number;
  discountPriceCents: number;
  discountedQty: number;
  lineTotalCents: number;
}

export interface OrderDto {
  id: number;
  orderNumber: string | null;
  userId: number;
  companyId: number;
  routeId: number;
  status: OrderStatus;
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  totalCents: number;
  companyPaidCents: number;
  employeeDebtCents: number;
  createdAt: string;
  updatedAt: string;
  items?: OrderItemDto[];
}

export interface CreateOrderDto {
  items: UpsertOrderDishDto[];
}

export interface UpdateOrderDto {
  deliveryFeeCents?: number;
  discountCents?: number;
}

export interface UpsertOrderDishDto {
  dishId: number;
  qty: number;
}

export interface PatchOrderStatusDto {
  status: OrderStatus;
}
