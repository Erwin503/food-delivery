import { Knex } from 'knex';

export async function createCompanyManagersTable(knex: Knex): Promise<void> {
  await knex.schema.createTable('company_managers', (table) => {
    table
      .integer('company_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');
    table
      .integer('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.primary(['company_id']);
    table.unique(['user_id'], {
      indexName: 'company_managers_user_id_unique',
    });
  });
}

export async function dropCompanyManagersTable(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('company_managers');
}
