import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger';
import { AuthTokenPayload } from '../interfaces/auth';
import { getJwtSecret } from '../utils/auth';

export interface AuthRequest extends Request {
  user?: AuthTokenPayload;
}

export const authenticateToken = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
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

  jwt.verify(token, getJwtSecret(), (err, user) => {
    if (err) {
      logger.error(err);
      res.status(403).json({ message: 'Invalid token' });
      return;
    }

    req.user = user as AuthTokenPayload;
    next();
  });
};
