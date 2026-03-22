require('ts-node/register');
require('dotenv').config();

const baseConfig = {
  client: process.env.DB_CLIENT,
  connection: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  },
};

module.exports = {
  development: {
    ...baseConfig,
    migrations: {
      directory: './migrations',
      extension: 'ts',
      loadExtensions: ['.ts'],
    },
    seeds: {
      directory: './seeds',
      extension: 'ts',
      loadExtensions: ['.ts'],
    },
  },
  production: {
    ...baseConfig,
    migrations: {
      directory: './dist/migrations',
      extension: 'js',
      loadExtensions: ['.js'],
    },
    seeds: {
      directory: './dist/seeds',
      extension: 'js',
      loadExtensions: ['.js'],
    },
  },
};
