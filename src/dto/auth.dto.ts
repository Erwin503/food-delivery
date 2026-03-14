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
