import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasStartedColumn = await knex.schema.hasColumn('users', 'subscription_started_at');
  const hasExpiresColumn = await knex.schema.hasColumn('users', 'subscription_expires_at');

  if (!hasStartedColumn || !hasExpiresColumn) {
    await knex.schema.alterTable('users', (table) => {
      if (!hasStartedColumn) {
        table.timestamp('subscription_started_at').nullable();
      }

      if (!hasExpiresColumn) {
        table.timestamp('subscription_expires_at').nullable();
      }
    });
  }

  await knex('users as u')
    .leftJoin('companies as c', 'c.id', 'u.company_id')
    .update({
      'u.subscription_started_at': knex.ref('c.subscription_started_at'),
      'u.subscription_expires_at': knex.ref('c.subscription_expires_at'),
    });
}

export async function down(knex: Knex): Promise<void> {
  const hasStartedColumn = await knex.schema.hasColumn('users', 'subscription_started_at');
  const hasExpiresColumn = await knex.schema.hasColumn('users', 'subscription_expires_at');

  if (!hasStartedColumn && !hasExpiresColumn) {
    return;
  }

  await knex.schema.alterTable('users', (table) => {
    if (hasStartedColumn) {
      table.dropColumn('subscription_started_at');
    }

    if (hasExpiresColumn) {
      table.dropColumn('subscription_expires_at');
    }
  });
}
