export interface OrderItemModel {
  order_id: number;
  dish_id: number;
  category_id: number;
  qty: number;
  price_cents: number;
  base_price_cents: number;
  discount_price_cents: number;
  discounted_qty: number;
  line_total_cents: number;
  created_at: Date | string;
  updated_at: Date | string;
}
