import { OrderStatusModel } from './order-status-history.model';
import { SoftDeleteColumns } from './common.model';

export interface OrderModel extends SoftDeleteColumns {
  id: number;
  order_number: string | null;
  user_id: number;
  company_id: number;
  status: OrderStatusModel;
  delivery_address: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  scheduled_for: Date | string | null;
  subtotal_cents: number;
  delivery_fee_cents: number;
  discount_cents: number;
  total_cents: number;
  comment: string | null;
  cancelled_at: Date | string | null;
}
