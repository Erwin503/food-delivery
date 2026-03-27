import { hashSync } from 'bcryptjs';
import { Knex } from 'knex';

const now = '2026-03-15 09:00:00';
const defaultPasswordHash = hashSync('Password123!', 10);
const verifiedAt = '2026-03-15 09:01:00';

const toSqlDateTime = (date: Date) => date.toISOString().slice(0, 19).replace('T', ' ');

export async function seed(knex: Knex): Promise<void> {
  await knex.raw('SET FOREIGN_KEY_CHECKS = 0');
  await knex.raw('TRUNCATE TABLE order_status_history');
  await knex.raw('TRUNCATE TABLE order_items');
  await knex.raw('TRUNCATE TABLE orders');
  await knex.raw('TRUNCATE TABLE route_companies');
  await knex.raw('TRUNCATE TABLE company_managers');
  await knex.raw('TRUNCATE TABLE company_join_codes');
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
    { id: 1, name: 'ООО Ромашка', description: 'Офисный клиент с регулярными заказами обедов.', address: 'Москва, ул. Пушкина, 10, офис 12', subscription_started_at: '2026-03-10 09:00:00', subscription_expires_at: '2026-04-10 09:00:00', created_at: now, updated_at: now, deleted_at: null },
    { id: 2, name: 'АО Вектор', description: 'Технологическая компания с утренними доставками.', address: 'Москва, Ленинградский проспект, 25', subscription_started_at: null, subscription_expires_at: null, created_at: now, updated_at: now, deleted_at: null },
    { id: 3, name: 'ИП Север', description: 'Небольшая команда, заказывающая обеды по будням.', address: 'Москва, Новослободская, 18', subscription_started_at: '2026-02-01 09:00:00', subscription_expires_at: '2026-03-01 09:00:00', created_at: now, updated_at: now, deleted_at: null },
  ]);

  await knex('users').insert([
    { id: 1, email: 'admin@cook.local', role: 'admin', company_id: null, password_hash: defaultPasswordHash, email_verified_at: verifiedAt, full_name: 'Системный администратор', phone: '+79990000001', avatar_url: null, created_at: now, updated_at: now, deleted_at: null },
    { id: 2, email: 'manager.romashka@cook.local', role: 'manager', company_id: 1, password_hash: defaultPasswordHash, email_verified_at: verifiedAt, full_name: 'Анна Смирнова', phone: '+79990000002', avatar_url: null, created_at: now, updated_at: now, deleted_at: null },
    { id: 3, email: 'manager.vector@cook.local', role: 'manager', company_id: 2, password_hash: defaultPasswordHash, email_verified_at: verifiedAt, full_name: 'Михаил Петров', phone: '+79990000003', avatar_url: null, created_at: now, updated_at: now, deleted_at: null },
    { id: 4, email: 'employee.ivanov@cook.local', role: 'employee', company_id: 1, password_hash: defaultPasswordHash, email_verified_at: verifiedAt, full_name: 'Иван Иванов', phone: '+79990000004', avatar_url: null, created_at: now, updated_at: now, deleted_at: null },
    { id: 5, email: 'employee.sidorova@cook.local', role: 'employee', company_id: 1, password_hash: defaultPasswordHash, email_verified_at: verifiedAt, full_name: 'Мария Сидорова', phone: '+79990000005', avatar_url: null, created_at: now, updated_at: now, deleted_at: null },
    { id: 6, email: 'employee.vector@cook.local', role: 'employee', company_id: 2, password_hash: defaultPasswordHash, email_verified_at: verifiedAt, full_name: 'Алексей Воронов', phone: '+79990000006', avatar_url: null, created_at: now, updated_at: now, deleted_at: null },
    { id: 7, email: 'employee.sever@cook.local', role: 'employee', company_id: 3, password_hash: defaultPasswordHash, email_verified_at: verifiedAt, full_name: 'Елена Котова', phone: '+79990000007', avatar_url: null, created_at: now, updated_at: now, deleted_at: null },
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
    { id: 1, name: 'Пицца', sort_order: 10, created_at: now, updated_at: now, deleted_at: null },
    { id: 2, name: 'Салаты', sort_order: 20, created_at: now, updated_at: now, deleted_at: null },
    { id: 3, name: 'Напитки', sort_order: 30, created_at: now, updated_at: now, deleted_at: null },
  ]);

  await knex('dishes').insert([
    { id: 1, category_id: 1, name: 'Маргарита', description: 'Томатный соус, моцарелла, базилик.', base_price_cents: 59900, discount_price_cents: 53900, is_active: true, created_at: now, updated_at: now, deleted_at: null },
    { id: 2, category_id: 1, name: 'Пепперони', description: 'Пепперони, сыр и фирменный соус.', base_price_cents: 74900, discount_price_cents: 67400, is_active: true, created_at: now, updated_at: now, deleted_at: null },
    { id: 3, category_id: 2, name: 'Цезарь с курицей', description: 'Курица, романо, пармезан и сухарики.', base_price_cents: 48900, discount_price_cents: 43900, is_active: true, created_at: now, updated_at: now, deleted_at: null },
    { id: 4, category_id: 3, name: 'Клюквенный морс', description: 'Домашний напиток 0.5 л.', base_price_cents: 14900, discount_price_cents: 12900, is_active: true, created_at: now, updated_at: now, deleted_at: null },
    { id: 5, category_id: 3, name: 'Лимонад тархун', description: 'Газированный напиток 0.33 л.', base_price_cents: 12900, discount_price_cents: 10900, is_active: false, created_at: now, updated_at: now, deleted_at: null },
  ]);

  const runtimeNow = new Date();
  const morningRouteDeparture = new Date(runtimeNow.getTime() + 24 * 60 * 60 * 1000);
  morningRouteDeparture.setHours(8, 0, 0, 0);
  const morningRouteCutoff = new Date(morningRouteDeparture.getTime() - 2 * 60 * 60 * 1000);

  const dayRouteDeparture = new Date(runtimeNow.getTime() + 24 * 60 * 60 * 1000);
  dayRouteDeparture.setHours(12, 0, 0, 0);
  const dayRouteCutoff = new Date(dayRouteDeparture.getTime() - 2 * 60 * 60 * 1000);

  const archiveRouteDeparture = new Date(runtimeNow.getTime() - 24 * 60 * 60 * 1000);
  archiveRouteDeparture.setHours(12, 0, 0, 0);
  const archiveRouteCutoff = new Date(archiveRouteDeparture.getTime() - 2 * 60 * 60 * 1000);

  await knex('routes').insert([
    { id: 1, name: 'Утренний рейс', departure_at: toSqlDateTime(morningRouteDeparture), order_acceptance_ends_at: toSqlDateTime(morningRouteCutoff), description: 'Маршрут доставки по северному направлению.', created_at: now, updated_at: now, deleted_at: null },
    { id: 2, name: 'Дневной рейс', departure_at: toSqlDateTime(dayRouteDeparture), order_acceptance_ends_at: toSqlDateTime(dayRouteCutoff), description: 'Основной корпоративный маршрут доставки.', created_at: now, updated_at: now, deleted_at: null },
    { id: 3, name: 'Архивный рейс', departure_at: toSqlDateTime(archiveRouteDeparture), order_acceptance_ends_at: toSqlDateTime(archiveRouteCutoff), description: 'Прошлый рейс для завершённых доставок.', created_at: now, updated_at: now, deleted_at: null },
  ]);

  await knex('route_companies').insert([
    { route_id: 1, company_id: 2, created_at: now },
    { route_id: 2, company_id: 1, created_at: now },
    { route_id: 3, company_id: 3, created_at: now },
  ]);

  await knex('orders').insert([
    { id: 1, order_number: '20260315-000001', user_id: 4, company_id: 1, route_id: 2, status: 'created', subtotal_cents: 134700, delivery_fee_cents: 19900, discount_cents: 5000, total_cents: 149600, created_at: now, updated_at: now, deleted_at: null, cancelled_at: null },
    { id: 2, order_number: '20260315-000002', user_id: 6, company_id: 2, route_id: 1, status: 'paid', subtotal_cents: 123800, delivery_fee_cents: 0, discount_cents: 0, total_cents: 123800, created_at: now, updated_at: now, deleted_at: null, cancelled_at: null },
    { id: 3, order_number: '20260315-000003', user_id: 7, company_id: 3, route_id: 3, status: 'completed', subtotal_cents: 48900, delivery_fee_cents: 9900, discount_cents: 0, total_cents: 58800, created_at: '2026-03-14 08:00:00', updated_at: '2026-03-14 13:30:00', deleted_at: null, cancelled_at: null },
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
