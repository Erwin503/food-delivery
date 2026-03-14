import { Knex } from 'knex';

const USER_ROLE = ['employee', 'manager', 'admin'] as const;

export async function createUsersTable(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table.string('email', 255).notNullable().unique();
    table
      .enum('role', [...USER_ROLE], {
        useNative: false,
        enumName: 'user_role',
      })
      .notNullable()
      .defaultTo('employee');
    table
      .integer('company_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('companies')
      .onDelete('SET NULL');
    table.string('full_name', 255).nullable();
    table.string('phone', 50).nullable();
    table.text('avatar_url').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('deleted_at').nullable();

    table.index(['company_id'], 'users_company_id_idx');
    table.index(['role'], 'users_role_idx');
  });
}

export async function dropUsersTable(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('users');
}
