import jwt from 'jsonwebtoken';
import logger, { isDebugLoggingEnabled } from '../utils/logger';
import { getJwtExpiresIn, getJwtSecret } from './auth';

export const generateToken = (payload: object): string => {
  const secret = getJwtSecret();
  const expiresIn = getJwtExpiresIn();
  const token = jwt.sign(payload, secret, { expiresIn });

  if (isDebugLoggingEnabled()) {
    logger.debug('JWT token generated');
  }

  return token;
};
