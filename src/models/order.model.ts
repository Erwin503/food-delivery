import { OrderStatusModel } from './order-status-history.model';
import { SoftDeleteColumns } from './common.model';

export interface OrderModel extends SoftDeleteColumns {
  id: number;
  order_number: string | null;
  user_id: number;
  company_id: number;
  route_id: number;
  status: OrderStatusModel;
  subtotal_cents: number;
  delivery_fee_cents: number;
  discount_cents: number;
  total_cents: number;
  cancelled_at: Date | string | null;
}
