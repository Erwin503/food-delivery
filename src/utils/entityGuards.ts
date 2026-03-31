import { AppError } from '../errors/AppError';

export const requireEntity = async <T>(
  loader: () => Promise<T | undefined>,
  notFoundMessage: string
): Promise<T> => {
  const entity = await loader();

  if (!entity) {
    throw new AppError(notFoundMessage, 404);
  }

  return entity;
};
