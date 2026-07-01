import assert from 'node:assert/strict';
import test from 'node:test';
import db from '../../src/db/knex';
import { generateToken } from '../../src/utils/generateToken';
import { lockAndSeedDb, releaseDbTestLock } from '../helpers/db-test-lock';
import { startTestServer, stopTestServer } from '../helpers/test-server';

const serialTest = (name: string, fn: (t: unknown) => Promise<void> | void) =>
  test(name, { concurrency: false }, fn);

const employeeToken = () =>
  generateToken({ id: 4, email: 'employee.ivanov@cook.local', role: 'employee', companyId: 1 });

const managerToken = () =>
  generateToken({ id: 2, email: 'manager.romashka@cook.local', role: 'manager', companyId: 1 });

const adminToken = () =>
  generateToken({ id: 1, email: 'admin@cook.local', role: 'admin', companyId: null });

const getTodayWeekday = (): number => {
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'Europe/Moscow' }).format(new Date());
  return { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[weekday] as number;
};

test.beforeEach(async () => {
  await lockAndSeedDb(db);
});

test.afterEach(() => {
  releaseDbTestLock();
});

serialTest('GET /api/categories returns sorted categories list', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/categories`, {
      headers: { Authorization: `Bearer ${employeeToken()}` },
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.length, 3);
    assert.deepEqual(
      payload.map((item: { name: string }) => item.name),
      ['Пицца', 'Салаты', 'Напитки']
    );
  } finally {
    await stopTestServer(server);
  }
});

serialTest('GET /api/categories/:id returns a category by id', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/categories/2`, {
      headers: { Authorization: `Bearer ${employeeToken()}` },
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.id, 2);
    assert.equal(payload.name, 'Салаты');
  } finally {
    await stopTestServer(server);
  }
});

serialTest('POST /api/categories creates a category for manager or admin', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const form = new FormData();
    form.set('name', 'Супы');
    form.set('sortOrder', '40');
    form.set('image', new Blob(['fake-image'], { type: 'image/png' }), 'category.png');

    const response = await fetch(`${baseUrl}/api/categories`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${managerToken()}`,
      },
      body: form,
    });

    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.name, 'Супы');
    assert.match(payload.imageUrl, /^\/uploads\/catalog\/.+\.png$/);

    const category = await db('categories').where({ name: 'Супы' }).first();
    assert.ok(category);
    assert.equal(category.sort_order, 40);
    assert.equal(typeof category.image_url, 'string');
  } finally {
    await stopTestServer(server);
  }
});

serialTest('PUT /api/categories/:id partially updates a category', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/categories/2`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${managerToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Свежие салаты', sortOrder: 25 }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.name, 'Свежие салаты');
    assert.equal(payload.sortOrder, 25);
  } finally {
    await stopTestServer(server);
  }
});

serialTest('PUT /api/categories/:id ignores omitted fields and keeps current values', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const before = await db('categories').where({ id: 2 }).first();

    const response = await fetch(`${baseUrl}/api/categories/2`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${managerToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.name, before.name);
    assert.equal(payload.sortOrder, before.sort_order);
  } finally {
    await stopTestServer(server);
  }
});

serialTest('DELETE /api/categories/:id deletes or archives a category', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/categories/3`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${managerToken()}` },
    });

    assert.equal(response.status, 204);

    const category = await db('categories').where({ id: 3 }).first();
    const dish = await db('dishes').where({ id: 4 }).first();
    assert.ok(category.deleted_at);
    assert.ok(dish.deleted_at);
  } finally {
    await stopTestServer(server);
  }
});

serialTest('GET /api/dishes returns a paginated list across all categories', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const expectedTotal = Number((await db('dishes').whereNull('deleted_at').where({ is_active: true }).count({ total: 'id' }).first())?.total ?? 0);
    const response = await fetch(`${baseUrl}/api/dishes?page=1&limit=2`, {
      headers: { Authorization: `Bearer ${employeeToken()}` },
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.items.length, 2);
    assert.equal(payload.pagination.page, 1);
    assert.equal(payload.pagination.limit, 2);
    assert.equal(payload.pagination.totalItems, expectedTotal);
    assert.equal(payload.pagination.totalPages, Math.ceil(expectedTotal / 2));
  } finally {
    await stopTestServer(server);
  }
});

