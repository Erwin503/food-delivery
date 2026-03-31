import { Response, NextFunction } from 'express';
import { AuthRequest } from './authMiddleware';
import { AppError } from '../errors/AppError';

export const checkRole = (allowedRoles: string[]) => {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (req.user && allowedRoles.includes(req.user.role)) {
      next();
      return;
    }

    next(new AppError('Forbidden', 403, true, 'FORBIDDEN'));
  };
};
