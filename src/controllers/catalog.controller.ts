import { NextFunction, Request, Response } from 'express';
import type { Knex } from 'knex';
import db from '../db/knex';
import { AppError } from '../errors/AppError';
import { AuthRequest } from '../middleware/authMiddleware';
import { CategoryModel, DishModel, UserModel } from '../models';
import { buildUploadedFileUrl } from '../middleware/uploadMiddleware';
import { toIsoString } from '../utils/dateMapper';
import { requireEntity } from '../utils/entityGuards';
import { parseRequiredId } from '../utils/requestParams';
import { requireAuthenticatedUser } from '../utils/userQueries';

type CategoryRow = CategoryModel;
type DishRow = DishModel;

const categoryColumns = ['id', 'name', 'sort_order', 'image_url', 'created_at', 'updated_at', 'deleted_at'] as const;
const dishColumns = [
  'id',
  'category_id',
  'name',
  'description',
  'image_url',
  'base_price_cents',
  'discount_price_cents',
  'is_active',
  'available_weekdays',
  'created_at',
  'updated_at',
  'deleted_at',
] as const;

type UserSubscriptionRow = Pick<UserModel, 'id' | 'subscription_expires_at'>;

type DishListFilters = {
  page: number;
  limit: number;
  categoryId?: number;
  isActive?: boolean;
  query?: string;
};

const DEFAULT_DISHES_PAGE_SIZE = 20;
const MAX_DISHES_PAGE_SIZE = 100;
const ALL_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
const BUSINESS_TIME_ZONE = process.env.BUSINESS_TIME_ZONE?.trim() || 'Europe/Moscow';

const hasActiveSubscription = (user?: UserSubscriptionRow | null): boolean =>
  Boolean(user?.subscription_expires_at && new Date(user.subscription_expires_at).getTime() > Date.now());

const isOmittedValue = (value: unknown): boolean =>
  value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

const parseAvailableWeekdays = (value: unknown): number[] => {
  let parsed = value;

  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      throw new AppError('availableWeekdays must be an array of numbers from 1 to 7', 400);
    }
  }

  if (!Array.isArray(parsed)) {
    throw new AppError('availableWeekdays must be an array of numbers from 1 to 7', 400);
  }

  const weekdays = Array.from(new Set(parsed.map(Number))).sort((left, right) => left - right);

  if (weekdays.length === 0 || weekdays.some((weekday) => !Number.isInteger(weekday) || weekday < 1 || weekday > 7)) {
    throw new AppError('availableWeekdays must contain numbers from 1 to 7', 400);
  }

  return weekdays;
};

const readAvailableWeekdays = (value: unknown): number[] => {
  try {
    return parseAvailableWeekdays(value);
  } catch {
    return ALL_WEEKDAYS;
  }
};

const getCurrentIsoWeekday = (): number => {
  const weekday = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: BUSINESS_TIME_ZONE,
  }).format(new Date());
  const weekdayMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };

  return weekdayMap[weekday] ?? 1;
};
const parsePositiveIntegerQuery = (value: unknown, fieldName: string, defaultValue: number): number => {
  if (value === undefined) {
    return defaultValue;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new AppError(`${fieldName} must be a positive integer`, 400);
  }

  return parsed;
};

const parseDishListFilters = (query: Request['query'], requireQuery: boolean): DishListFilters => {
  const page = parsePositiveIntegerQuery(query.page, 'page', 1);
  const limit = parsePositiveIntegerQuery(query.limit, 'limit', DEFAULT_DISHES_PAGE_SIZE);

  if (limit > MAX_DISHES_PAGE_SIZE) {
    throw new AppError(`limit must not exceed ${MAX_DISHES_PAGE_SIZE}`, 400);
  }

  const filters: DishListFilters = { page, limit };

  if (query.categoryId !== undefined) {
    const categoryId = Number(query.categoryId);

    if (!Number.isInteger(categoryId) || categoryId < 1) {
      throw new AppError('categoryId must be a positive integer', 400);
    }

    filters.categoryId = categoryId;
  }

  if (query.isActive !== undefined) {
    const rawIsActive = String(query.isActive).toLowerCase();

    if (!['true', 'false'].includes(rawIsActive)) {
      throw new AppError('isActive must be true or false', 400);
    }

    filters.isActive = rawIsActive === 'true';
  }

  const rawQuery = query.q === undefined ? '' : String(query.q).trim();

  if (requireQuery && !rawQuery) {
    throw new AppError('q is required', 400);
  }

  if (rawQuery.length > 100) {
    throw new AppError('q must not exceed 100 characters', 400);
  }

  if (rawQuery) {
    filters.query = rawQuery;
  }

  return filters;
};

