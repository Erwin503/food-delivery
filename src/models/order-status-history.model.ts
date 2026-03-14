export type OrderStatusModel =
  | 'created'
  | 'paid'
  | 'cooking'
  | 'delivering'
  | 'completed'
  | 'cancelled';

export interface OrderStatusHistoryModel {
  id: number;
  order_id: number;
  from_status: OrderStatusModel | null;
  to_status: OrderStatusModel;
  changed_by_user_id: number | null;
  created_at: Date | string;
}
