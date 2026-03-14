import { Knex } from 'knex';
import { createAuthLoginCodesTable, dropAuthLoginCodesTable } from './schema/auth_login_codes';
import { createCategoriesTable, dropCategoriesTable } from './schema/categories';
import { createCompaniesTable, dropCompaniesTable } from './schema/companies';
import { createCompanyManagersTable, dropCompanyManagersTable } from './schema/company_managers';
import { createDishesTable, dropDishesTable } from './schema/dishes';
import { createOrderItemsTable, dropOrderItemsTable } from './schema/order_items';
import {
  createOrderStatusHistoryTable,
  dropOrderStatusHistoryTable,
} from './schema/order_status_history';
import { createOrdersTable, dropOrdersTable } from './schema/orders';
import { createRouteCompaniesTable, dropRouteCompaniesTable } from './schema/route_companies';
import { createRoutesTable, dropRoutesTable } from './schema/routes';
import { createUsersTable, dropUsersTable } from './schema/users';

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