const buildDishesListQuery = (filters: DishListFilters, includeUnavailableDishes: boolean): Knex.QueryBuilder => {
  const query = db<DishRow>('dishes as d')
    .join<CategoryRow>('categories as c', 'c.id', 'd.category_id')
    .whereNull('d.deleted_at')
    .whereNull('c.deleted_at');

  if (filters.categoryId) {
    query.andWhere('d.category_id', filters.categoryId);
  }

  if (filters.isActive !== undefined) {
    query.andWhere('d.is_active', filters.isActive);
  }

  if (!includeUnavailableDishes) {
    query
      .andWhere('d.is_active', true)
      .andWhereRaw('JSON_CONTAINS(d.available_weekdays, CAST(? AS JSON))', [String(getCurrentIsoWeekday())]);
  }

  if (filters.query) {
    const pattern = `%${filters.query}%`;
    query.andWhere((builder) => {
      builder.where('d.name', 'like', pattern).orWhere('d.description', 'like', pattern);
    });
  }

  return query;
};

const listDishes = async (user: UserModel, filters: DishListFilters) => {
  const includeUnavailableDishes = user.role === 'admin';
  const query = buildDishesListQuery(filters, includeUnavailableDishes);
  const offset = (filters.page - 1) * filters.limit;

  const [totalRow, dishes] = await Promise.all([
    query.clone().count<{ total: number | string }>({ total: 'd.id' }).first(),
    query
      .clone()
      .select(
        'd.id',
        'd.category_id',
        'd.name',
        'd.description',
        'd.image_url',
        'd.base_price_cents',
        'd.discount_price_cents',
        'd.is_active',
        'd.available_weekdays',
        'd.created_at',
        'd.updated_at',
        'd.deleted_at'
      )
      .orderBy('d.id', 'asc')
      .limit(filters.limit)
      .offset(offset),
  ]);

  const totalItems = Number(totalRow?.total ?? 0);

  return {
    items: dishes.map((dish: DishRow) =>
      toDishDto(dish, hasActiveSubscription(user), includeUnavailableDishes)
    ),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      totalItems,
      totalPages: Math.ceil(totalItems / filters.limit),
    },
  };
};

const toCategoryDto = (category: CategoryRow) => ({
  id: category.id,
  name: category.name,
  sortOrder: category.sort_order,
  imageUrl: category.image_url,
  createdAt: toIsoString(category.created_at),
  updatedAt: toIsoString(category.updated_at),
});

const toDishDto = (dish: DishRow, discounted: boolean, includeAvailableWeekdays = false) => ({
  id: dish.id,
  categoryId: dish.category_id,
  name: dish.name,
  description: dish.description,
  imageUrl: dish.image_url,
  basePriceCents: dish.base_price_cents,
  discountPriceCents: dish.discount_price_cents,
  priceCents: discounted ? dish.discount_price_cents : dish.base_price_cents,
  isActive: Boolean(dish.is_active),
  ...(includeAvailableWeekdays ? { availableWeekdays: readAvailableWeekdays(dish.available_weekdays) } : {}),
  createdAt: toIsoString(dish.created_at),
  updatedAt: toIsoString(dish.updated_at),
});

const loadUserSubscription = async (
  userId: number | undefined
): Promise<UserSubscriptionRow | undefined> => {
  if (!userId) {
    return undefined;
  }

  return db<UserModel>('users')
    .select('id', 'subscription_expires_at')
    .where({ id: userId })
    .whereNull('deleted_at')
    .first();
};

const loadCategoryById = async (id: number): Promise<CategoryRow | undefined> =>
  db<CategoryRow>('categories')
    .select(...categoryColumns)
    .where({ id })
    .whereNull('deleted_at')
    .first();

const loadDishById = async (id: number): Promise<DishRow | undefined> =>
  db<DishRow>('dishes')
    .select(...dishColumns)
    .where({ id })
    .whereNull('deleted_at')
    .first();

const requireCategory = async (id: number): Promise<CategoryRow> =>
  requireEntity(() => loadCategoryById(id), 'Category not found');

const requireDish = async (id: number): Promise<DishRow> => {
  const dish = await requireEntity(() => loadDishById(id), 'Dish not found');

  await requireCategory(dish.category_id);

  return dish;
};

