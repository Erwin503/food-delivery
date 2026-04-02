export interface CompanyJoinCodeModel {
  id: number;
  company_id: number | null;
  code: string;
  created_by_user_id: number;
  consumed_by_user_id: number | null;
  expires_at: Date | string;
  consumed_at: Date | string | null;
  created_at: Date | string;
}
