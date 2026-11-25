import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('routes', (table) => {
    table.json('schedule').nullable();
  });

  await knex.schema.alterTable('orders', (table) => {
    table.bigInteger('route_departure_unix').unsigned().nullable();
    table.bigInteger('route_acceptance_ends_unix').unsigned().nullable();
    table.index(['route_departure_unix', 'route_id'], 'orders_route_departure_unix_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('orders', (table) => {
    table.dropIndex(['route_departure_unix', 'route_id'], 'orders_route_departure_unix_idx');
    table.dropColumns('route_departure_unix', 'route_acceptance_ends_unix');
  });

  await knex.schema.alterTable('routes', (table) => {
    table.dropColumn('schedule');
  });
}
