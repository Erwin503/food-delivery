import { Knex } from 'knex';

export async function createRoutesTable(knex: Knex): Promise<void> {
  await knex.schema.createTable('routes', (table) => {
    table.increments('id').primary();
    table.string('name', 255).notNullable();
    table.timestamp('departure_at').notNullable();
    table.text('description').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('deleted_at').nullable();

    table.index(['departure_at'], 'routes_departure_at_idx');
  });
}

export async function dropRoutesTable(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('routes');
}
