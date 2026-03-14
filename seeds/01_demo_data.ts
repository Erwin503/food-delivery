import { Knex } from 'knex';

const now = new Date('2026-03-15T09:00:00Z');

export async function seed(knex: Knex): Promise<void> {
  await knex('order_status_history').del();
  await knex('order_items').del();
  await knex('orders').del();
  await knex('route_companies').del();
  await knex('company_managers').del();
  await knex('auth_login_codes').del();
  await knex('dishes').del();
  await knex('categories').del();
  await knex('routes').del();
  await knex('users').del();
  await knex('companies').del();

  const companies = [
    {
      id: 1,
      name: 'ООО Ромашка',
      description: 'Офис на 40 сотрудников, регулярные дневные заказы.',
      address: 'Москва, ул. Пушкина, 10, офис 12',
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
    {
      id: 2,
      name: 'АО Вектор',
      description: 'Технологическая компания с утренними корпоративными доставками.',
      address: 'Москва, Ленинградский проспект, 25',
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
    {
      id: 3,
      name: 'ИП Север',
      description: 'Небольшая команда, заказывает обеды по будням.',
      address: 'Москва, ул. Новослободская, 18',
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
  ];

  await knex('companies').insert(companies);

  const users = [
    {
      id: 1,
      email: 'admin@cook.local',
      role: 'admin',
      company_id: null,
      full_name: 'Системный администратор',
      phone: '+79990000001',
      avatar_url: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
    {
      id: 2,
      email: 'manager.romashka@cook.local',
      role: 'manager',
      company_id: 1,
      full_name: 'Анна Смирнова',
      phone: '+79990000002',
      avatar_url: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
    {
      id: 3,
      email: 'manager.vector@cook.local',
      role: 'manager',
      company_id: 2,
      full_name: 'Михаил Петров',
      phone: '+79990000003',
      avatar_url: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
    {
      id: 4,
      email: 'employee.ivanov@cook.local',
      role: 'employee',
      company_id: 1,
      full_name: 'Иван Иванов',
      phone: '+79990000004',
      avatar_url: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
    {
      id: 5,
      email: 'employee.sidorova@cook.local',
      role: 'employee',
      company_id: 1,
      full_name: 'Мария Сидорова',
      phone: '+79990000005',
      avatar_url: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
    {
      id: 6,
      email: 'employee.vector@cook.local',
      role: 'employee',
      company_id: 2,
      full_name: 'Алексей Воронов',
      phone: '+79990000006',
      avatar_url: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
    {
      id: 7,
      email: 'employee.sever@cook.local',
      role: 'employee',
      company_id: 3,
      full_name: 'Елена Котова',
      phone: '+79990000007',
      avatar_url: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
  ];

  await knex('users').insert(users);

  await knex('auth_login_codes').insert([
    {
      id: 1,
      email: 'employee.ivanov@cook.local',
      code: '123456',
      expires_at: new Date('2026-03-15T09:05:00Z'),
      consumed_at: null,
      created_at: now,
    },
    {
      id: 2,
      email: 'manager.romashka@cook.local',
      code: '654321',
      expires_at: new Date('2026-03-15T09:05:00Z'),
      consumed_at: new Date('2026-03-15T09:02:00Z'),
      created_at: now,
    },
  ]);

  await knex('company_managers').insert([
    {
      company_id: 1,
      user_id: 2,
      created_at: now,
    },
    {
      company_id: 2,
      user_id: 3,
      created_at: now,
    },
  ]);

  await knex('categories').insert([
    {
      id: 1,
      name: 'Пицца',
      sort_order: 10,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
    {
      id: 2,
      name: 'Салаты',
      sort_order: 20,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
    {
      id: 3,
      name: 'Напитки',
      sort_order: 30,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
  ]);

  await knex('dishes').insert([
    {
      id: 1,
      category_id: 1,
      name: 'Маргарита',
      description: 'Томатный соус, моцарелла, базилик.',
      price_cents: 59900,
      is_active: true,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
    {
      id: 2,
      category_id: 1,
      name: 'Пепперони',
      description: 'Пикантная колбаса, сыр и фирменный соус.',
      price_cents: 74900,
      is_active: true,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
    {
      id: 3,
      category_id: 2,
      name: 'Цезарь с курицей',
      description: 'Курица, салат романо, пармезан, сухарики.',
      price_cents: 48900,
      is_active: true,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
    {
      id: 4,
      category_id: 3,
      name: 'Морс клюквенный',
      description: 'Домашний морс 0.5 л.',
      price_cents: 14900,
      is_active: true,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
    {
      id: 5,
      category_id: 3,
      name: 'Лимонад тархун',
      description: 'Газированный напиток 0.33 л.',
      price_cents: 12900,
      is_active: false,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
  ]);

  await knex('routes').insert([
    {
      id: 1,
      name: 'Утренний рейс',
      departure_at: new Date('2026-03-16T07:30:00Z'),
      description: 'Развоз заказов по северному направлению.',
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
    {
      id: 2,
      name: 'Дневной рейс',
      departure_at: new Date('2026-03-16T12:00:00Z'),
      description: 'Основной корпоративный рейс.',
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
  ]);

  await knex('route_companies').insert([
    {
      route_id: 1,
      company_id: 2,
      created_at: now,
    },
    {
      route_id: 2,
      company_id: 1,
      created_at: now,
    },
    {
      route_id: 2,
      company_id: 3,
      created_at: now,
    },
  ]);

  await knex('orders').insert([
    {
      id: 1,
      order_number: '20260315-000001',
      user_id: 4,
      company_id: 1,
      status: 'created',
      delivery_address: 'Москва, ул. Пушкина, 10, офис 12',
      contact_name: 'Иван Иванов',
      contact_phone: '+79990000004',
      scheduled_for: new Date('2026-03-16T12:30:00Z'),
      subtotal_cents: 134700,
      delivery_fee_cents: 19900,
      discount_cents: 5000,
      total_cents: 149600,
      comment: 'Позвонить за 10 минут до приезда.',
      created_at: now,
      updated_at: now,
      deleted_at: null,
      cancelled_at: null,
    },
    {
      id: 2,
      order_number: '20260315-000002',
      user_id: 6,
      company_id: 2,
      status: 'paid',
      delivery_address: 'Москва, Ленинградский проспект, 25',
      contact_name: 'Алексей Воронов',
      contact_phone: '+79990000006',
      scheduled_for: new Date('2026-03-16T08:15:00Z'),
      subtotal_cents: 123800,
      delivery_fee_cents: 0,
      discount_cents: 0,
      total_cents: 123800,
      comment: 'Оставить заказ на ресепшене.',
      created_at: now,
      updated_at: now,
      deleted_at: null,
      cancelled_at: null,
    },
    {
      id: 3,
      order_number: '20260315-000003',
      user_id: 7,
      company_id: 3,
      status: 'completed',
      delivery_address: 'Москва, ул. Новослободская, 18',
      contact_name: 'Елена Котова',
      contact_phone: '+79990000007',
      scheduled_for: new Date('2026-03-14T12:00:00Z'),
      subtotal_cents: 48900,
      delivery_fee_cents: 9900,
      discount_cents: 0,
      total_cents: 58800,
      comment: null,
      created_at: new Date('2026-03-14T08:00:00Z'),
      updated_at: new Date('2026-03-14T13:30:00Z'),
      deleted_at: null,
      cancelled_at: null,
    },
  ]);

  await knex('order_items').insert([
    {
      order_id: 1,
      dish_id: 1,
      qty: 1,
      price_cents: 59900,
      line_total_cents: 59900,
      created_at: now,
      updated_at: now,
    },
    {
      order_id: 1,
      dish_id: 2,
      qty: 1,
      price_cents: 74900,
      line_total_cents: 74900,
      created_at: now,
      updated_at: now,
    },
    {
      order_id: 2,
      dish_id: 2,
      qty: 1,
      price_cents: 74900,
      line_total_cents: 74900,
      created_at: now,
      updated_at: now,
    },
    {
      order_id: 2,
      dish_id: 4,
      qty: 3,
      price_cents: 14900,
      line_total_cents: 44700,
      created_at: now,
      updated_at: now,
    },
    {
      order_id: 3,
      dish_id: 3,
      qty: 1,
      price_cents: 48900,
      line_total_cents: 48900,
      created_at: new Date('2026-03-14T08:00:00Z'),
      updated_at: new Date('2026-03-14T08:00:00Z'),
    },
  ]);

  await knex('order_status_history').insert([
    {
      id: 1,
      order_id: 1,
      from_status: null,
      to_status: 'created',
      changed_by_user_id: 4,
      created_at: now,
    },
    {
      id: 2,
      order_id: 2,
      from_status: null,
      to_status: 'created',
      changed_by_user_id: 6,
      created_at: now,
    },
    {
      id: 3,
      order_id: 2,
      from_status: 'created',
      to_status: 'paid',
      changed_by_user_id: 3,
      created_at: new Date('2026-03-15T09:10:00Z'),
    },
    {
      id: 4,
      order_id: 3,
      from_status: null,
      to_status: 'created',
      changed_by_user_id: 7,
      created_at: new Date('2026-03-14T08:00:00Z'),
    },
    {
      id: 5,
      order_id: 3,
      from_status: 'created',
      to_status: 'paid',
      changed_by_user_id: 2,
      created_at: new Date('2026-03-14T08:15:00Z'),
    },
    {
      id: 6,
      order_id: 3,
      from_status: 'paid',
      to_status: 'cooking',
      changed_by_user_id: 2,
      created_at: new Date('2026-03-14T10:30:00Z'),
    },
    {
      id: 7,
      order_id: 3,
      from_status: 'cooking',
      to_status: 'delivering',
      changed_by_user_id: 2,
      created_at: new Date('2026-03-14T11:30:00Z'),
    },
    {
      id: 8,
      order_id: 3,
      from_status: 'delivering',
      to_status: 'completed',
      changed_by_user_id: 2,
      created_at: new Date('2026-03-14T13:15:00Z'),
    },
  ]);
}
