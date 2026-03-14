export type UserRole = 'employee' | 'manager' | 'admin';

export interface UserDto {
  id: number;
  email: string;
  role: UserRole;
  companyId: number | null;
  fullName: string | null;
  phone: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateProfileDto {
  fullName?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
}

export interface PromoteUserDto {
  userId: number;
  role: UserRole;
}
