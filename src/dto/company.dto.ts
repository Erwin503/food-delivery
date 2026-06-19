import { UserDto } from './user.dto';

export interface CompanyDto {
  id: number;
  name: string;
  description: string | null;
  address: string | null;
  debtCents: number;
  createdAt: string;
  updatedAt: string;
}

export type CompanyManagerSummaryDto = Omit<UserDto, 'role'>;

export interface CompanyWithManagerDto extends CompanyDto {
  manager: CompanyManagerSummaryDto | null;
}

export interface CompanyPaginationDto {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
}

export interface PaginatedCompaniesDto {
  items: CompanyWithManagerDto[];
  pagination: CompanyPaginationDto;
}

export interface CreateCompanyDto {
  name: string;
  description?: string | null;
  address?: string | null;
}

export interface UpdateCompanyDto {
  name?: string;
  description?: string | null;
  address?: string | null;
}

export interface AssignCompanyUserDto {
  userId?: number;
  email?: string;
}

export interface CompanyManagerDto {
  companyId: number;
  userId: number;
}

export interface CompanyJoinCodeDto {
  code: string;
  expiresInSeconds: number;
}

export interface JoinCompanyByCodeDto {
  code: string;
}
