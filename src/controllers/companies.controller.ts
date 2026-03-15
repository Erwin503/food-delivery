import { NextFunction, Response } from 'express';
import db from '../db/knex';
import { AppError } from '../errors/AppError';
import { AuthRequest } from '../middleware/authMiddleware';
import { CompanyJoinCodeModel, CompanyManagerModel, CompanyModel, UserModel } from '../models';
import { generateLoginCode } from '../utils/auth';
import { toUserDto } from '../utils/userMapper';

const COMPANY_JOIN_CODE_TTL_SECONDS = 900;

const companyColumns = ['id', 'name', 'description', 'address', 'created_at', 'updated_at', 'deleted_at'] as const;
const userColumns = [
  'id',
  'email',
  'role',
  'company_id',
  'password_hash',
  'email_verified_at',
  'full_name',
  'phone',
  'avatar_url',
  'created_at',
  'updated_at',
  'deleted_at',
] as const;

const toIsoString = (value: string | Date | undefined): string =>
  new Date(value ?? new Date(0)).toISOString();

const toCompanyDto = (company: CompanyModel) => ({
  id: company.id,
  name: company.name,
  description: company.description,
  address: company.address,
  createdAt: toIsoString(company.created_at),
  updatedAt: toIsoString(company.updated_at),
});

const loadCompanyById = async (id: number): Promise<CompanyModel | undefined> =>
  db<CompanyModel>('companies')
    .select(...companyColumns)
    .where({ id })
    .whereNull('deleted_at')
    .first();

const loadUserById = async (id: number): Promise<UserModel | undefined> =>
  db<UserModel>('users')
    .select(...userColumns)
    .where({ id })
    .whereNull('deleted_at')
    .first();

const loadUserByEmail = async (email: string): Promise<UserModel | undefined> =>
  db<UserModel>('users')
    .select(...userColumns)
    .where({ email })
    .whereNull('deleted_at')
    .first();

const requireCompany = async (id: number): Promise<CompanyModel> => {
  const company = await loadCompanyById(id);

  if (!company) {
    throw new AppError('Company not found', 404);
  }

  return company;
};

const requireUserById = async (id: number): Promise<UserModel> => {
  const user = await loadUserById(id);

  if (!user) {
    throw new AppError('User not found', 404);
  }

  return user;
};

const requireCurrentUser = async (req: AuthRequest): Promise<UserModel> => {
  if (!req.user?.id) {
    throw new AppError('Unauthorized', 401);
  }

  return requireUserById(req.user.id);
};

const requireCompanyVisibility = async (req: AuthRequest, companyId: number): Promise<CompanyModel> => {
  const company = await requireCompany(companyId);

  if (req.user?.role === 'admin') {
    return company;
  }

  if (req.user?.role === 'manager' && req.user.companyId === companyId) {
    return company;
  }

  throw new AppError('Forbidden', 403);
};

const requireManagerOrAdminForCompany = async (req: AuthRequest, companyId: number): Promise<CompanyModel> => {
  const company = await requireCompany(companyId);

  if (req.user?.role === 'admin') {
    return company;
  }

  if (req.user?.role !== 'manager' || req.user.companyId !== companyId) {
    throw new AppError('Forbidden', 403);
  }

  return company;
};

const loadCompanyManager = async (companyId: number): Promise<UserModel | undefined> =>
  db<UserModel>('company_managers as cm')
    .join<UserModel>('users as u', 'u.id', 'cm.user_id')
    .select(
      'u.id',
      'u.email',
      'u.role',
      'u.company_id',
      'u.password_hash',
      'u.email_verified_at',
      'u.full_name',
      'u.phone',
      'u.avatar_url',
      'u.created_at',
      'u.updated_at',
      'u.deleted_at'
    )
    .where('cm.company_id', companyId)
    .whereNull('u.deleted_at')
    .first();

const normalizeEmail = (email: unknown): string => String(email || '').trim().toLowerCase();

export const getCompanies = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user || !['admin', 'manager'].includes(req.user.role)) {
      throw new AppError('Forbidden', 403);
    }

    const query = db<CompanyModel>('companies')
      .select(...companyColumns)
      .whereNull('deleted_at')
      .orderBy('id', 'asc');

    if (req.user?.role !== 'admin') {
      if (!req.user?.companyId) {
        res.json([]);
        return;
      }

      query.andWhere({ id: req.user.companyId });
    }

    const companies = await query;
    res.json(companies.map(toCompanyDto));
  } catch (error) {
    next(error);
  }
};

