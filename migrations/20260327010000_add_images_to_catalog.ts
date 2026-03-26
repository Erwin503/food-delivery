import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('categories', (table) => {
    table.string('image_url', 500).nullable().after('sort_order');
  });

  await knex.schema.alterTable('dishes', (table) => {
    table.string('image_url', 500).nullable().after('description');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('dishes', (table) => {
    table.dropColumn('image_url');
  });

  await knex.schema.alterTable('categories', (table) => {
    table.dropColumn('image_url');
  });
}
