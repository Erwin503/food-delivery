import { NextFunction, Response } from 'express';
import db from '../db/knex';
import { AppError } from '../errors/AppError';
import { AuthRequest } from '../middleware/authMiddleware';
import { CompanyModel, RouteModel, UserModel } from '../models';

const routeColumns = [
  'id',
  'name',
  'departure_at',
  'order_acceptance_ends_at',
  'description',
  'created_at',
  'updated_at',
  'deleted_at',
] as const;

const companyColumns = ['id', 'name'] as const;

const toIsoString = (value: string | Date | undefined | null): string | null =>
  value ? new Date(value).toISOString() : null;

const toSqlDateTime = (value: string | Date): string => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new AppError('Route dates must be valid ISO date strings', 400);
  }

  return date.toISOString().slice(0, 19).replace('T', ' ');
};

const toRouteDto = (
  route: RouteModel,
  companies?: Array<Pick<CompanyModel, 'id' | 'name'>>
) => ({
  id: route.id,
  name: route.name,
  departureAt: new Date(route.departure_at).toISOString(),
  orderAcceptanceEndsAt: new Date(route.order_acceptance_ends_at).toISOString(),
  description: route.description,
  createdAt: toIsoString(route.created_at),
  updatedAt: toIsoString(route.updated_at),
  companies: companies?.map((company) => ({
    id: company.id,
    name: company.name,
  })),
});

const requireAdmin = async (req: AuthRequest): Promise<UserModel> => {
  if (!req.user?.id) {
    throw new AppError('Unauthorized', 401);
  }

  const user = await db<UserModel>('users')
    .select('id', 'email', 'role', 'company_id', 'password_hash', 'email_verified_at', 'full_name', 'phone', 'avatar_url', 'created_at', 'updated_at', 'deleted_at')
    .where({ id: req.user.id })
    .whereNull('deleted_at')
    .first();

  if (!user) {
    throw new AppError('User not found', 404);
  }

  if (user.role !== 'admin') {
    throw new AppError('Forbidden', 403);
  }

  return user;
};

const validateRouteTimes = (departureAt: string, orderAcceptanceEndsAt: string) => {
  const departureDate = new Date(departureAt);
  const cutoffDate = new Date(orderAcceptanceEndsAt);

  if (Number.isNaN(departureDate.getTime()) || Number.isNaN(cutoffDate.getTime())) {
    throw new AppError('Route dates must be valid ISO date strings', 400);
  }

  if (cutoffDate.getTime() >= departureDate.getTime()) {
    throw new AppError('Order acceptance end time must be before departure time', 400);
  }
};

const requireRoute = async (id: number): Promise<RouteModel> => {
  const route = await db<RouteModel>('routes')
    .select(...routeColumns)
    .where({ id })
    .whereNull('deleted_at')
    .first();

  if (!route) {
    throw new AppError('Route not found', 404);
  }

  return route;
};

const loadRouteCompanies = async (routeId: number): Promise<Array<Pick<CompanyModel, 'id' | 'name'>>> =>
  db<CompanyModel>('companies as c')
    .join('route_companies as rc', 'rc.company_id', 'c.id')
    .select(...companyColumns.map((column) => `c.${column}`))
    .where('rc.route_id', routeId)
    .whereNull('c.deleted_at')
    .orderBy('c.name', 'asc');

export const getRoutes = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await requireAdmin(req);

    const query = db<RouteModel>('routes')
      .select(...routeColumns)
      .whereNull('deleted_at')
      .orderBy('departure_at', 'asc');

    if (req.query.dateFrom) {
      query.andWhere('departure_at', '>=', toSqlDateTime(String(req.query.dateFrom)));
    }

    if (req.query.dateTo) {
      query.andWhere('departure_at', '<=', toSqlDateTime(String(req.query.dateTo)));
    }

    const routes = await query;
    res.json(routes.map((route) => toRouteDto(route)));
  } catch (error) {
    next(error);
  }
};

export const getRouteById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await requireAdmin(req);
    const routeId = Number(req.params.id);

    if (!routeId) {
      throw new AppError('Route id is required', 400);
    }

    const route = await requireRoute(routeId);
    const companies = await loadRouteCompanies(routeId);
    res.json(toRouteDto(route, companies));
  } catch (error) {
    next(error);
  }
};

