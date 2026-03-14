import { Knex } from 'knex';

const ORDER_STATUS = [
  'created',
  'paid',
  'cooking',
  'delivering',
  'completed',
  'cancelled',
] as const;

export async function createOrderStatusHistoryTable(knex: Knex): Promise<void> {
  await knex.schema.createTable('order_status_history', (table) => {
    table.increments('id').primary();
    table
      .integer('order_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('orders')
      .onDelete('CASCADE');
    table
      .enum('from_status', [...ORDER_STATUS], {
        useNative: false,
        enumName: 'order_status_from',
      })
      .nullable();
    table
      .enum('to_status', [...ORDER_STATUS], {
        useNative: false,
        enumName: 'order_status_to',
      })
      .notNullable();
    table
      .integer('changed_by_user_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.index(['order_id', 'created_at'], 'order_status_history_order_id_created_at_idx');
  });
}

export async function dropOrderStatusHistoryTable(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('order_status_history');
}
