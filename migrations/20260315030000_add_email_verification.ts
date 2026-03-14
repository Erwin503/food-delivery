import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.timestamp('email_verified_at').nullable();
  });

  await knex.schema.createTable('auth_email_verification_codes', (table) => {
    table.increments('id').primary();
    table.string('email', 255).notNullable();
    table.string('code', 12).notNullable();
    table.timestamp('expires_at').notNullable();
    table.timestamp('consumed_at').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.index(['email', 'created_at'], 'auth_email_verification_codes_email_created_at_idx');
    table.index(['email', 'code'], 'auth_email_verification_codes_email_code_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('auth_email_verification_codes');

  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('email_verified_at');
  });
}
