export const getJwtSecret = (): string => process.env.JWT_SECRET || 'dev-secret';

export const getJwtExpiresIn = (): string => process.env.JWT_EXPIRES_IN?.trim() || '1h';

export const generateLoginCode = (): string =>
  Math.floor(100000 + Math.random() * 900000).toString();
