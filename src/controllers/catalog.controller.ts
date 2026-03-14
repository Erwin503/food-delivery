import { NextFunction, Request, Response } from 'express';
import db from '../db/knex';
import { AppError } from '../errors/AppError';
import { CategoryModel, DishModel } from '../models';

type CategoryRow = CategoryModel;
type DishRow = DishModel;

const categoryColumns = ['id', 'name', 'sort_order', 'created_at', 'updated_at', 'deleted_at'] as const;
const dishColumns = [
  'id',
  'category_id',
  'name',
  'description',
  'price_cents',
  'is_active',
  'created_at',
  'updated_at',
  'deleted_at',
] as const;

const toIsoString = (value: string | Date | undefined): string =>
  new Date(value ?? new Date(0)).toISOString();

const toCategoryDto = (category: CategoryRow) => ({
  id: category.id,
  name: category.name,
  sortOrder: category.sort_order,
  createdAt: toIsoString(category.created_at),
  updatedAt: toIsoString(category.updated_at),
});

const toDishDto = (dish: DishRow) => ({
  id: dish.id,
  categoryId: dish.category_id,
  name: dish.name,
  description: dish.description,
  priceCents: dish.price_cents,
  isActive: Boolean(dish.is_active),
  createdAt: toIsoString(dish.created_at),
  updatedAt: toIsoString(dish.updated_at),
});

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

export const getDishes = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = db<DishRow>('dishes as d')
      .join<CategoryRow>('categories as c', 'c.id', 'd.category_id')
      .select('d.id', 'd.category_id', 'd.name', 'd.description', 'd.price_cents', 'd.is_active', 'd.created_at', 'd.updated_at', 'd.deleted_at')
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
    res.json(dishes.map((dish) => toDishDto(dish as DishRow)));
  } catch (error) {
    next(error);
  }
};

export const getDishById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dishId = Number(req.params.id);

    if (!dishId) {
      throw new AppError('Dish id is required', 400);
    }

    const dish = await requireDish(dishId);
    res.json(toDishDto(dish));
  } catch (error) {
    next(error);
  }
};

export const getDishesByCategory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const categoryId = Number(req.params.id);

    if (!categoryId) {
      throw new AppError('Category id is required', 400);
    }

    await requireCategory(categoryId);

    const dishes = await db<DishRow>('dishes')
      .select(...dishColumns)
      .where({ category_id: categoryId })
      .whereNull('deleted_at')
      .orderBy('id', 'asc');

    res.json(dishes.map(toDishDto));
  } catch (error) {
    next(error);
  }
};

export const createDish = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const categoryId = Number(req.body.categoryId);
    const name = String(req.body.name || '').trim();
    const description = req.body.description === undefined ? null : req.body.description;
    const priceCents = Number(req.body.priceCents);
    const isActive = req.body.isActive === undefined ? true : Boolean(req.body.isActive);

    if (!categoryId || !name || !Number.isFinite(priceCents)) {
      throw new AppError('categoryId, name, and priceCents are required', 400);
    }

    await requireCategory(categoryId);

    const now = new Date();
    const inserted = await db('dishes').insert({
      category_id: categoryId,
      name,
      description,
      price_cents: priceCents,
      is_active: isActive,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    });

    const dishId = Array.isArray(inserted) ? Number(inserted[0]) : Number(inserted);
    const dish = await requireDish(dishId);

    res.status(201).json(toDishDto(dish));
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

    await requireDish(dishId);

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

    if ('priceCents' in req.body) {
      const priceCents = Number(req.body.priceCents);

      if (!Number.isFinite(priceCents)) {
        throw new AppError('priceCents must be a number', 400);
      }

      patch.price_cents = priceCents;
    }

    if ('isActive' in req.body) {
      patch.is_active = Boolean(req.body.isActive);
    }

    await db('dishes').where({ id: dishId }).update(patch);

    const dish = await requireDish(dishId);
    res.json(toDishDto(dish));
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
