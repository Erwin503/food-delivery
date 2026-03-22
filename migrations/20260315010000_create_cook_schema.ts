import { Knex } from 'knex';
import { createAuthLoginCodesTable, dropAuthLoginCodesTable } from './schema/auth_login_codes.ts';
import { createCategoriesTable, dropCategoriesTable } from './schema/categories.ts';
import { createCompaniesTable, dropCompaniesTable } from './schema/companies.ts';
import { createCompanyManagersTable, dropCompanyManagersTable } from './schema/company_managers.ts';
import { createDishesTable, dropDishesTable } from './schema/dishes.ts';
import { createOrderItemsTable, dropOrderItemsTable } from './schema/order_items.ts';
import {
  createOrderStatusHistoryTable,
  dropOrderStatusHistoryTable,
} from './schema/order_status_history.ts';
import { createOrdersTable, dropOrdersTable } from './schema/orders.ts';
import { createRouteCompaniesTable, dropRouteCompaniesTable } from './schema/route_companies.ts';
import { createRoutesTable, dropRoutesTable } from './schema/routes.ts';
import { createUsersTable, dropUsersTable } from './schema/users.ts';

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
