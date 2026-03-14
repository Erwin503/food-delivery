import { Knex } from 'knex';

export async function createCompaniesTable(knex: Knex): Promise<void> {
  await knex.schema.createTable('companies', (table) => {
    table.increments('id').primary();
    table.string('name', 255).notNullable();
    table.text('description').nullable();
    table.string('address', 500).nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('deleted_at').nullable();
  });
}

export async function dropCompaniesTable(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('companies');
}
