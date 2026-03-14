export type OrderStatus =
  | 'created'
  | 'paid'
  | 'cooking'
  | 'delivering'
  | 'completed'
  | 'cancelled';

export interface OrderItemDto {
  dishId: number;
  qty: number;
  priceCents: number;
  lineTotalCents: number;
}

export interface OrderDto {
  id: number;
  orderNumber: string | null;
  userId: number;
  companyId: number;
  status: OrderStatus;
  deliveryAddress: string | null;
  contactName: string | null;
  contactPhone: string | null;
  scheduledFor: string | null;
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  totalCents: number;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  items?: OrderItemDto[];
}

export interface CreateOrderDto {
  deliveryAddress?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  scheduledFor?: string | null;
  deliveryFeeCents?: number;
  discountCents?: number;
  comment?: string | null;
}

export interface UpdateOrderDto {
  deliveryAddress?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  scheduledFor?: string | null;
  deliveryFeeCents?: number;
  discountCents?: number;
  comment?: string | null;
}

export interface UpsertOrderDishDto {
  dishId: number;
  qty: number;
}

export interface PatchOrderStatusDto {
  status: OrderStatus;
}
