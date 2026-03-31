import { AuthTokenPayload } from '../interfaces/auth';
import { UserModel } from '../models';

type CompanyScopedActor =
  | Pick<AuthTokenPayload, 'role' | 'companyId'>
  | Pick<UserModel, 'role' | 'company_id'>;

const getActorCompanyId = (actor: CompanyScopedActor): number | null =>
  'companyId' in actor ? actor.companyId : actor.company_id;

export const hasCompanyManagementAccess = (
  actor: CompanyScopedActor | undefined | null,
  companyId: number
): boolean => {
  if (!actor) {
    return false;
  }

  if (actor.role === 'admin') {
    return true;
  }

  return actor.role === 'manager' && getActorCompanyId(actor) === companyId;
};
