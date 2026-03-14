import { createLogger, format, transports } from 'winston';

const { combine, timestamp, printf, errors } = format;

// Определяем формат вывода логов
const logFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} [${level}]: ${stack || message}`;
});

// Создаем логгер
const logger = createLogger({
  level: 'debug',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    logFormat
  ),
  transports: [
    new transports.Console({
      format: combine(
        format.colorize(), // Цветовая разметка только для консоли
        logFormat
      ),
    }),
    new transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: logFormat, // Отключаем цветовую разметку для файлов
    }),
    new transports.File({
      filename: 'logs/combined.log',
      format: logFormat, // Отключаем цветовую разметку для файлов
    }),
  ],
});

export default logger;
