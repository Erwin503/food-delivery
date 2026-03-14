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
  userId: number;
}

export interface CompanyManagerDto {
  companyId: number;
  userId: number;
}
