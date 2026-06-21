import { Knex } from 'knex';

const DEFAULT_AVAILABLE_WEEKDAYS = '(JSON_ARRAY(1, 2, 3, 4, 5, 6, 7))';

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('dishes', 'available_weekdays');

  if (hasColumn) {
    return;
  }

  await knex.raw(
    `ALTER TABLE dishes ADD COLUMN available_weekdays JSON NOT NULL DEFAULT ${DEFAULT_AVAILABLE_WEEKDAYS} AFTER is_active`
  );
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('dishes', 'available_weekdays');

  if (!hasColumn) {
    return;
  }

  await knex.schema.alterTable('dishes', (table) => {
    table.dropColumn('available_weekdays');
  });
}