const getNextCategorySortOrder = async (): Promise<number> => {
  const row = await db<CategoryRow>('categories').max<{ maxSortOrder: number | null }>('sort_order as maxSortOrder').first();
  return (row?.maxSortOrder ?? 0) + 10;
};

export const getCategories = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const categories = await db<CategoryRow>('categories')
      .select(...categoryColumns)
      .whereNull('deleted_at')
      .orderBy('sort_order', 'asc')
      .orderBy('id', 'asc');

    res.json(categories.map(toCategoryDto));
  } catch (error) {
    next(error);
  }
};

export const getCategoryById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const categoryId = parseRequiredId(req.params.id, 'Category id');

    const category = await requireCategory(categoryId);
    res.json(toCategoryDto(category));
  } catch (error) {
    next(error);
  }
};

export const createCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const name = String(req.body.name || '').trim();
    const sortOrder =
      req.body.sortOrder === undefined ? await getNextCategorySortOrder() : Number(req.body.sortOrder);
    const imageUrl = req.file ? buildUploadedFileUrl(req.file.filename) : null;

    if (!name) {
      throw new AppError('Category name is required', 400);
    }

    if (!Number.isFinite(sortOrder)) {
      throw new AppError('sortOrder must be a number', 400);
    }

    const now = new Date();
    const inserted = await db('categories').insert({
      name,
      sort_order: sortOrder,
      image_url: imageUrl,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    });

    const categoryId = Array.isArray(inserted) ? Number(inserted[0]) : Number(inserted);
    const category = await requireCategory(categoryId);

    res.status(201).json(toCategoryDto(category));
  } catch (error) {
    next(error);
  }
};

export const updateCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const categoryId = parseRequiredId(req.params.id, 'Category id');

    await requireCategory(categoryId);

    const patch: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (!isOmittedValue(req.body.name)) {
      const name = String(req.body.name || '').trim();

      if (!name) {
        throw new AppError('Category name cannot be empty', 400);
      }

      patch.name = name;
    }

    if (!isOmittedValue(req.body.sortOrder)) {
      const sortOrder = Number(req.body.sortOrder);

      if (!Number.isFinite(sortOrder)) {
        throw new AppError('sortOrder must be a number', 400);
      }

      patch.sort_order = sortOrder;
    }

    if (req.file) {
      patch.image_url = buildUploadedFileUrl(req.file.filename);
    }

    await db('categories').where({ id: categoryId }).update(patch);

    const category = await requireCategory(categoryId);
    res.json(toCategoryDto(category));
  } catch (error) {
    next(error);
  }
};

export const deleteCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const categoryId = parseRequiredId(req.params.id, 'Category id');

    await requireCategory(categoryId);

    const now = new Date();

    await db.transaction(async (trx) => {
      await trx('categories').where({ id: categoryId }).update({
        deleted_at: now,
        updated_at: now,
      });

      await trx('dishes').where({ category_id: categoryId }).whereNull('deleted_at').update({
        deleted_at: now,
        updated_at: now,
      });
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const getDishes = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await requireAuthenticatedUser(req.user);
    const filters = parseDishListFilters(req.query, false);
    res.json(await listDishes(user, filters));
  } catch (error) {
    next(error);
  }
};

export const searchDishes = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await requireAuthenticatedUser(req.user);
    const filters = parseDishListFilters(req.query, true);
    res.json(await listDishes(user, filters));
  } catch (error) {
    next(error);
  }
};

export const getDishById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const dishId = parseRequiredId(req.params.id, 'Dish id');

    const user = await requireAuthenticatedUser(req.user);
    const dish = await requireDish(dishId);
    res.json(toDishDto(dish, hasActiveSubscription(user), user.role === 'admin'));
  } catch (error) {
    next(error);
  }
};

export const getDishesByCategory = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const categoryId = parseRequiredId(req.params.id, 'Category id');

    await requireCategory(categoryId);

    const user = await requireAuthenticatedUser(req.user);
    const includeUnavailableDishes = user.role === 'admin';
    const query = db<DishRow>('dishes')
      .select(...dishColumns)
      .where({ category_id: categoryId })
      .whereNull('deleted_at')
      .orderBy('id', 'asc');

    if (!includeUnavailableDishes) {
      query
        .andWhere('is_active', true)
        .andWhereRaw('JSON_CONTAINS(available_weekdays, CAST(? AS JSON))', [String(getCurrentIsoWeekday())]);
    }

    const dishes = await query;
    res.json(
      dishes.map((dish) => toDishDto(dish, hasActiveSubscription(user), includeUnavailableDishes))
    );
  } catch (error) {
    next(error);
  }
};

