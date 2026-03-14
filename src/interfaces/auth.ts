import { UserRoleModel } from '../models';

export interface AuthTokenPayload {
  id: number;
  email: string;
  role: UserRoleModel;
  companyId: number | null;
}