export const createRoute = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await requireAdmin(req);
    const { name, departureAt, orderAcceptanceEndsAt, description, companyIds } = req.body;

    if (!name || !departureAt || !orderAcceptanceEndsAt) {
      throw new AppError('name, departureAt, and orderAcceptanceEndsAt are required', 400);
    }

    validateRouteTimes(departureAt, orderAcceptanceEndsAt);

    const now = new Date();
    const insertedId = await db.transaction(async (trx) => {
      const result = await trx('routes').insert({
        name: String(name),
        departure_at: toSqlDateTime(departureAt),
        order_acceptance_ends_at: toSqlDateTime(orderAcceptanceEndsAt),
        description: description ?? null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      });

      const routeId = Array.isArray(result) ? Number(result[0]) : Number(result);

      if (Array.isArray(companyIds) && companyIds.length > 0) {
        const rows = companyIds.map((companyId: number) => ({
          route_id: routeId,
          company_id: Number(companyId),
          created_at: now,
        }));

        await trx('route_companies').insert(rows);
      }

      return routeId;
    });

    const route = await requireRoute(insertedId);
    const companies = await loadRouteCompanies(insertedId);
    res.status(201).json(toRouteDto(route, companies));
  } catch (error) {
    next(error);
  }
};

export const updateRoute = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await requireAdmin(req);
    const routeId = Number(req.params.id);

    if (!routeId) {
      throw new AppError('Route id is required', 400);
    }

    await requireRoute(routeId);

    const patch: Record<string, unknown> = {
      updated_at: new Date(),
    };

    const departureAt = req.body.departureAt;
    const orderAcceptanceEndsAt = req.body.orderAcceptanceEndsAt;

    if (departureAt || orderAcceptanceEndsAt) {
      const current = await requireRoute(routeId);
      validateRouteTimes(
        String(departureAt ?? current.departure_at),
        String(orderAcceptanceEndsAt ?? current.order_acceptance_ends_at)
      );
    }

    if ('name' in req.body) {
      patch.name = req.body.name;
    }
    if ('departureAt' in req.body) {
      patch.departure_at = toSqlDateTime(req.body.departureAt);
    }
    if ('orderAcceptanceEndsAt' in req.body) {
      patch.order_acceptance_ends_at = toSqlDateTime(req.body.orderAcceptanceEndsAt);
    }
    if ('description' in req.body) {
      patch.description = req.body.description ?? null;
    }

    await db.transaction(async (trx) => {
      await trx('routes').where({ id: routeId }).update(patch);

      if (Array.isArray(req.body.companyIds)) {
        await trx('route_companies').where({ route_id: routeId }).delete();

        if (req.body.companyIds.length > 0) {
          await trx('route_companies').insert(
            req.body.companyIds.map((companyId: number) => ({
              route_id: routeId,
              company_id: Number(companyId),
              created_at: new Date(),
            }))
          );
        }
      }
    });

    const route = await requireRoute(routeId);
    const companies = await loadRouteCompanies(routeId);
    res.json(toRouteDto(route, companies));
  } catch (error) {
    next(error);
  }
};

export const deleteRoute = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await requireAdmin(req);
    const routeId = Number(req.params.id);

    if (!routeId) {
      throw new AppError('Route id is required', 400);
    }

    await requireRoute(routeId);

    await db('routes').where({ id: routeId }).update({
      deleted_at: new Date(),
      updated_at: new Date(),
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const getRouteCompanies = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await requireAdmin(req);
    const routeId = Number(req.params.id);

    if (!routeId) {
      throw new AppError('Route id is required', 400);
    }

    await requireRoute(routeId);
    const companies = await loadRouteCompanies(routeId);
    res.json(companies);
  } catch (error) {
    next(error);
  }
};

export const assignRouteCompany = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await requireAdmin(req);
    const routeId = Number(req.params.id);
    const companyId = Number(req.body.companyId);

    if (!routeId || !companyId) {
      throw new AppError('Route id and companyId are required', 400);
    }

    await requireRoute(routeId);

    const company = await db<CompanyModel>('companies')
      .select('id', 'name')
      .where({ id: companyId })
      .whereNull('deleted_at')
      .first();

    if (!company) {
      throw new AppError('Company not found', 404);
    }

    await db('route_companies')
      .insert({
        route_id: routeId,
        company_id: companyId,
        created_at: new Date(),
      })
      .onConflict(['route_id', 'company_id'])
      .ignore();

    const companies = await loadRouteCompanies(routeId);
    res.json(companies);
  } catch (error) {
    next(error);
  }
};

export const removeRouteCompany = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await requireAdmin(req);
    const routeId = Number(req.params.id);
    const companyId = Number(req.params.companyId);

    if (!routeId || !companyId) {
      throw new AppError('Route id and company id are required', 400);
    }

    await requireRoute(routeId);
    await db('route_companies').where({ route_id: routeId, company_id: companyId }).delete();
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
