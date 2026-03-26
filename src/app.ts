import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import apiRoutes from './routes/index';
import { logRequests } from './middleware/logger';
import { errorHandler } from './middleware/errorHandler';
import { swaggerSpec } from './swagger';

export const createApp = () => {
  dotenv.config();

  const app = express();

  app.use(
    cors({
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      credentials: true,
    })
  );

  app.use(express.json());
  app.use(logRequests);
  app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.use('/api', apiRoutes);
  app.use(errorHandler);

  return app;
};
