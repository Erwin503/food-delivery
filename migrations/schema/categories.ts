import { Knex } from 'knex';

export async function createCategoriesTable(knex: Knex): Promise<void> {
  await knex.schema.createTable('categories', (table) => {
    table.increments('id').primary();
    table.string('name', 255).notNullable().unique();
    table.integer('sort_order').notNullable().defaultTo(0);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('deleted_at').nullable();

    table.index(['sort_order'], 'categories_sort_order_idx');
  });
}

export async function dropCategoriesTable(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('categories');
}
