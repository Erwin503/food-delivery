import { Knex } from 'knex';

export async function createOrderItemsTable(knex: Knex): Promise<void> {
  await knex.schema.createTable('order_items', (table) => {
    table
      .integer('order_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('orders')
      .onDelete('CASCADE');
    table
      .integer('dish_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('dishes')
      .onDelete('RESTRICT');
    table.integer('qty').unsigned().notNullable();
    table.integer('price_cents').unsigned().notNullable();
    table.integer('line_total_cents').unsigned().notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.primary(['order_id', 'dish_id']);
    table.index(['dish_id'], 'order_items_dish_id_idx');
  });
}

export async function dropOrderItemsTable(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('order_items');
}
