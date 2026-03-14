import swaggerJSDoc from 'swagger-jsdoc';
import { version, description } from '../package.json';

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Cook API',
    version,
    description,
  },
  servers: [{ url: 'http://localhost:3000/api', description: 'Local server' }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
};

export const swaggerSpec = swaggerJSDoc({
  swaggerDefinition,
  apis: ['./src/routes/**/*.ts'],
});
