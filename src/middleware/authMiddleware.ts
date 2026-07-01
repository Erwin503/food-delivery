import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import db from '../db/knex';
import logger from '../utils/logger';
import { AuthTokenPayload } from '../interfaces/auth';
import { getJwtSecret } from '../utils/auth';

export interface AuthRequest extends Request {
  user?: AuthTokenPayload;
}

export const authenticateToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ message: 'Authorization header is required' });
    return;
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ message: 'Token is required' });
    return;
  }

  try {
    const user = jwt.verify(token, getJwtSecret()) as AuthTokenPayload;

    if (user.sessionId) {
      const session = await db('auth_sessions')
        .select('id')
        .where({ id: user.sessionId, user_id: user.id })
        .first();

      if (!session) {
        res.status(403).json({ message: 'Session has ended' });
        return;
      }
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error(error);
    res.status(403).json({ message: 'Invalid token' });
  }
};
