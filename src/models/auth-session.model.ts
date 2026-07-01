export interface AuthSessionModel {
  id: number;
  user_id: number;
  firebase_token: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}