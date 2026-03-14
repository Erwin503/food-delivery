import { NextFunction, Request, Response } from 'express';
import db from '../db/knex';
import { AppError } from '../errors/AppError';
import { AuthTokenPayload } from '../interfaces/auth';
import { AuthPasswordResetCodeModel, UserModel } from '../models';
import { AuthRequest } from '../middleware/authMiddleware';
import { generateLoginCode } from '../utils/auth';
import { generateToken } from '../utils/generateToken';
import { sendEmail } from '../utils/mailService';
import { comparePassword, hashPassword } from '../utils/password';
import { toUserDto } from '../utils/userMapper';

const LOGIN_CODE_TTL_SECONDS = 300;
const PASSWORD_RESET_TTL_SECONDS = 900;

const userColumns = [
  'id',
  'email',
  'role',
  'company_id',
  'password_hash',
  'full_name',
  'phone',
  'avatar_url',
  'created_at',
  'updated_at',
  'deleted_at',
] as const;

const loadUserById = async (id: number): Promise<UserModel | undefined> =>
  db<UserModel>('users')
    .select(...userColumns)
    .where({ id })
    .whereNull('deleted_at')
    .first();

const requireCurrentUser = async (authUser?: AuthTokenPayload): Promise<UserModel> => {
  if (!authUser?.id) {
    throw new AppError('Unauthorized', 401);
  }

  const user = await loadUserById(authUser.id);

  if (!user) {
    throw new AppError('User not found', 404);
  }

  return user;
};

const issueAuthResponse = (res: Response, user: UserModel) => {
  const token = generateToken({
    id: user.id,
    email: user.email,
    role: user.role,
    companyId: user.company_id,
  });

  res.json({
    token,
    user: toUserDto(user),
  });
};

const sendEmailIfConfigured = async (to: string, subject: string, html: string): Promise<void> => {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return;
  }

  try {
    await sendEmail(to, subject, html);
  } catch (_error) {
    // Email delivery should not block auth flows in local development.
  }
};

export const loginStep1 = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();

    if (!email) {
      throw new AppError('Email is required', 400);
    }

    const code = generateLoginCode();
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + LOGIN_CODE_TTL_SECONDS * 1000);

    await db('auth_login_codes').insert({
      email,
      code,
      expires_at: expiresAt,
      consumed_at: null,
      created_at: createdAt,
    });

    await sendEmailIfConfigured(
      email,
      'Your login code',
      `<p>Your verification code is <strong>${code}</strong>.</p>`
    );

    res.json({
      ok: true,
      expiresInSeconds: LOGIN_CODE_TTL_SECONDS,
    });
  } catch (error) {
    next(error);
  }
};

export const loginStep2 = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const code = String(req.body.code || '').trim();

    if (!email || !code) {
      throw new AppError('Email and code are required', 400);
    }

    const loginCode = await db('auth_login_codes')
      .where({ email, code })
      .whereNull('consumed_at')
      .orderBy('id', 'desc')
      .first();

    if (!loginCode) {
      throw new AppError('Invalid code', 401);
    }

    if (new Date(loginCode.expires_at).getTime() < Date.now()) {
      throw new AppError('Code expired', 401);
    }

    await db('auth_login_codes').where({ id: loginCode.id }).update({
      consumed_at: new Date(),
    });

    let user = await db<UserModel>('users')
      .select(...userColumns)
      .where({ email })
      .whereNull('deleted_at')
      .first();

    if (!user) {
      const inserted = await db('users').insert({
        email,
        role: 'employee',
        company_id: null,
        password_hash: null,
        full_name: null,
        phone: null,
        avatar_url: null,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      });

      const userId = Array.isArray(inserted) ? Number(inserted[0]) : Number(inserted);
      user = await loadUserById(userId);
    }

    if (!user) {
      throw new AppError('User not found', 404);
    }

    issueAuthResponse(res, user);
  } catch (error) {
    next(error);
  }
};

export const passwordLogin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!email || !password) {
      throw new AppError('Email and password are required', 400);
    }

    const user = await db<UserModel>('users')
      .select(...userColumns)
      .where({ email })
      .whereNull('deleted_at')
      .first();

    if (!user || !(await comparePassword(password, user.password_hash))) {
      throw new AppError('Invalid email or password', 401);
    }

    issueAuthResponse(res, user);
  } catch (error) {
    next(error);
  }
};

