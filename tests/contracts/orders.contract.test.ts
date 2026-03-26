import assert from 'node:assert/strict';
import test from 'node:test';
import db from '../../src/db/knex';
import { generateToken } from '../../src/utils/generateToken';
import { seed } from '../../seeds/01_demo_data';
import { startTestServer, stopTestServer } from '../helpers/test-server';

const adminToken = () =>
  generateToken({ id: 1, email: 'admin@cook.local', role: 'admin', companyId: null });

const managerToken = () =>
  generateToken({ id: 2, email: 'manager.romashka@cook.local', role: 'manager', companyId: 1 });

const employeeToken = () =>
  generateToken({ id: 4, email: 'employee.ivanov@cook.local', role: 'employee', companyId: 1 });

test.beforeEach(async () => {
  await seed(db);
});

test('GET /api/orders returns filtered orders list for admin or manager', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const adminResponse = await fetch(`${baseUrl}/api/orders?status=paid`, {
      headers: { Authorization: `Bearer ${adminToken()}` },
    });
    const managerResponse = await fetch(`${baseUrl}/api/orders`, {
      headers: { Authorization: `Bearer ${managerToken()}` },
    });

    assert.equal(adminResponse.status, 200);
    assert.equal(managerResponse.status, 200);

    const adminPayload = await adminResponse.json();
    const managerPayload = await managerResponse.json();

    assert.equal(adminPayload.length, 1);
    assert.equal(adminPayload[0].status, 'paid');
    assert.equal(managerPayload.every((order: { companyId: number }) => order.companyId === 1), true);
  } finally {
    await stopTestServer(server);
  }
});

test('GET /api/orders/:id returns order details with items for owner, manager, or admin', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/orders/1`, {
      headers: { Authorization: `Bearer ${employeeToken()}` },
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.id, 1);
    assert.equal(payload.items.length, 2);
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/orders creates a draft order for employee role', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${employeeToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deliveryFeeCents: 1000,
        discountCents: 200,
      }),
    });

    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.status, 'created');
    assert.equal(payload.companyId, 1);
    assert.equal(payload.routeId, 2);
    assert.equal(payload.totalCents, 800);
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/orders creates a draft order for manager role in the same company', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${managerToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deliveryFeeCents: 500,
      }),
    });

    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.companyId, 1);
    assert.equal(payload.userId, 2);
    assert.equal(payload.routeId, 2);
  } finally {
    await stopTestServer(server);
  }
});

test('PUT /api/orders/:id updates order meta fields for owner or manager', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/orders/1`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${employeeToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deliveryFeeCents: 3000,
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.deliveryFeeCents, 3000);
  } finally {
    await stopTestServer(server);
  }
});

test('DELETE /api/orders/:id cancels an order for admin or manager', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/orders/1`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${managerToken()}` },
    });

    assert.equal(response.status, 204);

    const order = await db('orders').where({ id: 1 }).first();
    assert.equal(order.status, 'cancelled');
    assert.ok(order.cancelled_at);
  } finally {
    await stopTestServer(server);
  }
});

test('PUT /api/orders/:id rejects updates after route cutoff time', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    await db('routes').where({ id: 2 }).update({
      order_acceptance_ends_at: new Date(Date.now() - 60 * 1000),
    });

    const response = await fetch(`${baseUrl}/api/orders/1`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${employeeToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deliveryFeeCents: 3000,
      }),
    });

    assert.equal(response.status, 409);
  } finally {
    await stopTestServer(server);
  }
});

test('DELETE /api/orders/:id rejects cancellation after route cutoff time', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    await db('routes').where({ id: 2 }).update({
      order_acceptance_ends_at: new Date(Date.now() - 60 * 1000),
    });

    const response = await fetch(`${baseUrl}/api/orders/1`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${employeeToken()}` },
    });

    assert.equal(response.status, 409);
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/orders/:id/dishes adds an item and snapshots current dish price', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/orders/1/dishes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${employeeToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ dishId: 4, qty: 2 }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    const addedItem = payload.items.find((item: { dishId: number }) => item.dishId === 4);
    assert.ok(addedItem);
    assert.equal(addedItem.priceCents, 12900);
  } finally {
    await stopTestServer(server);
  }
});

test('PUT /api/orders/:id/dishes changes item quantity for owner or manager', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/orders/1/dishes`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${employeeToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ dishId: 1, qty: 3 }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    const updatedItem = payload.items.find((item: { dishId: number }) => item.dishId === 1);
    assert.equal(updatedItem.qty, 3);
    assert.equal(updatedItem.lineTotalCents, 179700);
  } finally {
    await stopTestServer(server);
  }
});

test('DELETE /api/orders/:id/dishes/:dishId removes an order item', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/orders/1/dishes/2`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${employeeToken()}` },
    });

    assert.equal(response.status, 204);

    const item = await db('order_items').where({ order_id: 1, dish_id: 2 }).first();
    assert.equal(item, undefined);
  } finally {
    await stopTestServer(server);
  }
});

test('PATCH /api/orders/:id/status changes order status through allowed transitions', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const payResponse = await fetch(`${baseUrl}/api/orders/1/status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${employeeToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'paid' }),
    });

    assert.equal(payResponse.status, 200);

    const cookingResponse = await fetch(`${baseUrl}/api/orders/1/status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${managerToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'cooking' }),
    });

    assert.equal(cookingResponse.status, 200);
    const payload = await cookingResponse.json();
    assert.equal(payload.status, 'cooking');
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/orders rejects creation after route cutoff time', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    await db('routes').where({ id: 2 }).update({
      order_acceptance_ends_at: new Date(Date.now() - 60 * 1000),
    });

    const response = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${employeeToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    assert.equal(response.status, 409);
  } finally {
    await stopTestServer(server);
  }
});
