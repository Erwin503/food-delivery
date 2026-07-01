import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('auth_sessions', 'device_id');

  if (hasColumn) {
    return;
  }

  await knex.schema.alterTable('auth_sessions', (table) => {
    table.string('device_id', 128).nullable().after('user_id');
    table.index(['device_id'], 'auth_sessions_device_id_idx');
    table.unique(['user_id', 'device_id'], { indexName: 'auth_sessions_user_device_unique' });
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('auth_sessions', 'device_id');

  if (!hasColumn) {
    return;
  }

  await knex.schema.alterTable('auth_sessions', (table) => {
    table.dropUnique(['user_id', 'device_id'], 'auth_sessions_user_device_unique');
    table.dropIndex(['device_id'], 'auth_sessions_device_id_idx');
    table.dropColumn('device_id');
  });
}