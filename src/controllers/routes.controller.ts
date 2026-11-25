import { NextFunction, Response } from 'express';
import { Knex } from 'knex';
import db from '../db/knex';
import type { RouteDto } from '../dto/route.dto';
import { AppError } from '../errors/AppError';
import { AuthRequest } from '../middleware/authMiddleware';
import { CompanyModel, RouteModel, UserModel } from '../models';
import { BUSINESS_TIME_ZONE } from '../utils/businessTime';
import { toNullableIsoString } from '../utils/dateMapper';
import { requireEntity } from '../utils/entityGuards';
import { parseRequiredId } from '../utils/requestParams';
import {
  getNextScheduledRoute,
  parseWeeklyRouteSchedule,
  readRouteSchedule,
} from '../utils/routeSchedule';
import { requireAuthenticatedUser } from '../utils/userQueries';

const routeColumns = [
  'id',
  'name',
  'schedule',
  'description',
  'created_at',
  'updated_at',
  'deleted_at',
] as const;

const companyColumns = ['id', 'name'] as const;
const lastRouteFilterTime = Date.parse('9999-12-31T23:59:59.999Z');

const isOmittedValue = (value: unknown): boolean =>
  value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

const parseRouteDate = (value: string | Date): Date => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new AppError('Route dates must be valid ISO date strings', 400);
  }

  return date;
};

const parseRouteFilterDate = (value: string): Date => {
  const date = parseRouteDate(value);
  const year = date.getUTCFullYear();
  if (year < 1000 || year > 9999) {
    throw new AppError('Route filter dates must use years from 1000 to 9999', 400);
  }
  return date;
};

const rejectAbsoluteRouteTimes = (body: Record<string, unknown>): void => {
  if (body.departureAt !== undefined || body.orderAcceptanceEndsAt !== undefined) {
    throw new AppError('Set route times in schedule', 400);
  }
};

const toRouteDto = (
  route: RouteModel,
  from: Date,
  companies?: Array<Pick<CompanyModel, 'id' | 'name'>>
): RouteDto => {
  const schedule = readRouteSchedule(route.schedule);
  const times = getNextScheduledRoute(schedule, from);
  return {
    id: route.id,
    name: route.name,
    departureAt: times.departureAt.toISOString(),
    orderAcceptanceEndsAt: times.orderAcceptanceEndsAt.toISOString(),
    schedule: { ...schedule, timeZone: BUSINESS_TIME_ZONE },
    description: route.description,
    createdAt: toNullableIsoString(route.created_at),
    updatedAt: toNullableIsoString(route.updated_at),
    companies: companies?.map((company) => ({
      id: company.id,
      name: company.name,
    })),
  };
};

const normalizeCompanyIds = (value: unknown): number[] => {
  if (isOmittedValue(value)) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new AppError('companyIds must be an array', 400);
  }

  const companyIds = value.map(Number);

  if (companyIds.some((companyId) => !Number.isInteger(companyId) || companyId < 1)) {
    throw new AppError('companyIds must contain positive integers', 400);
  }

  return [...new Set(companyIds)];
};

const replaceRouteCompanies = async (
  trx: Knex.Transaction,
  routeId: number,
  companyIds: number[],
  clearCurrentRoute: boolean
): Promise<void> => {
  if (companyIds.length === 0) {
    if (clearCurrentRoute) {
      await trx('route_companies').where({ route_id: routeId }).delete();
    }
    return;
  }

  const companies = await trx<CompanyModel>('companies')
    .select('id')
    .whereIn('id', companyIds)
    .whereNull('deleted_at')
    .orderBy('id')
    .forUpdate();

  if (companies.length !== companyIds.length) {
    throw new AppError('Company not found', 404);
  }

  const assignments = await trx('route_companies as rc')
    .join('routes as r', 'r.id', 'rc.route_id')
    .whereIn('rc.company_id', companyIds)
    .select('rc.company_id', 'rc.route_id', 'r.deleted_at as route_deleted_at');
  if (assignments.some((assignment) => assignment.route_id !== routeId && !assignment.route_deleted_at)) {
    throw new AppError('One or more companies are already assigned to another route', 409);
  }

  if (clearCurrentRoute) {
    await trx('route_companies').where({ route_id: routeId }).whereNotIn('company_id', companyIds).delete();
  }
  const archivedCompanyIds = assignments.filter((assignment) => assignment.route_deleted_at)
    .map((assignment) => assignment.company_id);
  if (archivedCompanyIds.length > 0) {
    await trx('route_companies').whereIn('company_id', archivedCompanyIds).delete();
  }
  const assignedHere = new Set(assignments.filter((assignment) => assignment.route_id === routeId)
    .map((assignment) => assignment.company_id));
  const newCompanyIds = companyIds.filter((companyId) => !assignedHere.has(companyId));
  if (newCompanyIds.length > 0) {
    await trx('route_companies').insert(newCompanyIds.map((companyId) => ({
      route_id: routeId,
      company_id: companyId,
      created_at: new Date(),
    })));
  }
};

const requireRoute = async (id: number, trx?: Knex.Transaction): Promise<RouteModel> =>
  requireEntity(
    () => {
      const query = (trx ?? db)<RouteModel>('routes')
        .select(...routeColumns)
        .where({ id })
        .whereNull('deleted_at');
      return (trx ? query.forUpdate() : query).first();
    },
    'Route not found'
  );

