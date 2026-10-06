import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    DELETE older
    FROM route_companies AS older
    INNER JOIN route_companies AS newer
      ON newer.company_id = older.company_id
      AND (
        newer.created_at > older.created_at
        OR (newer.created_at = older.created_at AND newer.route_id > older.route_id)
      )
  `);

  await knex.schema.alterTable('route_companies', (table) => {
    table.unique(['company_id'], 'route_companies_company_id_unique');
  });

  await knex.schema.alterTable('route_companies', (table) => {
    table.dropIndex(['company_id'], 'route_companies_company_id_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('route_companies', (table) => {
    table.index(['company_id'], 'route_companies_company_id_idx');
  });

  await knex.schema.alterTable('route_companies', (table) => {
    table.dropUnique(['company_id'], 'route_companies_company_id_unique');
  });
}
