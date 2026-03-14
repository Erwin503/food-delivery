export interface RouteDto {
  id: number;
  name: string;
  departureAt: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRouteDto {
  name: string;
  departureAt: string;
  description?: string | null;
}

export interface UpdateRouteDto {
  name?: string;
  departureAt?: string;
  description?: string | null;
}

export interface AssignRouteCompanyDto {
  companyId: number;
}
