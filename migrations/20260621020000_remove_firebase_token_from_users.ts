import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('users', 'firebase_token');

  if (hasColumn) {
    await knex.schema.alterTable('users', (table) => {
      table.dropColumn('firebase_token');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('users', 'firebase_token');

  if (!hasColumn) {
    await knex.schema.alterTable('users', (table) => {
      table.string('firebase_token', 2048).nullable().after('avatar_url');
    });
  }
}