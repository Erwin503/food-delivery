export interface AuthEmailVerificationCodeModel {
  id: number;
  email: string;
  code: string;
  expires_at: Date | string;
  consumed_at: Date | string | null;
  created_at: Date | string;
}