export const getProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await requireCurrentUser(req.user);
    res.json(toUserDto(user));
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await requireCurrentUser(req.user);
    const patch: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if ('fullName' in req.body) {
      patch.full_name = req.body.fullName ?? null;
    }

    if ('phone' in req.body) {
      patch.phone = req.body.phone ?? null;
    }

    if ('avatarUrl' in req.body) {
      patch.avatar_url = req.body.avatarUrl ?? null;
    }

    await db('users').where({ id: user.id }).update(patch);

    const updatedUser = await requireCurrentUser(req.user);
    res.json(toUserDto(updatedUser));
  } catch (error) {
    next(error);
  }
};

export const setPassword = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await requireCurrentUser(req.user);
    const currentPassword = req.body.currentPassword ? String(req.body.currentPassword) : '';
    const newPassword = String(req.body.newPassword || '');

    if (newPassword.length < 6) {
      throw new AppError('New password must be at least 6 characters', 400);
    }

    if (user.password_hash) {
      const isCurrentPasswordValid = await comparePassword(currentPassword, user.password_hash);

      if (!isCurrentPasswordValid) {
        throw new AppError('Current password is incorrect', 401);
      }
    }

    await db('users').where({ id: user.id }).update({
      password_hash: await hashPassword(newPassword),
      updated_at: new Date(),
    });

    const updatedUser = await requireCurrentUser(req.user);
    res.json(toUserDto(updatedUser));
  } catch (error) {
    next(error);
  }
};

export const deleteProfile = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await requireCurrentUser(req.user);

    await db('users').where({ id: user.id }).update({
      deleted_at: new Date(),
      updated_at: new Date(),
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const requestPasswordReset = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();

    if (!email) {
      throw new AppError('Email is required', 400);
    }

    const user = await db<UserModel>('users').where({ email }).whereNull('deleted_at').first();

    if (user) {
      const code = generateLoginCode();
      const createdAt = new Date();
      const expiresAt = new Date(createdAt.getTime() + PASSWORD_RESET_TTL_SECONDS * 1000);

      await db('auth_password_reset_codes').insert({
        email,
        code,
        expires_at: expiresAt,
        consumed_at: null,
        created_at: createdAt,
      });

      await sendEmailIfConfigured(
        email,
        'Password reset code',
        `<p>Your password reset code is <strong>${code}</strong>.</p>`
      );
    }

    res.json({
      ok: true,
      expiresInSeconds: PASSWORD_RESET_TTL_SECONDS,
    });
  } catch (error) {
    next(error);
  }
};

export const confirmPasswordReset = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const code = String(req.body.code || '').trim();
    const newPassword = String(req.body.newPassword || '');

    if (!email || !code || newPassword.length < 6) {
      throw new AppError('Email, code, and newPassword are required', 400);
    }

    const resetCode = await db<AuthPasswordResetCodeModel>('auth_password_reset_codes')
      .where({ email, code })
      .whereNull('consumed_at')
      .orderBy('id', 'desc')
      .first();

    if (!resetCode) {
      throw new AppError('Invalid reset code', 401);
    }

    if (new Date(resetCode.expires_at).getTime() < Date.now()) {
      throw new AppError('Reset code expired', 401);
    }

    const user = await db<UserModel>('users').where({ email }).whereNull('deleted_at').first();

    if (!user) {
      throw new AppError('User not found', 404);
    }

    await db.transaction(async (trx) => {
      await trx('auth_password_reset_codes').where({ id: resetCode.id }).update({
        consumed_at: new Date(),
      });

      await trx('users').where({ id: user.id }).update({
        password_hash: await hashPassword(newPassword),
        updated_at: new Date(),
      });
    });

    const updatedUser = await loadUserById(user.id);

    if (!updatedUser) {
      throw new AppError('User not found', 404);
    }

    issueAuthResponse(res, updatedUser);
  } catch (error) {
    next(error);
  }
};

export const promoteUser = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = Number(req.body.userId);
    const role = req.body.role as UserModel['role'];

    if (!userId || !role) {
      throw new AppError('userId and role are required', 400);
    }

    await db('users').where({ id: userId }).update({
      role,
      updated_at: new Date(),
    });

    const user = await loadUserById(userId);

    if (!user) {
      throw new AppError('User not found', 404);
    }

    res.json(toUserDto(user));
  } catch (error) {
    next(error);
  }
};

export const getAllUsers = async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const users = await db<UserModel>('users')
      .select(...userColumns)
      .whereNull('deleted_at')
      .orderBy('id', 'asc');

    res.json(users.map(toUserDto));
  } catch (error) {
    next(error);
  }
};
