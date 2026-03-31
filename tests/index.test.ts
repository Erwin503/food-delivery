import { after, before } from 'node:test';
import db from '../src/db/knex';
const knexConfig = require('../knexfile');

const testModule = process.env.TEST_MODULE ?? 'all';

before(async () => {
  const environment = process.env.NODE_ENV ?? 'development';
  const config = knexConfig[environment] ?? knexConfig.development;

  await db.migrate.forceFreeMigrationsLock(config);
  await db.migrate.latest(config);
});

if (testModule === 'all' || testModule === 'smoke') {
  require('./app.smoke.test');
}

if (testModule === 'all' || testModule === 'auth') {
  require('./contracts/auth.contract.test');
}

if (testModule === 'all' || testModule === 'companies') {
  require('./contracts/companies.contract.test');
}

if (testModule === 'all' || testModule === 'catalog') {
  require('./contracts/catalog.contract.test');
}

if (testModule === 'all' || testModule === 'routes') {
  require('./contracts/routes.contract.test');
}

if (testModule === 'all' || testModule === 'orders') {
  require('./contracts/orders.contract.test');
}

if (testModule === 'all' || testModule === 'reports') {
  require('./contracts/reports.contract.test');
}

after(async () => {
  await db.destroy();
});
