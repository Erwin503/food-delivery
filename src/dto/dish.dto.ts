export interface DishDto {
  id: number;
  categoryId: number;
  name: string;
  description: string | null;
  priceCents: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDishDto {
  categoryId: number;
  name: string;
  description?: string | null;
  priceCents: number;
  isActive?: boolean;
}

export interface UpdateDishDto {
  categoryId?: number;
  name?: string;
  description?: string | null;
  priceCents?: number;
  isActive?: boolean;
}
