import { Knex } from 'knex';

const ORDER_STATUS = [
  'created',
  'paid',
  'cooking',
  'delivering',
  'completed',
  'cancelled',
] as const;

export async function createOrdersTable(knex: Knex): Promise<void> {
  await knex.schema.createTable('orders', (table) => {
    table.increments('id').primary();
    table.string('order_number', 50).nullable().unique();
    table
      .integer('user_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table
      .integer('company_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('RESTRICT');
    table
      .enum('status', [...ORDER_STATUS], {
        useNative: false,
        enumName: 'order_status',
      })
      .notNullable()
      .defaultTo('created');
    table.string('delivery_address', 500).nullable();
    table.string('contact_name', 255).nullable();
    table.string('contact_phone', 50).nullable();
    table.timestamp('scheduled_for').nullable();
    table.integer('subtotal_cents').unsigned().notNullable().defaultTo(0);
    table.integer('delivery_fee_cents').unsigned().notNullable().defaultTo(0);
    table.integer('discount_cents').unsigned().notNullable().defaultTo(0);
    table.integer('total_cents').unsigned().notNullable().defaultTo(0);
    table.text('comment').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('deleted_at').nullable();
    table.timestamp('cancelled_at').nullable();

    table.index(['user_id'], 'orders_user_id_idx');
    table.index(['company_id'], 'orders_company_id_idx');
    table.index(['status'], 'orders_status_idx');
    table.index(['scheduled_for'], 'orders_scheduled_for_idx');
    table.index(['created_at'], 'orders_created_at_idx');
  });
}

export async function dropOrdersTable(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('orders');
}
