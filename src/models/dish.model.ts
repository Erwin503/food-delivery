import { SoftDeleteColumns } from './common.model';

export interface DishModel extends SoftDeleteColumns {
  id: number;
  category_id: number;
  name: string;
  description: string | null;
  price_cents: number;
  is_active: boolean;
}
