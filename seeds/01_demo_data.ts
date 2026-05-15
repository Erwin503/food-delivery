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

  const runtimeNow = new Date();
  const activeSubscriptionStartedAt = new Date(runtimeNow.getTime() - 5 * 24 * 60 * 60 * 1000);
  const activeSubscriptionExpiresAt = new Date(runtimeNow.getTime() + 25 * 24 * 60 * 60 * 1000);
  const expiredSubscriptionStartedAt = new Date(runtimeNow.getTime() - 65 * 24 * 60 * 60 * 1000);
  const expiredSubscriptionExpiresAt = new Date(runtimeNow.getTime() - 35 * 24 * 60 * 60 * 1000);

  await knex('companies').insert([
    {
      id: 1,
      name: 'РћРћРћ Р РѕРјР°С€РєР°',
      description: 'РћС„РёСЃРЅС‹Р№ РєР»РёРµРЅС‚ СЃ СЂРµРіСѓР»СЏСЂРЅС‹РјРё Р·Р°РєР°Р·Р°РјРё РѕР±РµРґРѕРІ.',
      address: 'РњРѕСЃРєРІР°, СѓР». РџСѓС€РєРёРЅР°, 10, РѕС„РёСЃ 12',
      debt_cents: 0,
      subscription_started_at: '2026-03-10 09:00:00',
      subscription_expires_at: '2026-04-10 09:00:00',
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
    {
      id: 2,
      name: 'РђРћ Р’РµРєС‚РѕСЂ',
      description: 'РўРµС…РЅРѕР»РѕРіРёС‡РµСЃРєР°СЏ РєРѕРјРїР°РЅРёСЏ СЃ СѓС‚СЂРµРЅРЅРёРјРё РґРѕСЃС‚Р°РІРєР°РјРё.',
      address: 'РњРѕСЃРєРІР°, Р›РµРЅРёРЅРіСЂР°РґСЃРєРёР№ РїСЂРѕСЃРїРµРєС‚, 25',
      debt_cents: 80000,
      subscription_started_at: null,
      subscription_expires_at: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
    {
      id: 3,
      name: 'РРџ РЎРµРІРµСЂ',
      description: 'РќРµР±РѕР»СЊС€Р°СЏ РєРѕРјР°РЅРґР°, Р·Р°РєР°Р·С‹РІР°СЋС‰Р°СЏ РѕР±РµРґС‹ РїРѕ Р±СѓРґРЅСЏРј.',
      address: 'РњРѕСЃРєРІР°, РќРѕРІРѕСЃР»РѕР±РѕРґСЃРєР°СЏ, 18',
      debt_cents: 58800,
      subscription_started_at: '2026-02-01 09:00:00',
      subscription_expires_at: '2026-03-01 09:00:00',
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
  ]);

  await knex('users').insert([
    {
      id: 1,
      email: 'admin@cook.local',
      role: 'admin',
      company_id: null,
      password_hash: defaultPasswordHash,
      email_verified_at: verifiedAt,
      full_name: 'РЎРёСЃС‚РµРјРЅС‹Р№ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ',
      phone: '+79990000001',
      avatar_url: null,
      order_limit_cents: 0,
      debt_cents: 0,
      subscription_started_at: null,
      subscription_expires_at: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
    {
      id: 2,
      email: 'manager.romashka@cook.local',
      role: 'manager',
      company_id: 1,
      password_hash: defaultPasswordHash,
      email_verified_at: verifiedAt,
      full_name: 'РђРЅРЅР° РЎРјРёСЂРЅРѕРІР°',
      phone: '+79990000002',
      avatar_url: null,
      order_limit_cents: 180000,
      debt_cents: 0,
      subscription_started_at: toSqlDateTime(activeSubscriptionStartedAt),
      subscription_expires_at: toSqlDateTime(activeSubscriptionExpiresAt),
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
    {
      id: 3,
      email: 'manager.vector@cook.local',
      role: 'manager',
      company_id: 2,
      password_hash: defaultPasswordHash,
      email_verified_at: verifiedAt,
      full_name: 'РњРёС…Р°РёР» РџРµС‚СЂРѕРІ',
      phone: '+79990000003',
      avatar_url: null,
      order_limit_cents: 120000,
      debt_cents: 0,
      subscription_started_at: null,
      subscription_expires_at: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
    {
      id: 4,
      email: 'employee.ivanov@cook.local',
      role: 'employee',
      company_id: 1,
      password_hash: defaultPasswordHash,
      email_verified_at: verifiedAt,
      full_name: 'РРІР°РЅ РРІР°РЅРѕРІ',
      phone: '+79990000004',
      avatar_url: null,
      order_limit_cents: 100,
      debt_cents: 0,
      subscription_started_at: toSqlDateTime(activeSubscriptionStartedAt),
      subscription_expires_at: toSqlDateTime(activeSubscriptionExpiresAt),
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
    {
      id: 5,
      email: 'employee.sidorova@cook.local',
      role: 'employee',
      company_id: 1,
      password_hash: defaultPasswordHash,
      email_verified_at: verifiedAt,
      full_name: 'РњР°СЂРёСЏ РЎРёРґРѕСЂРѕРІР°',
      phone: '+79990000005',
      avatar_url: null,
      order_limit_cents: 90000,
      debt_cents: 0,
      subscription_started_at: toSqlDateTime(activeSubscriptionStartedAt),
      subscription_expires_at: toSqlDateTime(activeSubscriptionExpiresAt),
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
    {
      id: 6,
      email: 'employee.vector@cook.local',
      role: 'employee',
      company_id: 2,
      password_hash: defaultPasswordHash,
      email_verified_at: verifiedAt,
      full_name: 'РђР»РµРєСЃРµР№ Р’РѕСЂРѕРЅРѕРІ',
      phone: '+79990000006',
      avatar_url: null,
      order_limit_cents: 80000,
      debt_cents: 43800,
      subscription_started_at: null,
      subscription_expires_at: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
    {
      id: 7,
      email: 'employee.sever@cook.local',
      role: 'employee',
      company_id: 3,
      password_hash: defaultPasswordHash,
      email_verified_at: verifiedAt,
      full_name: 'Р•Р»РµРЅР° РљРѕС‚РѕРІР°',
      phone: '+79990000007',
      avatar_url: null,
      order_limit_cents: 70000,
      debt_cents: 0,
      subscription_started_at: toSqlDateTime(expiredSubscriptionStartedAt),
      subscription_expires_at: toSqlDateTime(expiredSubscriptionExpiresAt),
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
    {
      id: 8,
      email: 'employee.none@cook.local',
      role: 'employee',
      company_id: null,
      password_hash: defaultPasswordHash,
      email_verified_at: verifiedAt,
      full_name: 'Р•Р»РµРЅР° РљРѕС‚РѕРІР°',
      phone: '+79990000007',
      avatar_url: null,
      order_limit_cents: 70000,
      debt_cents: 0,
      subscription_started_at: null,
      subscription_expires_at: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
  ]);

  await knex('auth_login_codes').insert([
    { id: 1, email: 'employee.ivanov@cook.local', code: '1234', expires_at: '2030-03-15 09:05:00', consumed_at: null, created_at: now },
    { id: 2, email: 'manager.romashka@cook.local', code: '6543', expires_at: '2030-03-15 09:05:00', consumed_at: '2026-03-15 09:02:00', created_at: now },
  ]);

  await knex('auth_email_verification_codes').insert([
    { id: 1, email: 'new.signup@cook.local', code: '2223', expires_at: '2030-03-15 09:15:00', consumed_at: null, created_at: now },
  ]);

  await knex('auth_password_reset_codes').insert([
    { id: 1, email: 'employee.ivanov@cook.local', code: '1112', expires_at: '2030-03-15 09:15:00', consumed_at: null, created_at: now },
  ]);

  await knex('company_managers').insert([
    { company_id: 1, user_id: 2, created_at: now },
    { company_id: 2, user_id: 3, created_at: now },
  ]);

  await knex('categories').insert([
    { id: 1, name: 'РџРёС†С†Р°', sort_order: 10, created_at: now, updated_at: now, deleted_at: null },
    { id: 2, name: 'РЎР°Р»Р°С‚С‹', sort_order: 20, created_at: now, updated_at: now, deleted_at: null },
    { id: 3, name: 'РќР°РїРёС‚РєРё', sort_order: 30, created_at: now, updated_at: now, deleted_at: null },
  ]);

  await knex('dishes').insert([
    { id: 1, category_id: 1, name: 'РњР°СЂРіР°СЂРёС‚Р°', description: 'РўРѕРјР°С‚РЅС‹Р№ СЃРѕСѓСЃ, РјРѕС†Р°СЂРµР»Р»Р°, Р±Р°Р·РёР»РёРє.', base_price_cents: 59900, discount_price_cents: 53900, is_active: true, created_at: now, updated_at: now, deleted_at: null },
    { id: 2, category_id: 1, name: 'РџРµРїРїРµСЂРѕРЅРё', description: 'РџРµРїРїРµСЂРѕРЅРё, СЃС‹СЂ Рё С„РёСЂРјРµРЅРЅС‹Р№ СЃРѕСѓСЃ.', base_price_cents: 74900, discount_price_cents: 67400, is_active: true, created_at: now, updated_at: now, deleted_at: null },
    { id: 3, category_id: 2, name: 'Р¦РµР·Р°СЂСЊ СЃ РєСѓСЂРёС†РµР№', description: 'РљСѓСЂРёС†Р°, СЂРѕРјР°РЅРѕ, РїР°СЂРјРµР·Р°РЅ Рё СЃСѓС…Р°СЂРёРєРё.', base_price_cents: 48900, discount_price_cents: 43900, is_active: true, created_at: now, updated_at: now, deleted_at: null },
    { id: 4, category_id: 3, name: 'РљР»СЋРєРІРµРЅРЅС‹Р№ РјРѕСЂСЃ', description: 'Р”РѕРјР°С€РЅРёР№ РЅР°РїРёС‚РѕРє 0.5 Р».', base_price_cents: 14900, discount_price_cents: 12900, is_active: true, created_at: now, updated_at: now, deleted_at: null },
    { id: 5, category_id: 3, name: 'Р›РёРјРѕРЅР°Рґ С‚Р°СЂС…СѓРЅ', description: 'Р“Р°Р·РёСЂРѕРІР°РЅРЅС‹Р№ РЅР°РїРёС‚РѕРє 0.33 Р».', base_price_cents: 12900, discount_price_cents: 10900, is_active: false, created_at: now, updated_at: now, deleted_at: null },
  ]);

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
    { id: 1, name: 'РЈС‚СЂРµРЅРЅРёР№ СЂРµР№СЃ', departure_at: toSqlDateTime(morningRouteDeparture), order_acceptance_ends_at: toSqlDateTime(morningRouteCutoff), description: 'РњР°СЂС€СЂСѓС‚ РґРѕСЃС‚Р°РІРєРё РїРѕ СЃРµРІРµСЂРЅРѕРјСѓ РЅР°РїСЂР°РІР»РµРЅРёСЋ.', created_at: now, updated_at: now, deleted_at: null },
    { id: 2, name: 'Р”РЅРµРІРЅРѕР№ СЂРµР№СЃ', departure_at: toSqlDateTime(dayRouteDeparture), order_acceptance_ends_at: toSqlDateTime(dayRouteCutoff), description: 'РћСЃРЅРѕРІРЅРѕР№ РєРѕСЂРїРѕСЂР°С‚РёРІРЅС‹Р№ РјР°СЂС€СЂСѓС‚ РґРѕСЃС‚Р°РІРєРё.', created_at: now, updated_at: now, deleted_at: null },
    { id: 3, name: 'РђСЂС…РёРІРЅС‹Р№ СЂРµР№СЃ', departure_at: toSqlDateTime(archiveRouteDeparture), order_acceptance_ends_at: toSqlDateTime(archiveRouteCutoff), description: 'РџСЂРѕС€Р»С‹Р№ СЂРµР№СЃ РґР»СЏ Р·Р°РІРµСЂС€С‘РЅРЅС‹С… РґРѕСЃС‚Р°РІРѕРє.', created_at: now, updated_at: now, deleted_at: null },
  ]);

  await knex('route_companies').insert([
    { route_id: 1, company_id: 2, created_at: now },
    { route_id: 2, company_id: 1, created_at: now },
    { route_id: 3, company_id: 3, created_at: now },
  ]);

  await knex('orders').insert([
    { id: 1, order_number: '20260315-000001', user_id: 4, company_id: 1, route_id: 2, status: 'created', subtotal_cents: 128800, delivery_fee_cents: 19900, discount_cents: 5000, total_cents: 143700, company_paid_cents: 100, employee_debt_cents: 143600, created_at: now, updated_at: now, deleted_at: null, cancelled_at: null },
    { id: 2, order_number: '20260315-000002', user_id: 6, company_id: 2, route_id: 1, status: 'paid', subtotal_cents: 123800, delivery_fee_cents: 0, discount_cents: 0, total_cents: 123800, company_paid_cents: 80000, employee_debt_cents: 43800, created_at: now, updated_at: now, deleted_at: null, cancelled_at: null },
    { id: 3, order_number: '20260315-000003', user_id: 7, company_id: 3, route_id: 3, status: 'completed', subtotal_cents: 48900, delivery_fee_cents: 9900, discount_cents: 0, total_cents: 58800, company_paid_cents: 58800, employee_debt_cents: 0, created_at: '2026-03-14 08:00:00', updated_at: '2026-03-14 13:30:00', deleted_at: null, cancelled_at: null },
  ]);

  await knex('order_items').insert([
    { order_id: 1, dish_id: 1, category_id: 1, qty: 1, price_cents: 53900, base_price_cents: 59900, discount_price_cents: 53900, discounted_qty: 1, line_total_cents: 53900, created_at: now, updated_at: now },
    { order_id: 1, dish_id: 2, category_id: 1, qty: 1, price_cents: 74900, base_price_cents: 74900, discount_price_cents: 67400, discounted_qty: 0, line_total_cents: 74900, created_at: now, updated_at: now },
    { order_id: 2, dish_id: 2, category_id: 1, qty: 1, price_cents: 74900, base_price_cents: 74900, discount_price_cents: 67400, discounted_qty: 0, line_total_cents: 74900, created_at: now, updated_at: now },
    { order_id: 2, dish_id: 4, category_id: 3, qty: 3, price_cents: 14900, base_price_cents: 14900, discount_price_cents: 12900, discounted_qty: 0, line_total_cents: 44700, created_at: now, updated_at: now },
    { order_id: 3, dish_id: 3, category_id: 2, qty: 1, price_cents: 48900, base_price_cents: 48900, discount_price_cents: 43900, discounted_qty: 0, line_total_cents: 48900, created_at: '2026-03-14 08:00:00', updated_at: '2026-03-14 08:00:00' },
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
