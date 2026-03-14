import { UserDto } from './user.dto';

export interface LoginStep1Dto {
  email: string;
}

export interface LoginStep1ResponseDto {
  ok: true;
  expiresInSeconds: number;
}

export interface LoginStep2Dto {
  email: string;
  code: string;
}

export interface LoginStep2ResponseDto {
  token: string;
  user: UserDto;
}

export interface PasswordLoginDto {
  email: string;
  password: string;
}

export interface PasswordLoginResponseDto {
  token: string;
  user: UserDto;
}

export interface SetPasswordDto {
  currentPassword?: string;
  newPassword: string;
}

export interface PasswordResetRequestDto {
  email: string;
}

export interface PasswordResetConfirmDto {
  email: string;
  code: string;
  newPassword: string;
}

export interface SignupDto {
  email: string;
  password: string;
}

export interface SignupConfirmDto {
  email: string;
  code: string;
}
