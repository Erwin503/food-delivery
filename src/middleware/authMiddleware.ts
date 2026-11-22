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

  let user: AuthTokenPayload;
  try {
    user = jwt.verify(token, getJwtSecret()) as AuthTokenPayload;
  } catch (error) {
    if (!(error instanceof jwt.JsonWebTokenError)) {
      next(error);
      return;
    }
    res.status(403).json({ message: 'Invalid token', code: 'INVALID_TOKEN' });
    return;
  }

  try {
    const currentUser = await db('users')
      .select('id', 'email', 'role', 'company_id', 'deleted_at')
      .where({ id: user.id })
      .whereNull('deleted_at')
      .first();

    if (!currentUser) {
      res.status(401).json({ message: 'User not found or inactive' });
      return;
    }

    if (user.sessionId) {
      const session = await db('auth_sessions')
        .select('id')
        .where({ id: user.sessionId, user_id: user.id })
        .first();

      if (!session) {
        res.status(403).json({ message: 'Session has ended', code: 'SESSION_ENDED' });
        return;
      }
    }

    req.user = {
      ...user,
      id: currentUser.id,
      email: currentUser.email,
      role: currentUser.role,
      companyId: currentUser.company_id,
    };
    next();
  } catch (error) {
    logger.error(error);
    next(error);
  }
};