const loadRouteCompanies = async (routeId: number): Promise<Array<Pick<CompanyModel, 'id' | 'name'>>> =>
  db<CompanyModel>('companies as c')
    .join('route_companies as rc', 'rc.company_id', 'c.id')
    .select(...companyColumns.map((column) => `c.${column}`))
    .where('rc.route_id', routeId)
    .whereNull('c.deleted_at')
    .orderBy('c.id', 'asc');

export const getAvailableRouteCompanies = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    await requireAuthenticatedUser(req.user);

    const companies = await db<CompanyModel>('companies as c')
      .leftJoin('route_companies as rc', 'rc.company_id', 'c.id')
      .leftJoin('routes as r', function joinActiveRoute() {
        this.on('r.id', '=', 'rc.route_id').andOnNull('r.deleted_at');
      })
      .select(...companyColumns.map((column) => `c.${column}`))
      .whereNull('c.deleted_at')
      .whereNull('r.id')
      .orderBy('c.id', 'asc');

    res.json(companies);
  } catch (error) {
    next(error);
  }
};

export const getRoutes = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await requireAuthenticatedUser(req.user);

    const dateFrom = req.query.dateFrom ? parseRouteFilterDate(String(req.query.dateFrom)) : null;
    const dateTo = req.query.dateTo ? parseRouteFilterDate(String(req.query.dateTo)) : null;
    const from = dateFrom ?? new Date(Date.now() + 1);
    const activeRoutes = await db<RouteModel>('routes').select(...routeColumns).whereNull('deleted_at');

    const routes = activeRoutes
      .map((route) => toRouteDto(route, from))
      .filter((route) => Date.parse(route.departureAt) <= (dateTo?.getTime() ?? lastRouteFilterTime))
      .sort((left, right) => left.departureAt.localeCompare(right.departureAt));
    res.json(routes);
  } catch (error) {
    next(error);
  }
};

export const getRouteById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await requireAuthenticatedUser(req.user);
    const routeId = parseRequiredId(req.params.id, 'Route id');

    const route = await requireRoute(routeId);
    const companies = await loadRouteCompanies(routeId);
    res.json(toRouteDto(route, new Date(Date.now() + 1), companies));
  } catch (error) {
    next(error);
  }
};

export const createRoute = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await requireAuthenticatedUser(req.user);
    const { name, description, companyIds } = req.body;
    rejectAbsoluteRouteTimes(req.body);
    if (!name) {
      throw new AppError('name is required', 400);
    }

    const schedule = parseWeeklyRouteSchedule(req.body.schedule);
    const normalizedCompanyIds = normalizeCompanyIds(companyIds);
    const now = new Date(Date.now());

    const insertedId = await db.transaction(async (trx) => {
      const result = await trx('routes').insert({
        name: String(name),
        schedule: JSON.stringify(schedule),
        description: description ?? null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      });

      const routeId = Array.isArray(result) ? Number(result[0]) : Number(result);

      await replaceRouteCompanies(trx, routeId, normalizedCompanyIds, false);

      return routeId;
    });

    const route = await requireRoute(insertedId);
    const companies = await loadRouteCompanies(insertedId);
    res.status(201).json(toRouteDto(route, new Date(Date.now() + 1), companies));
  } catch (error) {
    next(error);
  }
};

export const updateRoute = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await requireAuthenticatedUser(req.user);
    const routeId = parseRequiredId(req.params.id, 'Route id');

    const patch: Record<string, unknown> = {
      updated_at: new Date(),
    };

    rejectAbsoluteRouteTimes(req.body);
    if (req.body.schedule !== undefined) {
      patch.schedule = JSON.stringify(parseWeeklyRouteSchedule(req.body.schedule));
    }
    if (!isOmittedValue(req.body.name)) {
      patch.name = req.body.name;
    }
    if (req.body.description !== undefined) {
      patch.description = req.body.description ?? null;
    }

    await db.transaction(async (trx) => {
      await requireRoute(routeId, trx);
      await trx('routes').where({ id: routeId }).update(patch);

      if (!isOmittedValue(req.body.companyIds)) {
        await replaceRouteCompanies(trx, routeId, normalizeCompanyIds(req.body.companyIds), true);
      }
    });

    const route = await requireRoute(routeId);
    const companies = await loadRouteCompanies(routeId);
    res.json(toRouteDto(route, new Date(Date.now() + 1), companies));
  } catch (error) {
    next(error);
  }
};

export const deleteRoute = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await requireAuthenticatedUser(req.user);
    const routeId = parseRequiredId(req.params.id, 'Route id');

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
    await requireAuthenticatedUser(req.user);
    const routeId = parseRequiredId(req.params.id, 'Route id');

    await requireRoute(routeId);
    const companies = await loadRouteCompanies(routeId);
    res.json(companies);
  } catch (error) {
    next(error);
  }
};

export const assignRouteCompany = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await requireAuthenticatedUser(req.user);
    const routeId = parseRequiredId(req.params.id, 'Route id');
    const companyId = parseRequiredId(req.body.companyId, 'Company id');

    await db.transaction(async (trx) => {
      await requireRoute(routeId, trx);
      await replaceRouteCompanies(trx, routeId, [companyId], false);
    });

    const companies = await loadRouteCompanies(routeId);
    res.json(companies);
  } catch (error) {
    next(error);
  }
};

export const removeRouteCompany = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await requireAuthenticatedUser(req.user);
    const routeId = parseRequiredId(req.params.id, 'Route id');
    const companyId = parseRequiredId(req.params.companyId, 'Company id');

    await db.transaction(async (trx) => {
      await requireRoute(routeId, trx);
      await trx('companies').where({ id: companyId }).forUpdate().first();
      await trx('route_companies').where({ route_id: routeId, company_id: companyId }).delete();
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
