export interface TimestampColumns {
  created_at: Date | string;
  updated_at?: Date | string;
  deleted_at?: Date | string | null;
}

export interface SoftDeleteColumns extends TimestampColumns {
  deleted_at: Date | string | null;
}
