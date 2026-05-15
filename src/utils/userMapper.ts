import { UserDto } from '../dto';
import { UserModel } from '../models';

const toIsoString = (value: string | Date | undefined): string =>
  new Date(value ?? new Date(0)).toISOString();

export const toUserDto = (user: UserModel): UserDto => ({
  id: user.id,
  email: user.email,
  role: user.role,
  companyId: user.company_id,
  fullName: user.full_name,
  phone: user.phone,
  avatarUrl: user.avatar_url,
  orderLimitCents: user.order_limit_cents,
  debtCents: user.debt_cents,
  subscriptionStartedAt: user.subscription_started_at ? toIsoString(user.subscription_started_at) : null,
  subscriptionExpiresAt: user.subscription_expires_at ? toIsoString(user.subscription_expires_at) : null,
  hasActiveSubscription:
    Boolean(user.subscription_expires_at) &&
    new Date(user.subscription_expires_at as string | Date).getTime() > Date.now(),
  createdAt: toIsoString(user.created_at),
  updatedAt: toIsoString(user.updated_at),
});
