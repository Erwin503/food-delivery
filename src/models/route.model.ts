import { SoftDeleteColumns } from './common.model';

export interface RouteModel extends SoftDeleteColumns {
  id: number;
  name: string;
  departure_at: Date | string;
  order_acceptance_ends_at: Date | string;
  description: string | null;
}
