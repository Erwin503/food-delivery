export const getJwtSecret = (): string => process.env.JWT_SECRET || 'dev-secret';

export const getJwtExpiresIn = (): string => process.env.JWT_EXPIRES_IN?.trim() || '1h';

export const generateLoginCode = (): string =>
  Math.floor(1000 + Math.random() * 9000).toString();

const temporaryPasswordAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';

export const generateTemporaryPassword = (length = 12): string =>
  Array.from({ length }, () => temporaryPasswordAlphabet[Math.floor(Math.random() * temporaryPasswordAlphabet.length)]).join('');
