import { SoftDeleteColumns } from './common.model';

export interface CompanyModel extends SoftDeleteColumns {
  id: number;
  name: string;
  description: string | null;
  address: string | null;
}
