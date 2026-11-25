import type { WeeklyRouteSchedule } from '../models/route.model';

export interface RouteDto {
  id: number;
  name: string;
  departureAt: string;
  orderAcceptanceEndsAt: string;
  schedule: WeeklyRouteSchedule & { timeZone: string };
  description: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  companies?: Array<{
    id: number;
    name: string;
  }>;
}

export interface CreateRouteDto {
  name: string;
  schedule: WeeklyRouteSchedule;
  description?: string | null;
  companyIds?: number[];
}

export interface UpdateRouteDto {
  name?: string;
  schedule?: WeeklyRouteSchedule;
  description?: string | null;
  companyIds?: number[];
}

export interface AssignRouteCompanyDto {
  companyId: number;
}