export const getCompanyById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const companyId = Number(req.params.id);

    if (!companyId) {
      throw new AppError('Company id is required', 400);
    }

    const company = await requireCompanyVisibility(req, companyId);
    res.json(toCompanyDto(company));
  } catch (error) {
    next(error);
  }
};

export const createCompany = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user?.role !== 'admin') {
      throw new AppError('Forbidden', 403);
    }

    const name = String(req.body.name || '').trim();
    const description = req.body.description ?? null;
    const address = req.body.address ?? null;

    if (!name) {
      throw new AppError('Company name is required', 400);
    }

    const now = new Date();
    const inserted = await db('companies').insert({
      name,
      description,
      address,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    });

    const companyId = Array.isArray(inserted) ? Number(inserted[0]) : Number(inserted);
    const company = await requireCompany(companyId);
    res.status(201).json(toCompanyDto(company));
  } catch (error) {
    next(error);
  }
};

export const updateCompany = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const companyId = Number(req.params.id);

    if (!companyId) {
      throw new AppError('Company id is required', 400);
    }

    await requireManagerOrAdminForCompany(req, companyId);

    const patch: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if ('name' in req.body) {
      const name = String(req.body.name || '').trim();

      if (!name) {
        throw new AppError('Company name cannot be empty', 400);
      }

      patch.name = name;
    }

    if ('description' in req.body) {
      patch.description = req.body.description ?? null;
    }

    if ('address' in req.body) {
      patch.address = req.body.address ?? null;
    }

    await db('companies').where({ id: companyId }).update(patch);

    const company = await requireCompany(companyId);
    res.json(toCompanyDto(company));
  } catch (error) {
    next(error);
  }
};

export const deleteCompany = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user?.role !== 'admin') {
      throw new AppError('Forbidden', 403);
    }

    const companyId = Number(req.params.id);

    if (!companyId) {
      throw new AppError('Company id is required', 400);
    }

    await requireCompany(companyId);

    const now = new Date();
    await db('companies').where({ id: companyId }).update({
      deleted_at: now,
      updated_at: now,
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const getCompanyUsers = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const companyId = Number(req.params.id);

    if (!companyId) {
      throw new AppError('Company id is required', 400);
    }

    await requireManagerOrAdminForCompany(req, companyId);

    const users = await db<UserModel>('users')
      .select(...userColumns)
      .where({ company_id: companyId })
      .whereNull('deleted_at')
      .orderBy('id', 'asc');

    res.json(users.map(toUserDto));
  } catch (error) {
    next(error);
  }
};

export const assignCompanyUser = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user?.role !== 'admin') {
      throw new AppError('Forbidden', 403);
    }

    const companyId = Number(req.params.id);

    if (!companyId) {
      throw new AppError('Company id is required', 400);
    }

    await requireCompany(companyId);

    const userId = req.body.userId ? Number(req.body.userId) : null;
    const email = req.body.email !== undefined ? normalizeEmail(req.body.email) : '';

    let user: UserModel | undefined;

    if (userId) {
      user = await loadUserById(userId);
    } else if (email) {
      user = await loadUserByEmail(email);
    } else {
      throw new AppError('userId or email is required', 400);
    }

    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (user.role === 'admin') {
      throw new AppError('Admin cannot be assigned to a company', 409);
    }

    const managerMapping = await db<CompanyManagerModel>('company_managers').where({ user_id: user.id }).first();

    if (managerMapping && managerMapping.company_id !== companyId) {
      throw new AppError('Manager must be reassigned through the manager endpoint', 409);
    }

    await db('users').where({ id: user.id }).update({
      company_id: companyId,
      updated_at: new Date(),
    });

    const updatedUser = await requireUserById(user.id);
    res.json(toUserDto(updatedUser));
  } catch (error) {
    next(error);
  }
};

export const removeCompanyUser = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const companyId = Number(req.params.id);
    const userId = Number(req.params.userId);

    if (!companyId || !userId) {
      throw new AppError('Company id and user id are required', 400);
    }

    await requireManagerOrAdminForCompany(req, companyId);

    const user = await requireUserById(userId);

    if (user.company_id !== companyId) {
      throw new AppError('User does not belong to this company', 404);
    }

    const managerMapping = await db<CompanyManagerModel>('company_managers').where({ company_id: companyId }).first();

    if (req.user?.role === 'manager' && managerMapping?.user_id === userId) {
      throw new AppError('Manager cannot remove the current company manager', 409);
    }

    await db.transaction(async (trx) => {
      if (managerMapping?.user_id === userId) {
        await trx('company_managers').where({ company_id: companyId }).delete();
      }

      await trx('users').where({ id: userId }).update({
        company_id: null,
        role: user.role === 'manager' ? 'employee' : user.role,
        updated_at: new Date(),
      });
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const getCompanyManager = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const companyId = Number(req.params.id);

    if (!companyId) {
      throw new AppError('Company id is required', 400);
    }

    await requireCompanyVisibility(req, companyId);

    const manager = await loadCompanyManager(companyId);
    res.json(manager ? toUserDto(manager) : null);
  } catch (error) {
    next(error);
  }
};

