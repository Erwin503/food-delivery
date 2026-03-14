import { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/AppError";
import logger from "../utils/logger";

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error("Ошибка:", err);

  // Если ошибка не является экземпляром AppError, считаем её системной
  if (!(err instanceof AppError)) {
    err = new AppError("Непредвиденная ошибка сервера", 500, false);
  }
  logger.error(err.message);

  res.status(err.statusCode).json({
    status: "error",
    message: err.message,
  });
};
