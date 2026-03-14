import { Knex } from 'knex';

export async function createDishesTable(knex: Knex): Promise<void> {
  await knex.schema.createTable('dishes', (table) => {
    table.increments('id').primary();
    table
      .integer('category_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('categories')
      .onDelete('RESTRICT');
    table.string('name', 255).notNullable();
    table.text('description').nullable();
    table.integer('price_cents').unsigned().notNullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('deleted_at').nullable();

    table.index(['category_id'], 'dishes_category_id_idx');
    table.index(['is_active'], 'dishes_is_active_idx');
    table.unique(['category_id', 'name'], {
      indexName: 'dishes_category_id_name_unique',
    });
  });
}

export async function dropDishesTable(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('dishes');
}
