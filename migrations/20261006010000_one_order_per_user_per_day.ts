import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('orders', (table) => {
    table.date('order_day').nullable().after('created_at');
  });

  await knex.raw(`
    UPDATE orders AS current_order
    INNER JOIN (
      SELECT user_id, DATE(created_at) AS order_day, MAX(id) AS latest_order_id
      FROM orders
      GROUP BY user_id, DATE(created_at)
    ) AS latest_order
      ON latest_order.latest_order_id = current_order.id
    SET current_order.order_day = latest_order.order_day
  `);

  await knex.schema.alterTable('orders', (table) => {
    table.unique(['user_id', 'order_day'], 'orders_user_order_day_unique');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('orders', (table) => {
    table.dropUnique(['user_id', 'order_day'], 'orders_user_order_day_unique');
    table.dropColumn('order_day');
  });
}
