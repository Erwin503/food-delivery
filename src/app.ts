import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import apiRoutes from './routes/index';
import { logRequests } from './middleware/logger';
import { errorHandler } from './middleware/errorHandler';
import { swaggerSpec } from './swagger';
import db from './db/knex';
import { getMailHealth } from './utils/mailService';

export const createApp = () => {
  dotenv.config();

  const app = express();
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

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
  app.get('/api-docs/openapi.json', (req, res) => {
    const forwardedProtoHeader = req.headers['x-forwarded-proto'];
    const forwardedProto = Array.isArray(forwardedProtoHeader)
      ? forwardedProtoHeader[0]
      : forwardedProtoHeader?.split(',')[0];
    const protocol = (forwardedProto || req.protocol || 'http').trim();
    const host = req.get('host');
    const serverUrl = host ? `${protocol}://${host}/api` : '/api';

    res.json({
      ...swaggerSpec,
      servers: [
        {
          url: serverUrl,
          description: 'Current server',
        },
      ],
    });
  });
  app.get('/health', async (_req, res, next) => {
    try {
      await db.raw('SELECT 1');
      res.json({
        status: 'ok',
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
        mail: getMailHealth(),
      });
    } catch (error) {
      next(error);
    }
  });
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(undefined, {
      swaggerOptions: {
        url: '/api-docs/openapi.json',
      },
    })
  );
  app.use('/api', apiRoutes);
  app.use(errorHandler);

  return app;
};
