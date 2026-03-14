import { SoftDeleteColumns } from './common.model';

export interface CategoryModel extends SoftDeleteColumns {
  id: number;
  name: string;
  sort_order: number;
}
