import { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

type ErrorResponseBody = {
  status: 'error';
  message: string;
  error: {
    message: string;
    code: string;
    statusCode: number;
  };
};

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response<ErrorResponseBody>,
  _next: NextFunction
) => {
  const appError =
    err instanceof AppError
      ? err
      : new AppError('Internal server error', 500, false, 'INTERNAL_SERVER_ERROR');

  const errorCode = appError.code || `HTTP_${appError.statusCode}`;

  logger[appError.statusCode >= 500 ? 'error' : 'warn']('Request failed', {
    method: req.method,
    path: req.originalUrl,
    statusCode: appError.statusCode,
    code: errorCode,
    message: appError.message,
    stack: appError.isOperational ? undefined : appError.stack,
  });

  res.status(appError.statusCode).json({
    status: 'error',
    message: appError.message,
    error: {
      message: appError.message,
      code: errorCode,
      statusCode: appError.statusCode,
    },
  });
};
