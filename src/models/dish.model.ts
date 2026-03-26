import { SoftDeleteColumns } from './common.model';

export interface DishModel extends SoftDeleteColumns {
  id: number;
  category_id: number;
  name: string;
  description: string | null;
  image_url: string | null;
  base_price_cents: number;
  discount_price_cents: number;
  is_active: boolean;
}
