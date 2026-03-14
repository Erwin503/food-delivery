import { Knex } from 'knex';

export async function createAuthLoginCodesTable(knex: Knex): Promise<void> {
  await knex.schema.createTable('auth_login_codes', (table) => {
    table.increments('id').primary();
    table.string('email', 255).notNullable();
    table.string('code', 12).notNullable();
    table.timestamp('expires_at').notNullable();
    table.timestamp('consumed_at').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.index(['email', 'created_at'], 'auth_login_codes_email_created_at_idx');
    table.index(['email', 'code'], 'auth_login_codes_email_code_idx');
  });
}

export async function dropAuthLoginCodesTable(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('auth_login_codes');
}
