import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('routes', (table) => {
    table.timestamp('order_acceptance_ends_at').nullable().after('departure_at');
  });

  await knex('routes').update({
    order_acceptance_ends_at: knex.raw('DATE_SUB(departure_at, INTERVAL 2 HOUR)'),
  });

  await knex.schema.alterTable('routes', (table) => {
    table.timestamp('order_acceptance_ends_at').notNullable().alter();
    table.index(['order_acceptance_ends_at'], 'routes_order_acceptance_ends_at_idx');
  });

  await knex.schema.alterTable('orders', (table) => {
    table
      .integer('route_id')
      .unsigned()
      .nullable()
      .after('company_id')
      .references('id')
      .inTable('routes')
      .onDelete('RESTRICT');
  });

  await knex('orders as o')
    .join('route_companies as rc', 'rc.company_id', 'o.company_id')
    .whereNull('o.route_id')
    .update({
      'o.route_id': knex.ref('rc.route_id'),
    });

  await knex.schema.alterTable('orders', (table) => {
    table.integer('route_id').unsigned().notNullable().alter();
    table.index(['route_id'], 'orders_route_id_idx');
  });

  await knex.schema.alterTable('orders', (table) => {
    table.dropColumn('delivery_address');
    table.dropColumn('contact_name');
    table.dropColumn('contact_phone');
    table.dropColumn('scheduled_for');
    table.dropColumn('comment');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('orders', (table) => {
    table.string('delivery_address', 500).nullable();
    table.string('contact_name', 255).nullable();
    table.string('contact_phone', 50).nullable();
    table.timestamp('scheduled_for').nullable();
    table.text('comment').nullable();
  });

  await knex.schema.alterTable('orders', (table) => {
    table.dropIndex(['route_id'], 'orders_route_id_idx');
    table.dropColumn('route_id');
  });

  await knex.schema.alterTable('routes', (table) => {
    table.dropIndex(['order_acceptance_ends_at'], 'routes_order_acceptance_ends_at_idx');
    table.dropColumn('order_acceptance_ends_at');
  });
}
