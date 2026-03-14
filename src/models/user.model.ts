import { SoftDeleteColumns } from './common.model';

export type UserRoleModel = 'employee' | 'manager' | 'admin';

export interface UserModel extends SoftDeleteColumns {
  id: number;
  email: string;
  role: UserRoleModel;
  company_id: number | null;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
}