export const setCompanyManager = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const companyId = Number(req.params.id);
    const userId = Number(req.body.userId);

    if (!companyId || !userId) {
      throw new AppError('Company id and userId are required', 400);
    }

    const isAdmin = req.user?.role === 'admin';
    const isCurrentCompanyManager = req.user?.role === 'manager' && req.user.companyId === companyId;

    if (!isAdmin && !isCurrentCompanyManager) {
      throw new AppError('Forbidden', 403);
    }

    await requireCompany(companyId);
    const nextManager = await requireUserById(userId);

    if (nextManager.role === 'admin') {
      throw new AppError('Admin cannot be assigned as company manager', 409);
    }

    if (isCurrentCompanyManager) {
      if (nextManager.company_id !== companyId) {
        throw new AppError('Manager can transfer role only inside the same company', 409);
      }

      if (nextManager.role !== 'employee') {
        throw new AppError('Manager role can be transferred only to an employee', 409);
      }
    }

    const currentManager = await db<CompanyManagerModel>('company_managers').where({ company_id: companyId }).first();
    const userManagerMapping = await db<CompanyManagerModel>('company_managers').where({ user_id: userId }).first();
    const now = new Date();

    await db.transaction(async (trx) => {
      if (currentManager && currentManager.user_id !== userId) {
        await trx('users').where({ id: currentManager.user_id }).update({
          role: 'employee',
          updated_at: now,
        });

        await trx('company_managers').where({ company_id: companyId }).delete();
      }

      if (userManagerMapping && userManagerMapping.company_id !== companyId) {
        await trx('company_managers').where({ user_id: userId }).delete();
      }

      await trx('users').where({ id: userId }).update({
        company_id: companyId,
        role: 'manager',
        updated_at: now,
      });

      await trx('company_managers').where({ company_id: companyId }).delete();
      await trx('company_managers').insert({
        company_id: companyId,
        user_id: userId,
        created_at: now,
      });
    });

    const manager = await loadCompanyManager(companyId);

    if (!manager) {
      throw new AppError('Manager not found', 404);
    }

    res.json(toUserDto(manager));
  } catch (error) {
    next(error);
  }
};

export const createCompanyJoinCode = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const companyId = Number(req.params.id);

    if (!companyId) {
      throw new AppError('Company id is required', 400);
    }

    await requireManagerOrAdminForCompany(req, companyId);

    const currentUser = await requireCurrentUser(req);
    const code = generateLoginCode();
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + COMPANY_JOIN_CODE_TTL_SECONDS * 1000);

    await db('company_join_codes').insert({
      company_id: companyId,
      code,
      created_by_user_id: currentUser.id,
      consumed_by_user_id: null,
      consumed_at: null,
      expires_at: expiresAt,
      created_at: createdAt,
    });

    res.status(201).json({
      code,
      expiresInSeconds: COMPANY_JOIN_CODE_TTL_SECONDS,
    });
  } catch (error) {
    next(error);
  }
};

export const joinCompanyByCode = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const currentUser = await requireCurrentUser(req);
    const code = String(req.body.code || '').trim();

    if (!code) {
      throw new AppError('Code is required', 400);
    }

    if (currentUser.role !== 'employee') {
      throw new AppError('Only employee users can join a company by code', 403);
    }

    if (currentUser.company_id) {
      throw new AppError('User already belongs to a company', 409);
    }

    const joinCode = await db<CompanyJoinCodeModel>('company_join_codes')
      .where({ code })
      .whereNull('consumed_at')
      .orderBy('id', 'desc')
      .first();

    if (!joinCode) {
      throw new AppError('Invalid company join code', 401);
    }

    if (new Date(joinCode.expires_at).getTime() < Date.now()) {
      throw new AppError('Company join code expired', 401);
    }

    await requireCompany(joinCode.company_id);

    const now = new Date();
    await db.transaction(async (trx) => {
      await trx('company_join_codes').where({ id: joinCode.id }).update({
        consumed_by_user_id: currentUser.id,
        consumed_at: now,
      });

      await trx('users').where({ id: currentUser.id }).update({
        company_id: joinCode.company_id,
        updated_at: now,
      });
    });

    const updatedUser = await requireUserById(currentUser.id);
    res.json(toUserDto(updatedUser));
  } catch (error) {
    next(error);
  }
};
