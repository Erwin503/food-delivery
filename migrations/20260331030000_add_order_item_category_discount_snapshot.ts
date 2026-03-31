import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('order_items', (table) => {
    table.integer('category_id').unsigned().nullable().after('dish_id');
    table.integer('base_price_cents').unsigned().nullable().after('price_cents');
    table.integer('discount_price_cents').unsigned().nullable().after('base_price_cents');
    table.integer('discounted_qty').unsigned().notNullable().defaultTo(0).after('discount_price_cents');
  });

  await knex.raw(`
    UPDATE order_items oi
    JOIN dishes d ON d.id = oi.dish_id
    SET
      oi.category_id = d.category_id,
      oi.base_price_cents = oi.price_cents,
      oi.discount_price_cents = COALESCE(NULLIF(d.discount_price_cents, 0), oi.price_cents),
      oi.discounted_qty = 0
  `);

  await knex.schema.alterTable('order_items', (table) => {
    table.integer('category_id').unsigned().notNullable().alter();
    table.integer('base_price_cents').unsigned().notNullable().alter();
    table.integer('discount_price_cents').unsigned().notNullable().alter();
    table.index(['category_id'], 'order_items_category_id_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('order_items', (table) => {
    table.dropIndex(['category_id'], 'order_items_category_id_idx');
    table.dropColumn('discounted_qty');
    table.dropColumn('discount_price_cents');
    table.dropColumn('base_price_cents');
    table.dropColumn('category_id');
  });
}
