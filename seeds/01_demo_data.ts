import { hashSync } from 'bcryptjs';
import { Knex } from 'knex';

const now = '2026-03-15 09:00:00';
const defaultPasswordHash = hashSync('Password123!', 10);
const verifiedAt = '2026-03-15 09:01:00';

export async function seed(knex: Knex): Promise<void> {
  await knex.raw('SET FOREIGN_KEY_CHECKS = 0');
  await knex.raw('TRUNCATE TABLE order_status_history');
  await knex.raw('TRUNCATE TABLE order_items');
  await knex.raw('TRUNCATE TABLE orders');
  await knex.raw('TRUNCATE TABLE route_companies');
  await knex.raw('TRUNCATE TABLE company_managers');
  await knex.raw('TRUNCATE TABLE auth_email_verification_codes');
  await knex.raw('TRUNCATE TABLE auth_password_reset_codes');
  await knex.raw('TRUNCATE TABLE auth_login_codes');
  await knex.raw('TRUNCATE TABLE dishes');
  await knex.raw('TRUNCATE TABLE categories');
  await knex.raw('TRUNCATE TABLE routes');
  await knex.raw('TRUNCATE TABLE users');
  await knex.raw('TRUNCATE TABLE companies');
  await knex.raw('SET FOREIGN_KEY_CHECKS = 1');

  await knex('companies').insert([
    { id: 1, name: 'Romashka LLC', description: 'Office customer with regular lunch orders.', address: 'Moscow, Pushkina 10, office 12', created_at: now, updated_at: now, deleted_at: null },
    { id: 2, name: 'Vector JSC', description: 'Technology company with morning deliveries.', address: 'Moscow, Leningradsky 25', created_at: now, updated_at: now, deleted_at: null },
    { id: 3, name: 'Sever IE', description: 'Small team ordering lunches on weekdays.', address: 'Moscow, Novoslobodskaya 18', created_at: now, updated_at: now, deleted_at: null },
  ]);

  await knex('users').insert([
    { id: 1, email: 'admin@cook.local', role: 'admin', company_id: null, password_hash: defaultPasswordHash, email_verified_at: verifiedAt, full_name: 'System Administrator', phone: '+79990000001', avatar_url: null, created_at: now, updated_at: now, deleted_at: null },
    { id: 2, email: 'manager.romashka@cook.local', role: 'manager', company_id: 1, password_hash: defaultPasswordHash, email_verified_at: verifiedAt, full_name: 'Anna Smirnova', phone: '+79990000002', avatar_url: null, created_at: now, updated_at: now, deleted_at: null },
    { id: 3, email: 'manager.vector@cook.local', role: 'manager', company_id: 2, password_hash: defaultPasswordHash, email_verified_at: verifiedAt, full_name: 'Mikhail Petrov', phone: '+79990000003', avatar_url: null, created_at: now, updated_at: now, deleted_at: null },
    { id: 4, email: 'employee.ivanov@cook.local', role: 'employee', company_id: 1, password_hash: defaultPasswordHash, email_verified_at: verifiedAt, full_name: 'Ivan Ivanov', phone: '+79990000004', avatar_url: null, created_at: now, updated_at: now, deleted_at: null },
    { id: 5, email: 'employee.sidorova@cook.local', role: 'employee', company_id: 1, password_hash: defaultPasswordHash, email_verified_at: verifiedAt, full_name: 'Maria Sidorova', phone: '+79990000005', avatar_url: null, created_at: now, updated_at: now, deleted_at: null },
    { id: 6, email: 'employee.vector@cook.local', role: 'employee', company_id: 2, password_hash: defaultPasswordHash, email_verified_at: verifiedAt, full_name: 'Alexey Voronov', phone: '+79990000006', avatar_url: null, created_at: now, updated_at: now, deleted_at: null },
    { id: 7, email: 'employee.sever@cook.local', role: 'employee', company_id: 3, password_hash: defaultPasswordHash, email_verified_at: verifiedAt, full_name: 'Elena Kotova', phone: '+79990000007', avatar_url: null, created_at: now, updated_at: now, deleted_at: null },
  ]);

  await knex('auth_login_codes').insert([
    { id: 1, email: 'employee.ivanov@cook.local', code: '123456', expires_at: '2030-03-15 09:05:00', consumed_at: null, created_at: now },
    { id: 2, email: 'manager.romashka@cook.local', code: '654321', expires_at: '2030-03-15 09:05:00', consumed_at: '2026-03-15 09:02:00', created_at: now },
  ]);

  await knex('auth_email_verification_codes').insert([
    { id: 1, email: 'new.signup@cook.local', code: '222333', expires_at: '2030-03-15 09:15:00', consumed_at: null, created_at: now },
  ]);

  await knex('auth_password_reset_codes').insert([
    { id: 1, email: 'employee.ivanov@cook.local', code: '111222', expires_at: '2030-03-15 09:15:00', consumed_at: null, created_at: now },
  ]);

  await knex('company_managers').insert([
    { company_id: 1, user_id: 2, created_at: now },
    { company_id: 2, user_id: 3, created_at: now },
  ]);

  await knex('categories').insert([
    { id: 1, name: 'Pizza', sort_order: 10, created_at: now, updated_at: now, deleted_at: null },
    { id: 2, name: 'Salads', sort_order: 20, created_at: now, updated_at: now, deleted_at: null },
    { id: 3, name: 'Drinks', sort_order: 30, created_at: now, updated_at: now, deleted_at: null },
  ]);

  await knex('dishes').insert([
    { id: 1, category_id: 1, name: 'Margherita', description: 'Tomato sauce, mozzarella, basil.', price_cents: 59900, is_active: true, created_at: now, updated_at: now, deleted_at: null },
    { id: 2, category_id: 1, name: 'Pepperoni', description: 'Pepperoni, cheese, signature sauce.', price_cents: 74900, is_active: true, created_at: now, updated_at: now, deleted_at: null },
    { id: 3, category_id: 2, name: 'Caesar with chicken', description: 'Chicken, romaine, parmesan, croutons.', price_cents: 48900, is_active: true, created_at: now, updated_at: now, deleted_at: null },
    { id: 4, category_id: 3, name: 'Cranberry mors', description: 'House drink 0.5L.', price_cents: 14900, is_active: true, created_at: now, updated_at: now, deleted_at: null },
    { id: 5, category_id: 3, name: 'Tarragon lemonade', description: 'Sparkling drink 0.33L.', price_cents: 12900, is_active: false, created_at: now, updated_at: now, deleted_at: null },
  ]);

  await knex('routes').insert([
    { id: 1, name: 'Morning route', departure_at: '2026-03-16 07:30:00', description: 'North direction delivery route.', created_at: now, updated_at: now, deleted_at: null },
    { id: 2, name: 'Day route', departure_at: '2026-03-16 12:00:00', description: 'Main corporate delivery route.', created_at: now, updated_at: now, deleted_at: null },
  ]);

  await knex('route_companies').insert([
    { route_id: 1, company_id: 2, created_at: now },
    { route_id: 2, company_id: 1, created_at: now },
    { route_id: 2, company_id: 3, created_at: now },
  ]);

  await knex('orders').insert([
    { id: 1, order_number: '20260315-000001', user_id: 4, company_id: 1, status: 'created', delivery_address: 'Moscow, Pushkina 10, office 12', contact_name: 'Ivan Ivanov', contact_phone: '+79990000004', scheduled_for: '2026-03-16 12:30:00', subtotal_cents: 134700, delivery_fee_cents: 19900, discount_cents: 5000, total_cents: 149600, comment: 'Call 10 minutes before arrival.', created_at: now, updated_at: now, deleted_at: null, cancelled_at: null },
    { id: 2, order_number: '20260315-000002', user_id: 6, company_id: 2, status: 'paid', delivery_address: 'Moscow, Leningradsky 25', contact_name: 'Alexey Voronov', contact_phone: '+79990000006', scheduled_for: '2026-03-16 08:15:00', subtotal_cents: 123800, delivery_fee_cents: 0, discount_cents: 0, total_cents: 123800, comment: 'Leave at reception.', created_at: now, updated_at: now, deleted_at: null, cancelled_at: null },
    { id: 3, order_number: '20260315-000003', user_id: 7, company_id: 3, status: 'completed', delivery_address: 'Moscow, Novoslobodskaya 18', contact_name: 'Elena Kotova', contact_phone: '+79990000007', scheduled_for: '2026-03-14 12:00:00', subtotal_cents: 48900, delivery_fee_cents: 9900, discount_cents: 0, total_cents: 58800, comment: null, created_at: '2026-03-14 08:00:00', updated_at: '2026-03-14 13:30:00', deleted_at: null, cancelled_at: null },
  ]);

  await knex('order_items').insert([
    { order_id: 1, dish_id: 1, qty: 1, price_cents: 59900, line_total_cents: 59900, created_at: now, updated_at: now },
    { order_id: 1, dish_id: 2, qty: 1, price_cents: 74900, line_total_cents: 74900, created_at: now, updated_at: now },
    { order_id: 2, dish_id: 2, qty: 1, price_cents: 74900, line_total_cents: 74900, created_at: now, updated_at: now },
    { order_id: 2, dish_id: 4, qty: 3, price_cents: 14900, line_total_cents: 44700, created_at: now, updated_at: now },
    { order_id: 3, dish_id: 3, qty: 1, price_cents: 48900, line_total_cents: 48900, created_at: '2026-03-14 08:00:00', updated_at: '2026-03-14 08:00:00' },
  ]);

  await knex('order_status_history').insert([
    { id: 1, order_id: 1, from_status: null, to_status: 'created', changed_by_user_id: 4, created_at: now },
    { id: 2, order_id: 2, from_status: null, to_status: 'created', changed_by_user_id: 6, created_at: now },
    { id: 3, order_id: 2, from_status: 'created', to_status: 'paid', changed_by_user_id: 3, created_at: '2026-03-15 09:10:00' },
    { id: 4, order_id: 3, from_status: null, to_status: 'created', changed_by_user_id: 7, created_at: '2026-03-14 08:00:00' },
    { id: 5, order_id: 3, from_status: 'created', to_status: 'paid', changed_by_user_id: 2, created_at: '2026-03-14 08:15:00' },
    { id: 6, order_id: 3, from_status: 'paid', to_status: 'cooking', changed_by_user_id: 2, created_at: '2026-03-14 10:30:00' },
    { id: 7, order_id: 3, from_status: 'cooking', to_status: 'delivering', changed_by_user_id: 2, created_at: '2026-03-14 11:30:00' },
    { id: 8, order_id: 3, from_status: 'delivering', to_status: 'completed', changed_by_user_id: 2, created_at: '2026-03-14 13:15:00' },
  ]);
}
