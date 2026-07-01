import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable('auth_sessions');

  if (exists) {
    return;
  }

  await knex.schema.createTable('auth_sessions', (table) => {
    table.increments('id').primary();
    table.integer('user_id').unsigned().notNullable().index();
    table.string('firebase_token', 2048).nullable();
    table.timestamp('created_at').notNullable();
    table.timestamp('updated_at').notNullable();

    table.foreign('user_id').references('users.id').onDelete('CASCADE');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('auth_sessions');
}