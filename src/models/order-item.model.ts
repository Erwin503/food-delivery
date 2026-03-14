export interface OrderItemModel {
  order_id: number;
  dish_id: number;
  qty: number;
  price_cents: number;
  line_total_cents: number;
  created_at: Date | string;
  updated_at: Date | string;
}
