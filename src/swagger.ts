import path from 'path';
import swaggerJSDoc from 'swagger-jsdoc';
import { version, description } from '../package.json';

const publicApiUrl = process.env.PUBLIC_API_URL?.trim();

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Cook API',
    version,
    description,
  },
  servers: [
    {
      url: publicApiUrl || '/api',
      description: publicApiUrl ? 'Configured API server' : 'Current server',
    },
  ],
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
  apis: [
    path.join(__dirname, 'routes/**/*.js'),
    path.join(process.cwd(), 'src/routes/**/*.ts'),
  ],
});
