import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('companies', (table) => {
    table.timestamp('subscription_started_at').nullable();
    table.timestamp('subscription_expires_at').nullable();
  });

  await knex.schema.alterTable('dishes', (table) => {
    table.integer('base_price_cents').unsigned().notNullable().defaultTo(0);
    table.integer('discount_price_cents').unsigned().notNullable().defaultTo(0);
  });

  await knex('dishes').update({
    base_price_cents: knex.ref('price_cents'),
    discount_price_cents: knex.raw('GREATEST(FLOOR(price_cents * 0.9), 0)'),
  });

  await knex.schema.alterTable('dishes', (table) => {
    table.dropColumn('price_cents');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('dishes', (table) => {
    table.integer('price_cents').unsigned().notNullable().defaultTo(0);
  });

  await knex('dishes').update({
    price_cents: knex.ref('base_price_cents'),
  });

  await knex.schema.alterTable('dishes', (table) => {
    table.dropColumn('discount_price_cents');
    table.dropColumn('base_price_cents');
  });

  await knex.schema.alterTable('companies', (table) => {
    table.dropColumn('subscription_expires_at');
    table.dropColumn('subscription_started_at');
  });
}
