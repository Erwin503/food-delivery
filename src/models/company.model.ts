import { SoftDeleteColumns } from './common.model';

export interface CompanyModel extends SoftDeleteColumns {
  id: number;
  name: string;
  description: string | null;
  address: string | null;
  debt_cents: number;
  subscription_started_at?: Date | string | null;
  subscription_expires_at?: Date | string | null;
}
