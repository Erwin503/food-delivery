import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('company_join_codes', (table) => {
    table.integer('company_id').unsigned().nullable().alter();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('company_join_codes', (table) => {
    table.integer('company_id').unsigned().notNullable().alter();
  });
}
