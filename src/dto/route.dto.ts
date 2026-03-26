export interface RouteDto {
  id: number;
  name: string;
  departureAt: string;
  orderAcceptanceEndsAt: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  companies?: Array<{
    id: number;
    name: string;
  }>;
}

export interface CreateRouteDto {
  name: string;
  departureAt: string;
  orderAcceptanceEndsAt: string;
  description?: string | null;
  companyIds?: number[];
}

export interface UpdateRouteDto {
  name?: string;
  departureAt?: string;
  orderAcceptanceEndsAt?: string;
  description?: string | null;
  companyIds?: number[];
}

export interface AssignRouteCompanyDto {
  companyId: number;
}
