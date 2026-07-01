export interface AuthSessionModel {
  id: number;
  user_id: number;
  device_id: string | null;
  firebase_token: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}