import { createApp } from './app';
import logger from './utils/logger';
import { isMailConfigured, verifyMailConnection } from './utils/mailService';

const app = createApp();
const port = process.env.PORT || 3000;

app.listen(port, () => {
  logger.info('Server started', { port: Number(port), environment: process.env.NODE_ENV || 'development' });

  if (isMailConfigured()) {
    verifyMailConnection().catch((error) => {
      logger.error('SMTP verification task failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  } else {
    logger.warn('SMTP is not configured. Email delivery is disabled.');
  }
});
