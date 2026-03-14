import { Response, NextFunction } from 'express';
import { AuthRequest } from './authMiddleware';
import logger from '../utils/logger';

export const checkRole = (allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.user && allowedRoles.includes(req.user.role)) {
      next();
      return;
    }

    logger.debug(
      `User role: ${req.user?.role ?? 'anonymous'}, allowed roles: ${allowedRoles.join(', ')}`
    );
    res.status(403).json({ message: 'Forbidden' });
  };
};
