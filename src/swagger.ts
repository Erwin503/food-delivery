import swaggerJSDoc from 'swagger-jsdoc';
import { version, name, description } from '../package.json';

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Med Service API',
    version,         // подтянется из package.json
    description,     // подтянется из package.json
  },
  servers: [
    { url: 'http://localhost:3000/api', description: 'Локальный сервер' }
  ],
};

export const swaggerSpec = swaggerJSDoc({
  swaggerDefinition,
  // здесь указываем, где искать аннотации в коде:
  apis: ['./src/routes/**/*.ts', './src/authRoutes.ts'], 
});
