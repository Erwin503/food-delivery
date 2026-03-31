import { createApp } from './app';
import logger from './utils/logger';

const app = createApp();
const port = process.env.PORT || 3000;

app.listen(port, () => {
  logger.info('Server started', { port: Number(port), environment: process.env.NODE_ENV || 'development' });
});
