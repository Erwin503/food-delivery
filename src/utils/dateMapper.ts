export const toIsoString = (value: string | Date | undefined): string =>
  new Date(value ?? new Date(0)).toISOString();

export const toNullableIsoString = (value: string | Date | undefined | null): string | null =>
  value ? new Date(value).toISOString() : null;
