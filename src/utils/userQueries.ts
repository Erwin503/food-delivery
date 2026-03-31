import db from '../db/knex';
import { AppError } from '../errors/AppError';
import { UserModel } from '../models';

export const USER_COLUMNS = [
  'id',
  'email',
  'role',
  'company_id',
  'password_hash',
  'email_verified_at',
  'full_name',
  'phone',
  'avatar_url',
  'order_limit_cents',
  'debt_cents',
  'created_at',
  'updated_at',
  'deleted_at',
] as const;

export const loadUserById = async (id: number): Promise<UserModel | undefined> =>
  db<UserModel>('users')
    .select(...USER_COLUMNS)
    .where({ id })
    .whereNull('deleted_at')
    .first();

export const loadUserByEmail = async (email: string): Promise<UserModel | undefined> =>
  db<UserModel>('users')
    .select(...USER_COLUMNS)
    .where({ email })
    .whereNull('deleted_at')
    .first();

export const requireUserById = async (id: number): Promise<UserModel> => {
  const user = await loadUserById(id);

  if (!user) {
    throw new AppError('User not found', 404);
  }

  return user;
};

export const requireAuthenticatedUser = async (authUser?: { id?: number }): Promise<UserModel> => {
  if (!authUser?.id) {
    throw new AppError('Unauthorized', 401);
  }

  return requireUserById(authUser.id);
};