export const createDish = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const categoryId = Number(req.body.categoryId);
    const name = String(req.body.name || '').trim();
    const description = req.body.description === undefined ? null : req.body.description;
    const imageUrl = req.file ? buildUploadedFileUrl(req.file.filename) : null;
    const basePriceCents = Number(req.body.basePriceCents);
    const discountPriceCents = Number(req.body.discountPriceCents);
    const isActive = req.body.isActive === undefined ? true : Boolean(req.body.isActive);
    const availableWeekdays = isOmittedValue(req.body.availableWeekdays)
      ? ALL_WEEKDAYS
      : parseAvailableWeekdays(req.body.availableWeekdays);

    if (
      !categoryId ||
      !name ||
      !Number.isFinite(basePriceCents) ||
      !Number.isFinite(discountPriceCents)
    ) {
      throw new AppError('categoryId, name, basePriceCents, and discountPriceCents are required', 400);
    }

    if (discountPriceCents > basePriceCents) {
      throw new AppError('discountPriceCents cannot exceed basePriceCents', 400);
    }

    await requireCategory(categoryId);

    const now = new Date();
    const inserted = await db('dishes').insert({
      category_id: categoryId,
      name,
      description,
      image_url: imageUrl,
      base_price_cents: basePriceCents,
      discount_price_cents: discountPriceCents,
      is_active: isActive,
      available_weekdays: JSON.stringify(availableWeekdays),
      created_at: now,
      updated_at: now,
      deleted_at: null,
    });

    const dishId = Array.isArray(inserted) ? Number(inserted[0]) : Number(inserted);
    const dish = await requireDish(dishId);

    res.status(201).json(toDishDto(dish, false));
  } catch (error) {
    next(error);
  }
};

export const updateDish = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dishId = parseRequiredId(req.params.id, 'Dish id');

    const currentDish = await requireDish(dishId);
    const patch: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (!isOmittedValue(req.body.categoryId)) {
      const categoryId = Number(req.body.categoryId);

      if (!categoryId) {
        throw new AppError('categoryId must be a number', 400);
      }

      await requireCategory(categoryId);
      patch.category_id = categoryId;
    }

    if (!isOmittedValue(req.body.name)) {
      const name = String(req.body.name || '').trim();

      if (!name) {
        throw new AppError('Dish name cannot be empty', 400);
      }

      patch.name = name;
    }

    if (req.body.description !== undefined) {
      patch.description = req.body.description ?? null;
    }

    if (req.file) {
      patch.image_url = buildUploadedFileUrl(req.file.filename);
    }

    if (!isOmittedValue(req.body.basePriceCents)) {
      const basePriceCents = Number(req.body.basePriceCents);

      if (!Number.isFinite(basePriceCents)) {
        throw new AppError('basePriceCents must be a number', 400);
      }

      patch.base_price_cents = basePriceCents;
    }

    if (!isOmittedValue(req.body.discountPriceCents)) {
      const discountPriceCents = Number(req.body.discountPriceCents);

      if (!Number.isFinite(discountPriceCents)) {
        throw new AppError('discountPriceCents must be a number', 400);
      }

      patch.discount_price_cents = discountPriceCents;
    }

    if (!isOmittedValue(req.body.isActive)) {
      patch.is_active = Boolean(req.body.isActive);
    }

    if (!isOmittedValue(req.body.availableWeekdays)) {
      patch.available_weekdays = JSON.stringify(parseAvailableWeekdays(req.body.availableWeekdays));
    }

    const nextBasePriceCents =
      patch.base_price_cents !== undefined
        ? Number(patch.base_price_cents)
        : currentDish.base_price_cents;
    const nextDiscountPriceCents =
      patch.discount_price_cents !== undefined
        ? Number(patch.discount_price_cents)
        : currentDish.discount_price_cents;

    if (nextDiscountPriceCents > nextBasePriceCents) {
      throw new AppError('discountPriceCents cannot exceed basePriceCents', 400);
    }

    await db('dishes').where({ id: dishId }).update(patch);

    const dish = await requireDish(dishId);
    res.json(toDishDto(dish, false));
  } catch (error) {
    next(error);
  }
};

export const deleteDish = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dishId = parseRequiredId(req.params.id, 'Dish id');

    await requireDish(dishId);

    await db('dishes').where({ id: dishId }).update({
      deleted_at: new Date(),
      updated_at: new Date(),
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
