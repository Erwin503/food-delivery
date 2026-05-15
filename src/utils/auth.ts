import { randomInt } from 'crypto';

export const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET?.trim();

  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required in production');
  }

  return 'dev-secret';
};

export const getJwtExpiresIn = (): string => process.env.JWT_EXPIRES_IN?.trim() || '1h';

export const generateLoginCode = (): string =>
  randomInt(1000, 10000).toString();

const temporaryPasswordAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';

export const generateTemporaryPassword = (length = 12): string =>
  Array.from(
    { length },
    () => temporaryPasswordAlphabet[randomInt(0, temporaryPasswordAlphabet.length)]
  ).join('');