serialTest('GET /api/dishes preserves category and active filters in paginated response', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/dishes?categoryId=3&isActive=true`, {
      headers: { Authorization: `Bearer ${employeeToken()}` },
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.items.length, 1);
    assert.equal(payload.items[0].name, 'Клюквенный морс');
    assert.equal(payload.items[0].isActive, true);
    assert.equal(payload.items[0].basePriceCents, 14900);
    assert.equal(payload.items[0].discountPriceCents, 12900);
    assert.equal(payload.items[0].priceCents, 12900);
    assert.equal(payload.pagination.totalItems, 1);
  } finally {
    await stopTestServer(server);
  }
});

serialTest('GET /api/dishes/search finds dishes by name and returns paginated results', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const seededDish = await db('dishes').where({ id: 1 }).first();
    const searchTerm = String(seededDish.name).slice(0, 4);
    const response = await fetch(`${baseUrl}/api/dishes/search?q=${encodeURIComponent(searchTerm)}&limit=1`, {
      headers: { Authorization: `Bearer ${employeeToken()}` },
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.items.length, 1);
    assert.equal(payload.items[0].id, seededDish.id);
    assert.ok(payload.pagination.totalItems >= 1);
  } finally {
    await stopTestServer(server);
  }
});

serialTest('GET /api/dishes hides unavailable weekdays from employees and managers but exposes them to admins', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const today = getTodayWeekday();
    const unavailableDay = today === 1 ? 2 : 1;
    await db('dishes').where({ id: 5 }).update({
      is_active: true,
      available_weekdays: JSON.stringify([unavailableDay]),
    });

    const managerResponse = await fetch(`${baseUrl}/api/dishes?limit=20`, {
      headers: { Authorization: `Bearer ${managerToken()}` },
    });
    const adminResponse = await fetch(`${baseUrl}/api/dishes?limit=20`, {
      headers: { Authorization: `Bearer ${adminToken()}` },
    });
    const managerCategoryResponse = await fetch(`${baseUrl}/api/categories/3/dishes`, {
      headers: { Authorization: `Bearer ${managerToken()}` },
    });
    const adminCategoryResponse = await fetch(`${baseUrl}/api/categories/3/dishes`, {
      headers: { Authorization: `Bearer ${adminToken()}` },
    });

    assert.equal(managerResponse.status, 200);
    assert.equal(adminResponse.status, 200);
    assert.equal(managerCategoryResponse.status, 200);
    assert.equal(adminCategoryResponse.status, 200);

    const managerPayload = await managerResponse.json();
    const adminPayload = await adminResponse.json();
    const managerCategoryPayload = await managerCategoryResponse.json();
    const adminCategoryPayload = await adminCategoryResponse.json();

    assert.equal(managerPayload.items.some((dish: { id: number }) => dish.id === 5), false);
    assert.equal(managerPayload.items.some((dish: { availableWeekdays?: number[] }) => 'availableWeekdays' in dish), false);
    assert.equal(managerCategoryPayload.some((dish: { id: number }) => dish.id === 5), false);

    const adminDish = adminPayload.items.find((dish: { id: number }) => dish.id === 5);
    const adminCategoryDish = adminCategoryPayload.find((dish: { id: number }) => dish.id === 5);
    assert.deepEqual(adminDish.availableWeekdays, [unavailableDay]);
    assert.deepEqual(adminCategoryDish.availableWeekdays, [unavailableDay]);
  } finally {
    await stopTestServer(server);
  }
});
serialTest('GET /api/dishes/:id returns a dish by id', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/dishes/1`, {
      headers: { Authorization: `Bearer ${employeeToken()}` },
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.id, 1);
    assert.equal(payload.name, 'Маргарита');
  } finally {
    await stopTestServer(server);
  }
});

