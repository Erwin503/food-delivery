import { createRequire } from 'module';
import { Knex } from 'knex';

const require = createRequire(import.meta.url);

const { createAuthLoginCodesTable, dropAuthLoginCodesTable } = require('./schema/auth_login_codes');
const { createCategoriesTable, dropCategoriesTable } = require('./schema/categories');
const { createCompaniesTable, dropCompaniesTable } = require('./schema/companies');
const { createCompanyManagersTable, dropCompanyManagersTable } = require('./schema/company_managers');
const { createDishesTable, dropDishesTable } = require('./schema/dishes');
const { createOrderItemsTable, dropOrderItemsTable } = require('./schema/order_items');
const {
  createOrderStatusHistoryTable,
  dropOrderStatusHistoryTable,
} = require('./schema/order_status_history');
const { createOrdersTable, dropOrdersTable } = require('./schema/orders');
const { createRouteCompaniesTable, dropRouteCompaniesTable } = require('./schema/route_companies');
const { createRoutesTable, dropRoutesTable } = require('./schema/routes');
const { createUsersTable, dropUsersTable } = require('./schema/users');

export async function up(knex: Knex): Promise<void> {
  await createCompaniesTable(knex);
  await createUsersTable(knex);
  await createAuthLoginCodesTable(knex);
  await createCompanyManagersTable(knex);
  await createCategoriesTable(knex);
  await createDishesTable(knex);
  await createRoutesTable(knex);
  await createRouteCompaniesTable(knex);
  await createOrdersTable(knex);
  await createOrderItemsTable(knex);
  await createOrderStatusHistoryTable(knex);
}

export async function down(knex: Knex): Promise<void> {
  await dropOrderStatusHistoryTable(knex);
  await dropOrderItemsTable(knex);
  await dropOrdersTable(knex);
  await dropRouteCompaniesTable(knex);
  await dropRoutesTable(knex);
  await dropDishesTable(knex);
  await dropCategoriesTable(knex);
  await dropCompanyManagersTable(knex);
  await dropAuthLoginCodesTable(knex);
  await dropUsersTable(knex);
  await dropCompaniesTable(knex);
}
