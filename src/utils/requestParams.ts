import { AppError } from '../errors/AppError';

export const parseRequiredId = (value: unknown, fieldName: string): number => {
  const parsed = Number(value);

  if (!parsed) {
    throw new AppError(`${fieldName} is required`, 400);
  }

  return parsed;
};
