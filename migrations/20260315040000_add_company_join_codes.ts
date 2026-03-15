import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('company_join_codes', (table) => {
    table.increments('id').primary();
    table
      .integer('company_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');
    table.string('code', 32).notNullable();
    table
      .integer('created_by_user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table
      .integer('consumed_by_user_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('expires_at').notNullable();
    table.timestamp('consumed_at').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.index(['company_id'], 'company_join_codes_company_id_index');
    table.index(['code'], 'company_join_codes_code_index');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('company_join_codes');
}
