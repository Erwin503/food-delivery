import { createLogger, format, transports } from 'winston';

const { combine, timestamp, printf, errors, splat, metadata, colorize, json } = format;

const isProduction = process.env.NODE_ENV === 'production';
const configuredLevel = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

const consoleFormat = printf(({ level, message, timestamp, stack, metadata: extra }) => {
  const serializedMetadata =
    extra && Object.keys(extra).length > 0 ? ` ${JSON.stringify(extra)}` : '';

  return `${timestamp} [${level}]: ${stack || message}${serializedMetadata}`;
});

const logger = createLogger({
  level: configuredLevel,
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    splat(),
    metadata({ fillExcept: ['message', 'level', 'timestamp', 'label'] })
  ),
  transports: [
    new transports.Console({
      format: isProduction ? combine(json()) : combine(colorize(), consoleFormat),
    }),
  ],
});

export const isDebugLoggingEnabled = (): boolean => logger.isLevelEnabled('debug');

export default logger;
