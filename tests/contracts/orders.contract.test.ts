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

test('GET /api/orders/my returns all current user orders including a soft-deleted one and a new one from today', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    await db('orders').where({ id: 1 }).update({
      deleted_at: new Date(),
      updated_at: new Date(),
    });

    const createResponse = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${employeeToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [{ dishId: 1, qty: 1 }],
      }),
    });

    assert.equal(createResponse.status, 201);

    const response = await fetch(`${baseUrl}/api/orders/my`, {
      headers: { Authorization: `Bearer ${employeeToken()}` },
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.length, 2);
    assert.equal(payload.every((order: { userId: number }) => order.userId === 4), true);
    assert.equal(payload.some((order: { id: number }) => order.id === 1), true);
    assert.equal(payload.find((order: { id: number }) => order.id === 1)?.updatedAt !== null, true);
    assert.equal(payload[0].createdAt >= payload[1].createdAt, true);
  } finally {
    await stopTestServer(server);
  }
});

test('GET /api/orders/can-create-today shows whether user can create an order today', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    await db('orders').where({ id: 1 }).update({
      created_at: new Date(),
      updated_at: new Date(),
      status: 'created',
      deleted_at: null,
      cancelled_at: null,
    });

    const busyResponse = await fetch(`${baseUrl}/api/orders/can-create-today`, {
      headers: { Authorization: `Bearer ${employeeToken()}` },
    });

    assert.equal(busyResponse.status, 200);
    const busyPayload = await busyResponse.json();
    assert.equal(busyPayload.canCreateOrder, false);
    assert.equal(busyPayload.existingOrder.id, 1);

    await db('orders').where({ id: 1 }).update({
      status: 'cancelled',
      cancelled_at: new Date(),
      updated_at: new Date(),
    });

    const freeResponse = await fetch(`${baseUrl}/api/orders/can-create-today`, {
      headers: { Authorization: `Bearer ${employeeToken()}` },
    });

    assert.equal(freeResponse.status, 200);
    const freePayload = await freeResponse.json();
    assert.equal(freePayload.canCreateOrder, true);
    assert.equal(freePayload.existingOrder, null);
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/orders creates a draft order from dishes for employee role', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${employeeToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [
          { dishId: 1, qty: 1 },
          { dishId: 4, qty: 2 },
        ],
      }),
    });

    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.status, 'created');
    assert.equal(payload.companyId, 1);
    assert.equal(payload.routeId, 2);
    assert.equal(payload.subtotalCents, 81700);
    assert.equal(payload.totalCents, 81700);
    assert.equal(payload.items.length, 2);
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/orders/calculate returns total by items without creating an order', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/orders/calculate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${employeeToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [
          { dishId: 1, qty: 1 },
          { dishId: 4, qty: 2 },
        ],
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.subtotalCents, 81700);
    assert.equal(payload.totalCents, 81700);
    assert.equal(payload.orderLimitCents, 100);
    assert.equal(payload.companyPaidCents, 100);
    assert.equal(payload.employeeDebtCents, 81600);
    assert.equal(payload.items.length, 2);

    const ordersCount = await db('orders').count<{ count: number }>('id as count').first();
    assert.equal(Number(ordersCount?.count ?? 0), 3);
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/orders/calculate applies subscription discount to only one dish per category', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/orders/calculate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${employeeToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [
          { dishId: 1, qty: 1 },
          { dishId: 2, qty: 1 },
          { dishId: 4, qty: 2 },
        ],
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();

    const margherita = payload.items.find((item: { dishId: number }) => item.dishId === 1);
    const pepperoni = payload.items.find((item: { dishId: number }) => item.dishId === 2);
    const drink = payload.items.find((item: { dishId: number }) => item.dishId === 4);

    assert.equal(payload.subtotalCents, 156600);
    assert.equal(margherita.discountedQty, 1);
    assert.equal(margherita.lineTotalCents, 53900);
    assert.equal(pepperoni.discountedQty, 0);
    assert.equal(pepperoni.lineTotalCents, 74900);
    assert.equal(drink.discountedQty, 1);
    assert.equal(drink.lineTotalCents, 27800);
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/orders creates a draft order from dishes for manager role in the same company', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${managerToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [{ dishId: 2, qty: 1 }],
      }),
    });

    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.companyId, 1);
    assert.equal(payload.userId, 2);
    assert.equal(payload.routeId, 2);
    assert.equal(payload.totalCents, 67400);
    assert.equal(payload.items.length, 1);
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
    assert.equal(addedItem.discountedQty, 1);
    assert.equal(addedItem.lineTotalCents, 27800);
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
    assert.equal(updatedItem.discountedQty, 1);
    assert.equal(updatedItem.lineTotalCents, 173700);
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

test('PATCH /api/orders/:id/status adds debt only for the part above user limit', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    await db('users').where({ id: 4 }).update({
      order_limit_cents: 100000,
      debt_cents: 0,
    });

    const response = await fetch(`${baseUrl}/api/orders/1/status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${employeeToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'paid' }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.companyPaidCents, 100000);
    assert.equal(payload.employeeDebtCents, 43700);

    const user = await db('users').where({ id: 4 }).first();
    assert.equal(user.debt_cents, 43700);
  } finally {
    await stopTestServer(server);
  }
});

test('PATCH /api/orders/:id/status does not add debt when order fits into limit', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    await db('users').where({ id: 4 }).update({
      order_limit_cents: 200000,
      debt_cents: 0,
    });

    const response = await fetch(`${baseUrl}/api/orders/1/status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${employeeToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'paid' }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.companyPaidCents, 143700);
    assert.equal(payload.employeeDebtCents, 0);

    const user = await db('users').where({ id: 4 }).first();
    assert.equal(user.debt_cents, 0);
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/orders rejects creating a second order on the same day for the same user', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const firstResponse = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${employeeToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [{ dishId: 1, qty: 1 }],
      }),
    });

    const secondResponse = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${employeeToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [{ dishId: 4, qty: 1 }],
      }),
    });

    assert.equal(firstResponse.status, 201);
    assert.equal(secondResponse.status, 409);
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
      body: JSON.stringify({
        items: [{ dishId: 1, qty: 1 }],
      }),
    });

    assert.equal(response.status, 409);
  } finally {
    await stopTestServer(server);
  }
});
