import { Knex } from 'knex';

export async function createRouteCompaniesTable(knex: Knex): Promise<void> {
  await knex.schema.createTable('route_companies', (table) => {
    table
      .integer('route_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('routes')
      .onDelete('CASCADE');
    table
      .integer('company_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.primary(['route_id', 'company_id']);
    table.index(['company_id'], 'route_companies_company_id_idx');
  });
}

export async function dropRouteCompaniesTable(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('route_companies');
}