serialTest('GET /api/categories/:id/dishes returns dishes for the selected category', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/categories/1/dishes`, {
      headers: { Authorization: `Bearer ${employeeToken()}` },
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.length, 2);
    assert.deepEqual(
      payload.map((item: { name: string }) => item.name),
      ['Маргарита', 'Пепперони']
    );
  } finally {
    await stopTestServer(server);
  }
});

serialTest('POST /api/dishes creates a dish for manager or admin', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const form = new FormData();
    form.set('categoryId', '2');
    form.set('name', 'Греческий салат');
    form.set('description', 'Огурец, томат, фета.');
    form.set('basePriceCents', '52900');
    form.set('discountPriceCents', '47900');
    form.set('isActive', 'true');
    // Omitted availableWeekdays must default to every day.
    form.set('image', new Blob(['fake-image'], { type: 'image/png' }), 'dish.png');

    const response = await fetch(`${baseUrl}/api/dishes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${managerToken()}`,
      },
      body: form,
    });

    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.name, 'Греческий салат');
    assert.match(payload.imageUrl, /^\/uploads\/catalog\/.+\.png$/);

    const dish = await db('dishes').where({ name: 'Греческий салат' }).first();
    assert.ok(dish);
    assert.equal(dish.category_id, 2);
    assert.equal(typeof dish.image_url, 'string');
    const weekdays = typeof dish.available_weekdays === 'string' ? JSON.parse(dish.available_weekdays) : dish.available_weekdays;
    assert.deepEqual(weekdays, [1, 2, 3, 4, 5, 6, 7]);
  } finally {
    await stopTestServer(server);
  }
});

serialTest('PUT /api/dishes/:id partially updates a dish', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/dishes/5`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${managerToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Лимонад тархун зеро',
        basePriceCents: 13900,
        discountPriceCents: 11900,
        isActive: true,
        availableWeekdays: [1, 3, 5],
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.name, 'Лимонад тархун зеро');
    assert.equal(payload.priceCents, 13900);
    assert.equal(payload.basePriceCents, 13900);
    assert.equal(payload.discountPriceCents, 11900);
    assert.equal(payload.isActive, true);
    const dish = await db('dishes').where({ id: 5 }).first();
    const weekdays = typeof dish.available_weekdays === 'string' ? JSON.parse(dish.available_weekdays) : dish.available_weekdays;
    assert.deepEqual(weekdays, [1, 3, 5]);
  } finally {
    await stopTestServer(server);
  }
});

serialTest('PUT /api/dishes/:id ignores omitted fields and keeps current values', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const before = await db('dishes').where({ id: 5 }).first();

    const response = await fetch(`${baseUrl}/api/dishes/5`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${managerToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.name, before.name);
    assert.equal(payload.basePriceCents, before.base_price_cents);
    assert.equal(payload.discountPriceCents, before.discount_price_cents);
  } finally {
    await stopTestServer(server);
  }
});

serialTest('POST /api/dishes/:id/image rejects manager role', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const form = new FormData();
    form.set('image', new Blob(['replacement-image'], { type: 'image/png' }), 'dish.png');

    const response = await fetch(`${baseUrl}/api/dishes/1/image`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${managerToken()}`,
      },
      body: form,
    });

    assert.equal(response.status, 403);
  } finally {
    await stopTestServer(server);
  }
});
serialTest('POST /api/dishes/:id/image uploads or replaces a dish image', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const form = new FormData();
    form.set('image', new Blob(['replacement-image'], { type: 'image/webp' }), 'dish.webp');

    const response = await fetch(`${baseUrl}/api/dishes/1/image`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken()}`,
      },
      body: form,
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.id, 1);
    assert.match(payload.imageUrl, /^\/uploads\/catalog\/.+\.webp$/);

    const dish = await db('dishes').where({ id: 1 }).first();
    assert.equal(dish.image_url, payload.imageUrl);
  } finally {
    await stopTestServer(server);
  }
});
serialTest('DELETE /api/dishes/:id deletes or archives a dish', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/dishes/5`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${managerToken()}` },
    });

    assert.equal(response.status, 204);

    const dish = await db('dishes').where({ id: 5 }).first();
    assert.ok(dish.deleted_at);
  } finally {
    await stopTestServer(server);
  }
});
