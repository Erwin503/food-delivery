export interface CompanyDto {
  id: number;
  name: string;
  description: string | null;
  address: string | null;
  createdAt: string;
  updatedAt: string;
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
