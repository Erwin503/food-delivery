import assert from 'node:assert/strict';
import test from 'node:test';
import db from '../../src/db/knex';
import { generateToken } from '../../src/utils/generateToken';
import { seed } from '../../seeds/01_demo_data';
import { startTestServer, stopTestServer } from '../helpers/test-server';

const employeeToken = () =>
  generateToken({ id: 4, email: 'employee.ivanov@cook.local', role: 'employee', companyId: 1 });

const managerToken = () =>
  generateToken({ id: 2, email: 'manager.romashka@cook.local', role: 'manager', companyId: 1 });

test.beforeEach(async () => {
  await seed(db);
});

test('GET /api/categories returns sorted categories list', async () => {
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
      ['Pizza', 'Salads', 'Drinks']
    );
  } finally {
    await stopTestServer(server);
  }
});

test('GET /api/categories/:id returns a category by id', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/categories/2`, {
      headers: { Authorization: `Bearer ${employeeToken()}` },
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.id, 2);
    assert.equal(payload.name, 'Salads');
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/categories creates a category for manager or admin', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/categories`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${managerToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Soups', sortOrder: 40 }),
    });

    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.name, 'Soups');

    const category = await db('categories').where({ name: 'Soups' }).first();
    assert.ok(category);
    assert.equal(category.sort_order, 40);
  } finally {
    await stopTestServer(server);
  }
});

test('PUT /api/categories/:id partially updates a category', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/categories/2`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${managerToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Fresh salads', sortOrder: 25 }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.name, 'Fresh salads');
    assert.equal(payload.sortOrder, 25);
  } finally {
    await stopTestServer(server);
  }
});

test('DELETE /api/categories/:id deletes or archives a category', async () => {
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

test('GET /api/dishes returns dishes with category and active filters', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/dishes?categoryId=3&isActive=true`, {
      headers: { Authorization: `Bearer ${employeeToken()}` },
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.length, 1);
    assert.equal(payload[0].name, 'Cranberry mors');
    assert.equal(payload[0].isActive, true);
  } finally {
    await stopTestServer(server);
  }
});

test('GET /api/dishes/:id returns a dish by id', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/dishes/1`, {
      headers: { Authorization: `Bearer ${employeeToken()}` },
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.id, 1);
    assert.equal(payload.name, 'Margherita');
  } finally {
    await stopTestServer(server);
  }
});

test('GET /api/categories/:id/dishes returns dishes for the selected category', async () => {
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
      ['Margherita', 'Pepperoni']
    );
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/dishes creates a dish for manager or admin', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/dishes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${managerToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        categoryId: 2,
        name: 'Greek salad',
        description: 'Cucumber, tomato, feta.',
        priceCents: 52900,
        isActive: true,
      }),
    });

    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.name, 'Greek salad');

    const dish = await db('dishes').where({ name: 'Greek salad' }).first();
    assert.ok(dish);
    assert.equal(dish.category_id, 2);
  } finally {
    await stopTestServer(server);
  }
});

test('PUT /api/dishes/:id partially updates a dish', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/dishes/5`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${managerToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Tarragon lemonade zero',
        priceCents: 13900,
        isActive: true,
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.name, 'Tarragon lemonade zero');
    assert.equal(payload.priceCents, 13900);
    assert.equal(payload.isActive, true);
  } finally {
    await stopTestServer(server);
  }
});

test('DELETE /api/dishes/:id deletes or archives a dish', async () => {
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
