import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger'; // Подключаем файл логгера

// Middleware для логирования запросов
export const logRequests = (req: Request, res: Response, next: any) => {
  const start = Date.now(); // Начало времени запроса

  // Логируем начало запроса
  logger.info(`Начало запроса: ${req.method} ${req.url}`);

  // По завершении запроса логируем его результат
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(
      `Завершение запроса: ${req.method} ${req.url} - Статус: ${res.statusCode} - Время выполнения: ${duration}ms`
    );
  });

  next(); // Передаем запрос дальше
};
