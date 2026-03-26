import { NextFunction, Request, Response } from 'express';
import db from '../db/knex';
import { AppError } from '../errors/AppError';
import { AuthRequest } from '../middleware/authMiddleware';
import { CategoryModel, CompanyModel, DishModel } from '../models';
import { buildUploadedFileUrl } from '../middleware/uploadMiddleware';

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
  'created_at',
  'updated_at',
  'deleted_at',
] as const;

const toIsoString = (value: string | Date | undefined): string =>
  new Date(value ?? new Date(0)).toISOString();

type CompanySubscriptionRow = Pick<CompanyModel, 'id' | 'subscription_expires_at'>;

const hasActiveSubscription = (company?: CompanySubscriptionRow | null): boolean =>
  Boolean(company?.subscription_expires_at && new Date(company.subscription_expires_at).getTime() > Date.now());

const toCategoryDto = (category: CategoryRow) => ({
  id: category.id,
  name: category.name,
  sortOrder: category.sort_order,
  imageUrl: category.image_url,
  createdAt: toIsoString(category.created_at),
  updatedAt: toIsoString(category.updated_at),
});

const toDishDto = (dish: DishRow, discounted: boolean) => ({
  id: dish.id,
  categoryId: dish.category_id,
  name: dish.name,
  description: dish.description,
  imageUrl: dish.image_url,
  basePriceCents: dish.base_price_cents,
  discountPriceCents: dish.discount_price_cents,
  priceCents: discounted ? dish.discount_price_cents : dish.base_price_cents,
  isActive: Boolean(dish.is_active),
  createdAt: toIsoString(dish.created_at),
  updatedAt: toIsoString(dish.updated_at),
});

const loadCompanyForUser = async (
  companyId: number | null | undefined
): Promise<CompanySubscriptionRow | undefined> => {
  if (!companyId) {
    return undefined;
  }

  return db<CompanyModel>('companies')
    .select('id', 'subscription_expires_at')
    .where({ id: companyId })
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

const requireCategory = async (id: number): Promise<CategoryRow> => {
  const category = await loadCategoryById(id);

  if (!category) {
    throw new AppError('Category not found', 404);
  }

  return category;
};

const requireDish = async (id: number): Promise<DishRow> => {
  const dish = await loadDishById(id);

  if (!dish) {
    throw new AppError('Dish not found', 404);
  }

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
    const categoryId = Number(req.params.id);

    if (!categoryId) {
      throw new AppError('Category id is required', 400);
    }

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
    const categoryId = Number(req.params.id);

    if (!categoryId) {
      throw new AppError('Category id is required', 400);
    }

    await requireCategory(categoryId);

    const patch: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if ('name' in req.body) {
      const name = String(req.body.name || '').trim();

      if (!name) {
        throw new AppError('Category name cannot be empty', 400);
      }

      patch.name = name;
    }

    if ('sortOrder' in req.body) {
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
    const categoryId = Number(req.params.id);

    if (!categoryId) {
      throw new AppError('Category id is required', 400);
    }

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
    const company = await loadCompanyForUser(req.user?.companyId);
    const discounted = hasActiveSubscription(company);

    const query = db<DishRow>('dishes as d')
      .join<CategoryRow>('categories as c', 'c.id', 'd.category_id')
      .select(
        'd.id',
        'd.category_id',
        'd.name',
        'd.description',
        'd.base_price_cents',
        'd.discount_price_cents',
        'd.is_active',
        'd.created_at',
        'd.updated_at',
        'd.deleted_at'
      )
      .whereNull('d.deleted_at')
      .whereNull('c.deleted_at')
      .orderBy('d.id', 'asc');

    if (req.query.categoryId !== undefined) {
      const categoryId = Number(req.query.categoryId);

      if (!categoryId) {
        throw new AppError('categoryId must be a number', 400);
      }

      query.andWhere('d.category_id', categoryId);
    }

    if (req.query.isActive !== undefined) {
      const rawIsActive = String(req.query.isActive).toLowerCase();

      if (!['true', 'false'].includes(rawIsActive)) {
        throw new AppError('isActive must be true or false', 400);
      }

      query.andWhere('d.is_active', rawIsActive === 'true');
    }

    const dishes = await query;
    res.json(dishes.map((dish) => toDishDto(dish as DishRow, discounted)));
  } catch (error) {
    next(error);
  }
};

export const getDishById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const dishId = Number(req.params.id);

    if (!dishId) {
      throw new AppError('Dish id is required', 400);
    }

    const company = await loadCompanyForUser(req.user?.companyId);
    const dish = await requireDish(dishId);
    res.json(toDishDto(dish, hasActiveSubscription(company)));
  } catch (error) {
    next(error);
  }
};

export const getDishesByCategory = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const categoryId = Number(req.params.id);

    if (!categoryId) {
      throw new AppError('Category id is required', 400);
    }

    await requireCategory(categoryId);

    const company = await loadCompanyForUser(req.user?.companyId);
    const dishes = await db<DishRow>('dishes')
      .select(...dishColumns)
      .where({ category_id: categoryId })
      .whereNull('deleted_at')
      .orderBy('id', 'asc');

    res.json(dishes.map((dish) => toDishDto(dish, hasActiveSubscription(company))));
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
    const dishId = Number(req.params.id);

    if (!dishId) {
      throw new AppError('Dish id is required', 400);
    }

    const currentDish = await requireDish(dishId);
    const patch: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if ('categoryId' in req.body) {
      const categoryId = Number(req.body.categoryId);

      if (!categoryId) {
        throw new AppError('categoryId must be a number', 400);
      }

      await requireCategory(categoryId);
      patch.category_id = categoryId;
    }

    if ('name' in req.body) {
      const name = String(req.body.name || '').trim();

      if (!name) {
        throw new AppError('Dish name cannot be empty', 400);
      }

      patch.name = name;
    }

    if ('description' in req.body) {
      patch.description = req.body.description ?? null;
    }

    if (req.file) {
      patch.image_url = buildUploadedFileUrl(req.file.filename);
    }

    if ('basePriceCents' in req.body) {
      const basePriceCents = Number(req.body.basePriceCents);

      if (!Number.isFinite(basePriceCents)) {
        throw new AppError('basePriceCents must be a number', 400);
      }

      patch.base_price_cents = basePriceCents;
    }

    if ('discountPriceCents' in req.body) {
      const discountPriceCents = Number(req.body.discountPriceCents);

      if (!Number.isFinite(discountPriceCents)) {
        throw new AppError('discountPriceCents must be a number', 400);
      }

      patch.discount_price_cents = discountPriceCents;
    }

    if ('isActive' in req.body) {
      patch.is_active = Boolean(req.body.isActive);
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
    const dishId = Number(req.params.id);

    if (!dishId) {
      throw new AppError('Dish id is required', 400);
    }

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
