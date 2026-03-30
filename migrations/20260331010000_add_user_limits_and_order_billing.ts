import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.integer('order_limit_cents').notNullable().defaultTo(0);
    table.integer('debt_cents').notNullable().defaultTo(0);
  });

  await knex.schema.alterTable('orders', (table) => {
    table.integer('company_paid_cents').notNullable().defaultTo(0);
    table.integer('employee_debt_cents').notNullable().defaultTo(0);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('orders', (table) => {
    table.dropColumn('employee_debt_cents');
    table.dropColumn('company_paid_cents');
  });

  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('debt_cents');
    table.dropColumn('order_limit_cents');
  });
}
