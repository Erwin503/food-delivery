export interface DishDto {
  id: number;
  categoryId: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  basePriceCents: number;
  discountPriceCents: number;
  priceCents: number;
  isActive: boolean;
  availableWeekdays?: number[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateDishDto {
  categoryId: number;
  name: string;
  description?: string | null;
  basePriceCents: number;
  discountPriceCents: number;
  isActive?: boolean;
  availableWeekdays?: number[];
}

export interface UpdateDishDto {
  categoryId?: number;
  name?: string;
  description?: string | null;
  basePriceCents?: number;
  discountPriceCents?: number;
  isActive?: boolean;
  availableWeekdays?: number[];
}

export interface DishPaginationDto {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
}

export interface PaginatedDishesDto {
  items: DishDto[];
  pagination: DishPaginationDto;
}
