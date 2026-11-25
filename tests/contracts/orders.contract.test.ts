import assert from 'node:assert/strict';
import test from 'node:test';
import db from '../../src/db/knex';
import { BUSINESS_TIME_ZONE, getBusinessDay, getBusinessIsoWeekday } from '../../src/utils/businessTime';
import { generateToken } from '../../src/utils/generateToken';
import { getNextScheduledRoute, readRouteSchedule } from '../../src/utils/routeSchedule';
import { lockAndSeedDb, releaseDbTestLock } from '../helpers/db-test-lock';
import { startTestServer, stopTestServer } from '../helpers/test-server';

const serialTest = (name: string, fn: (t: unknown) => Promise<void> | void) =>
  test(name, { concurrency: false }, fn);

const adminToken = () =>
  generateToken({ id: 1, email: 'admin@cook.local', role: 'admin', companyId: null });

const managerToken = () =>
  generateToken({ id: 2, email: 'manager.romashka@cook.local', role: 'manager', companyId: 1 });

const employeeToken = () =>
  generateToken({ id: 4, email: 'employee.ivanov@cook.local', role: 'employee', companyId: 1 });

const moveOrderToPreviousDay = async (orderId = 1): Promise<void> => {
  const previousDay = new Date();
  previousDay.setDate(previousDay.getDate() - 1);

  await db('orders').where({ id: orderId }).update({
    created_at: previousDay,
    updated_at: previousDay,
  });
};

test.beforeEach(async () => {
  await lockAndSeedDb(db);
});

test.afterEach(() => {
  releaseDbTestLock();
});

serialTest('GET /api/orders returns filtered orders list for admin or manager', async () => {
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

serialTest('GET /api/orders/:id returns order details with items for owner, manager, or admin', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/orders/1`, {
      headers: { Authorization: `Bearer ${employeeToken()}` },
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.id, 1);
    assert.equal(payload.items.length, 2);
    assert.equal(payload.canEdit, true);
    const order = await db('orders').where({ id: payload.id }).first('route_acceptance_ends_unix');
    assert.equal(payload.orderAcceptanceEndsAt, new Date(Number(order.route_acceptance_ends_unix) * 1000).toISOString());
  } finally {
    await stopTestServer(server);
  }
});

serialTest('GET /api/orders/my returns all current user orders including a soft-deleted one and a new one from today', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    await moveOrderToPreviousDay();
    await db('orders').where({ id: 1 }).update({
      deleted_at: new Date(),
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
    assert.equal(Array.isArray(payload[0].items), true);
    assert.equal(payload.every((order: { items: unknown[] }) => Array.isArray(order.items)), true);
    assert.equal(typeof payload[0].items[0]?.dishName, 'string');
    assert.equal(payload.find((order: { id: number }) => order.id === 1)?.updatedAt !== null, true);
    assert.equal(payload[0].createdAt >= payload[1].createdAt, true);
  } finally {
    await stopTestServer(server);
  }
});

serialTest('GET /api/orders/can-create-today returns the existing daily order', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    await db('orders').where({ id: 1 }).update({
      created_at: new Date(),
      updated_at: new Date(),
      status: 'created',
      deleted_at: null,
      cancelled_at: null,
    });

    const response = await fetch(`${baseUrl}/api/orders/can-create-today`, {
      headers: { Authorization: `Bearer ${employeeToken()}` },
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.canCreateOrder, false);
    assert.equal(payload.existingOrder.id, 1);
  } finally {
    await stopTestServer(server);
  }
});

serialTest('POST /api/orders creates a draft order from dishes for employee role', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    await moveOrderToPreviousDay();
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

serialTest('POST /api/orders/calculate returns total by items without creating an order', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    await moveOrderToPreviousDay();
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

serialTest('POST /api/orders/calculate applies subscription discount to only one dish per category', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    await moveOrderToPreviousDay();
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

serialTest('POST /api/orders/calculate reports an existing order for the current day', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    await db('orders').where({ id: 1 }).update({
      created_at: new Date(),
      updated_at: new Date(),
      status: 'created',
      deleted_at: null,
      cancelled_at: null,
    });

    const response = await fetch(`${baseUrl}/api/orders/calculate`, {
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
    const payload = await response.json();
    assert.equal(payload.message, 'User already has an order today');
  } finally {
    await stopTestServer(server);
  }
});

serialTest('POST /api/orders creates a draft order from dishes for manager role in the same company', async () => {
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

serialTest('PUT /api/orders/:id updates order charges for an administrator', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/orders/1`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${adminToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        deliveryFeeCents: 3000,
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.deliveryFeeCents, 3000);
    const invalid = await fetch(`${baseUrl}/api/orders/1`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ deliveryFeeCents: -1 }),
    });
    assert.equal(invalid.status, 400);
  } finally {
    await stopTestServer(server);
  }
});

serialTest('PUT /api/orders/:id preserves charges when requested by an employee or manager', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const charges = () => db('orders').where({ id: 1 }).first('delivery_fee_cents', 'discount_cents', 'total_cents');
    const before = await charges();
    for (const token of [employeeToken(), managerToken()]) {
      const response = await fetch(`${baseUrl}/api/orders/1`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ discountCents: 0, deliveryFeeCents: 0 }),
      });
      assert.equal(response.status, 403);
    }
    assert.deepEqual(await charges(), before);
  } finally {
    await stopTestServer(server);
  }
});

serialTest('DELETE /api/orders/:id cancels an order for admin or manager', async () => {
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

serialTest('PUT /api/orders/:id rejects updates after route cutoff time', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    await db('orders').where({ id: 1 }).update({
      route_acceptance_ends_unix: Math.floor(Date.now() / 1000) - 60,
    });

    const response = await fetch(`${baseUrl}/api/orders/1`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${adminToken()}`,
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

serialTest('DELETE /api/orders/:id rejects cancellation after route cutoff time', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    await db('orders').where({ id: 1 }).update({
      route_acceptance_ends_unix: Math.floor(Date.now() / 1000) - 60,
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

serialTest('POST /api/orders/:id/dishes adds an item and snapshots current dish price', async () => {
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

serialTest('PUT /api/orders/:id/dishes fully replaces order items', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/orders/1/dishes`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${employeeToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [
          { dishId: 4, qty: 1 },
          { dishId: 4, qty: 1 },
        ],
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.items.length, 1);
    assert.equal(payload.items[0].dishId, 4);
    assert.equal(payload.items[0].qty, 2);
    assert.equal(payload.items[0].discountedQty, 1);
    assert.equal(payload.items[0].lineTotalCents, 27800);
    assert.equal(payload.canEdit, true);
    assert.ok(payload.orderAcceptanceEndsAt);
    assert.equal(payload.itemsRevision, 1);

    const storedItems = await db('order_items').where({ order_id: 1 });
    assert.equal(storedItems.length, 1);
    assert.equal(storedItems[0].dish_id, 4);
  } finally {
    await stopTestServer(server);
  }
});

serialTest('Two editors cannot replace items from the same revision', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const headers = {
      Authorization: `Bearer ${employeeToken()}`,
      'Content-Type': 'application/json',
    };
    const details = () => fetch(`${baseUrl}/api/orders/1`, { headers }).then((response) => response.json());
    const before = await details();
    assert.equal(before.itemsRevision, 0);
    const replace = (dishId: number, expectedItemsRevision: number) =>
      fetch(`${baseUrl}/api/orders/1/dishes`, {
        method: 'PUT', headers,
        body: JSON.stringify({ items: [{ dishId, qty: 1 }], expectedItemsRevision }),
      });
    const responses = await Promise.all([replace(1, before.itemsRevision), replace(4, before.itemsRevision)]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
    const winner = await responses.find((response) => response.status === 200)!.json();
    const loser = await responses.find((response) => response.status === 409)!.json();
    assert.equal(winner.itemsRevision, 1);
    assert.equal(loser.message, 'Order items have changed since it was opened');
    assert.deepEqual((await details()).items, winner.items);
    const retry = await replace(2, (await details()).itemsRevision);
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).itemsRevision, 2);
    assert.equal((await db('orders').where({ user_id: 4 }).count({ count: 'id' }).first())?.count, 1);
  } finally {
    await stopTestServer(server);
  }
});

serialTest('Order creation checks a cutoff changed by a concurrent route update', async () => {
  await moveOrderToPreviousDay();
  const { server, baseUrl } = await startTestServer();
  const routeUpdate = await db.transaction();
  const originalNow = Date.now;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let onQuery: ((query: { sql: string }) => void) | undefined;
  let creation: Promise<Response> | undefined;
  try {
    const order = await db('orders').where({ id: 1 }).first('route_id');
    const route = await db('routes').where({ id: order.route_id }).first('schedule');
    const schedule = readRouteSchedule(route.schedule);
    const occurrence = getNextScheduledRoute(schedule, new Date());
    const now = occurrence.orderAcceptanceEndsAt.getTime() - 60_000;
    Date.now = () => now;
    await routeUpdate('routes').where({ id: order.route_id }).update({
      schedule: JSON.stringify({ ...schedule, orderAcceptanceEndsTime: '09:00' }),
    });
    const reachedWrite = new Promise<void>((resolve, reject) => {
      onQuery = ({ sql }) => {
        if (/from `routes`.*lock in share mode|insert into `orders`/.test(sql)) {
          resolve();
        }
      };
      db.on('query', onQuery);
      timeout = setTimeout(() => reject(new Error('Order did not reach its final route check')), 5_000);
    });
    creation = fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${employeeToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ dishId: 1, qty: 1 }] }),
    });
    await Promise.race([reachedWrite, creation.then(() => {})]);
    await routeUpdate.commit();

    const response = await creation;
    assert.equal(response.status, 409);
    assert.equal((await response.json()).message, 'Order acceptance time has ended for this route');
    assert.equal((await db('orders').where({ user_id: 4 }).count({ count: 'id' }).first())?.count, 1);
  } finally {
    clearTimeout(timeout);
    if (onQuery) db.removeListener('query', onQuery);
    if (!routeUpdate.isCompleted()) await routeUpdate.rollback();
    await creation?.catch(() => {});
    Date.now = originalNow;
    await stopTestServer(server);
  }
});

serialTest('PUT /api/orders/:id/dishes keeps old items when a replacement dish is invalid', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/orders/1/dishes`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${employeeToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ items: [{ dishId: 999999, qty: 1 }] }),
    });

    assert.equal(response.status, 404);
    const storedItems = await db('order_items').where({ order_id: 1 }).orderBy('dish_id', 'asc');
    assert.deepEqual(storedItems.map((item) => item.dish_id), [1, 2]);
  } finally {
    await stopTestServer(server);
  }
});

serialTest('PUT replacement retains the saved prices of inactive and removed order dishes', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    await db('dishes').where({ id: 1 }).update({ is_active: false, base_price_cents: 90000 });
    await db('dishes').where({ id: 2 }).update({ deleted_at: new Date(), discount_price_cents: 1 });
    const headers = {
      Authorization: `Bearer ${employeeToken()}`,
      'Content-Type': 'application/json',
    };
    const replace = (items: { dishId: number; qty: number }[]) =>
      fetch(`${baseUrl}/api/orders/1/dishes`, { method: 'PUT', headers, body: JSON.stringify({ items }) });

    const details = await fetch(`${baseUrl}/api/orders/1`, { headers });
    assert.equal(details.status, 200);
    const previous = await details.json();
    assert.equal(previous.items[0].canIncrease, false);
    assert.equal(previous.items[1].canIncrease, false);

    const rejectedIncrease = await replace([{ dishId: 1, qty: 2 }]);
    assert.equal(rejectedIncrease.status, 422);
    assert.equal((await rejectedIncrease.json()).message, 'Dish 1 is unavailable above quantity 1');
    const rejectedAddition = await replace([{ dishId: 5, qty: 1 }]);
    assert.equal(rejectedAddition.status, 422);
    assert.equal((await rejectedAddition.json()).message, 'Dish 5 is unavailable above quantity 0');

    const replacement = await replace([
      { dishId: 1, qty: 1 },
      { dishId: 2, qty: 1 },
      { dishId: 4, qty: 2 },
    ]);
    assert.equal(replacement.status, 200);
    const updated = await replacement.json();
    assert.deepEqual(updated.items.slice(0, 2), previous.items);
    assert.equal(updated.items[2].dishId, 4);
    assert.equal(updated.items[2].qty, 2);
    assert.equal(updated.items[2].canIncrease, true);
  } finally {
    await stopTestServer(server);
  }
});

serialTest('Order mutations enforce the menu weekday and preserve existing unavailable portions', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const unavailableDay = getBusinessIsoWeekday() % 7 + 1;
    await db('dishes').where({ id: 1 }).update({
      available_weekdays: JSON.stringify([unavailableDay]),
      base_price_cents: 89900,
      discount_price_cents: 79900,
    });
    const request = (method: string, path: string, token: string, body?: object) => fetch(`${baseUrl}/api/orders${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const draft = { items: [{ dishId: 1, qty: 1 }] };
    assert.equal((await request('POST', '/calculate', managerToken(), draft)).status, 422);
    assert.equal((await request('POST', '', managerToken(), draft)).status, 422);
    assert.equal((await request('POST', '/1/dishes', employeeToken(), { dishId: 1, qty: 1 })).status, 422);
    const details = await request('GET', '/1', employeeToken());
    assert.equal(details.status, 200);
    const originalDish = (await details.json()).items.find((item: { dishId: number }) => item.dishId === 1);
    assert.equal(originalDish.canIncrease, false);

    const rejected = await request('PUT', '/1/dishes', employeeToken(), { items: [{ dishId: 1, qty: 2 }] });
    assert.equal(rejected.status, 422);
    assert.match((await rejected.json()).message, /unavailable above quantity 1/);
    const preserved = await request('PUT', '/1/dishes', employeeToken(), {
      items: [...draft.items, { dishId: 4, qty: 1 }],
    });
    assert.equal(preserved.status, 200);
    const items = (await preserved.json()).items;
    assert.equal(items.find((item: { dishId: number }) => item.dishId === 1).basePriceCents, originalDish.basePriceCents);
    assert.ok(items.some((item: { dishId: number }) => item.dishId === 4));
  } finally {
    await stopTestServer(server);
  }
});

serialTest('PUT /api/orders/:id/dishes rejects full replacement after route cutoff', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    await db('orders').where({ id: 1 }).update({
      route_acceptance_ends_unix: Math.floor(Date.now() / 1000) - 60,
    });

    const response = await fetch(`${baseUrl}/api/orders/1/dishes`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${employeeToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ items: [{ dishId: 4, qty: 1 }] }),
    });

    assert.equal(response.status, 409);
    const storedItems = await db('order_items').where({ order_id: 1 }).orderBy('dish_id', 'asc');
    assert.deepEqual(storedItems.map((item) => item.dish_id), [1, 2]);
  } finally {
    await stopTestServer(server);
  }
});

serialTest('GET details and PUT replacement close at the exact route cutoff', async () => {
  const { server, baseUrl } = await startTestServer();
  const originalNow = Date.now;

  try {
    const cutoffMs = Math.floor(Date.now() / 1000) * 1000 + 60_000;
    const cutoff = new Date(cutoffMs);
    await db('orders').where({ id: 1 }).update({ route_acceptance_ends_unix: cutoffMs / 1000 });

    let now = cutoffMs - 1;
    Date.now = () => now;
    const headers = {
      Authorization: `Bearer ${employeeToken()}`,
      'Content-Type': 'application/json',
    };
    const getOrder = () => fetch(`${baseUrl}/api/orders/1`, { headers });

    const before = await getOrder();
    assert.equal(before.status, 200);
    const beforePayload = await before.json();
    assert.equal(beforePayload.orderAcceptanceEndsAt, cutoff.toISOString());
    assert.equal(beforePayload.canEdit, true);

    now = cutoffMs;
    const response = await fetch(`${baseUrl}/api/orders/1/dishes`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ items: [{ dishId: 4, qty: 1 }] }),
    });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).message, 'Order acceptance time has ended for this route');

    const atCutoff = await getOrder();
    assert.equal(atCutoff.status, 200);
    const atCutoffPayload = await atCutoff.json();
    assert.equal(atCutoffPayload.canEdit, false);
    assert.equal(atCutoffPayload.orderAcceptanceEndsAt, cutoff.toISOString());
    assert.deepEqual(atCutoffPayload.items, beforePayload.items);
    assert.equal(atCutoffPayload.totalCents, beforePayload.totalCents);
  } finally {
    Date.now = originalNow;
    await stopTestServer(server);
  }
});

serialTest('A concurrent payment and dish replacement use the same order totals', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const headers = {
      Authorization: `Bearer ${employeeToken()}`,
      'Content-Type': 'application/json',
    };
    const beforeUser = await db('users').where({ id: 4 }).first();
    const beforeCompany = await db('companies').where({ id: 1 }).first();

    const [replacement, payment, concurrentDetails, concurrentList] = await Promise.all([
      fetch(`${baseUrl}/api/orders/1/dishes`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ items: [{ dishId: 4, qty: 2 }] }),
      }),
      fetch(`${baseUrl}/api/orders/1/status`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'paid' }),
      }),
      fetch(`${baseUrl}/api/orders/1`, { headers }),
      fetch(`${baseUrl}/api/orders/my`, { headers }),
    ]);
    assert.equal(payment.status, 200);
    assert.ok([200, 409].includes(replacement.status));
    const paidOrder = await payment.json();
    assert.equal(paidOrder.status, 'paid');
    assert.deepEqual(
      paidOrder.items.map((item: { dishId: number }) => item.dishId),
      replacement.status === 200 ? [4] : [1, 2]
    );

    const afterUser = await db('users').where({ id: 4 }).first();
    const afterCompany = await db('companies').where({ id: 1 }).first();
    assert.equal(afterUser.debt_cents - beforeUser.debt_cents, paidOrder.employeeDebtCents);
    assert.equal(afterCompany.debt_cents - beforeCompany.debt_cents, paidOrder.companyPaidCents);

    assert.equal(concurrentDetails.status, 200);
    assert.equal(concurrentList.status, 200);
    const [listedOrder] = await concurrentList.json();
    for (const snapshot of [await concurrentDetails.json(), listedOrder]) {
      assert.equal(
        snapshot.subtotalCents,
        snapshot.items.reduce((sum: number, item: { lineTotalCents: number }) => sum + item.lineTotalCents, 0)
      );
    }

    const details = await fetch(`${baseUrl}/api/orders/1`, { headers });
    const detailsPayload = await details.json();
    assert.equal(detailsPayload.canEdit, false);
    assert.deepEqual(
      detailsPayload.items,
      paidOrder.items.map((item: Record<string, unknown>) => ({ ...item, canIncrease: true }))
    );
    assert.equal(detailsPayload.totalCents, paidOrder.totalCents);
  } finally {
    await stopTestServer(server);
  }
});

serialTest('DELETE /api/orders/:id/dishes/:dishId removes an order item', async () => {
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

serialTest('PATCH /api/orders/:id/status changes order status through allowed transitions', async () => {
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

for (const lastStatus of ['paid', 'cooking', 'delivering']) {
  serialTest(`Cancelling a ${lastStatus} order reverses its employee and company debt once`, async () => {
    const { server, baseUrl } = await startTestServer();
    try {
      const debts = async () => Promise.all([
        db('users').where({ id: 4 }).first('debt_cents'),
        db('companies').where({ id: 1 }).first('debt_cents'),
      ]);
      const before = await debts();
      const changeStatus = (status: string) => fetch(`${baseUrl}/api/orders/1/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${managerToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      for (const status of ['paid', 'cooking', 'delivering']) {
        assert.equal((await changeStatus(status)).status, 200);
        if (status === lastStatus) break;
      }
      const charged = await debts();
      assert.ok(charged[0].debt_cents > before[0].debt_cents);
      assert.ok(charged[1].debt_cents > before[1].debt_cents);
      assert.equal((await changeStatus('cancelled')).status, 200);
      assert.equal((await changeStatus('cancelled')).status, 409);
      assert.deepEqual(await debts(), before);
    } finally {
      await stopTestServer(server);
    }
  });
}

serialTest('PATCH /api/orders/:id/status adds debt only for the part above user limit', async () => {
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

serialTest('PATCH /api/orders/:id/status does not add debt when order fits into limit', async () => {
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

serialTest('POST /api/orders rejects a second order on the same day for the same user', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    await moveOrderToPreviousDay();
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

    const userOrders = await db('orders').where({ user_id: 4 });
    assert.equal(userOrders.length, 2);
  } finally {
    await stopTestServer(server);
  }
});

serialTest('POST /api/orders allows only one of two concurrent daily orders', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    await moveOrderToPreviousDay();

    const createOrder = () => fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${employeeToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [{ dishId: 1, qty: 1 }],
      }),
    });

    const responses = await Promise.all([createOrder(), createOrder()]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);

    const { start } = getBusinessDay();
    const ordersToday = await db('orders')
      .where({ user_id: 4 })
      .andWhereRaw('created_at >= FROM_UNIXTIME(?)', [start.getTime() / 1000]);
    assert.equal(ordersToday.length, 1);
  } finally {
    await stopTestServer(server);
  }
});

serialTest('POST /api/orders assigns different numbers to simultaneous orders from different users', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    await moveOrderToPreviousDay();
    const anotherEmployee = generateToken({
      id: 5, email: 'employee.sidorova@cook.local', role: 'employee', companyId: 1,
    });
    const responses = await Promise.all([employeeToken(), managerToken(), anotherEmployee].map((token) =>
      fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ dishId: 1, qty: 1 }] }),
      })
    ));
    assert.deepEqual(responses.map((response) => response.status), [201, 201, 201]);
    const created = await Promise.all(responses.map((response) => response.json()));
    const dayPrefix = getBusinessDay().day.replace(/-/g, '');
    assert.ok(created.every((order) => order.orderNumber.startsWith(`${dayPrefix}-`)));
    assert.equal(new Set(created.map((order) => order.orderNumber)).size, 3);
  } finally {
    await stopTestServer(server);
  }
});

test('The new order day starts at Moscow midnight, including when a legacy key is stale', {
  concurrency: false,
  skip: BUSINESS_TIME_ZONE !== 'Europe/Moscow',
}, async () => {
  const { server, baseUrl } = await startTestServer();
  const originalNow = Date.now;
  const midnight = Date.parse('2026-11-20T21:00:00Z');
  let now = midnight - 1;
  try {
    await db('orders').where({ id: 1 }).update({
      created_at: db.raw('FROM_UNIXTIME(?)', [(midnight - 60_000) / 1000]),
      order_day: '2026-11-21',
    });
    await db('routes').where({ id: 2 }).update({
      schedule: JSON.stringify({ weekdays: [6], departureTime: '00:02', orderAcceptanceEndsTime: '00:01' }),
    });
    Date.now = () => now;
    const headers = { Authorization: `Bearer ${employeeToken()}`, 'Content-Type': 'application/json' };
    const availability = () => fetch(`${baseUrl}/api/orders/can-create-today`, { headers });
    assert.equal((await (await availability()).json()).canCreateOrder, false);
    now = midnight;
    assert.equal((await (await availability()).json()).canCreateOrder, true);
    const createOrder = () => fetch(`${baseUrl}/api/orders`, {
      method: 'POST', headers, body: JSON.stringify({ items: [{ dishId: 1, qty: 1 }] }),
    });
    const created = await createOrder();
    assert.equal(created.status, 201);
    assert.match((await created.json()).orderNumber, /^20261121-/);
    assert.equal((await (await availability()).json()).canCreateOrder, false);
    assert.equal((await createOrder()).status, 409);
  } finally {
    Date.now = originalNow;
    await stopTestServer(server);
  }
});

serialTest('POST /api/orders rejects creation after route cutoff time', async () => {
  const { server, baseUrl } = await startTestServer();
  const originalNow = Date.now;

  try {
    await moveOrderToPreviousDay();
    const route = await db('routes').where({ id: 2 }).first('schedule');
    const occurrence = getNextScheduledRoute(readRouteSchedule(route.schedule), new Date());
    const now = occurrence.orderAcceptanceEndsAt.getTime() + 60_000;
    Date.now = () => now;

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
    Date.now = originalNow;
    await stopTestServer(server);
  }
});

test('Weekly order creation respects the upcoming cutoff and preserves the booked occurrence', {
  concurrency: false,
  skip: BUSINESS_TIME_ZONE !== 'Europe/Moscow',
}, async () => {
  const { server, baseUrl } = await startTestServer();
  const originalNow = Date.now;
  let now = Date.parse('2026-11-27T09:00:00Z');

  try {
    await db('orders').where({ id: 1 }).update({
      created_at: db.raw('FROM_UNIXTIME(?)', [Date.parse('2026-11-26T08:00:00Z') / 1000]),
      order_day: null,
    });

    Date.now = () => now;
    const schedule = { weekdays: [1, 5], departureTime: '13:00', orderAcceptanceEndsTime: '12:00' };
    const setSchedule = (weekdays: number[]) => fetch(`${baseUrl}/api/routes/2`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ schedule: { ...schedule, weekdays } }),
    });
    assert.equal((await setSchedule(schedule.weekdays)).status, 200);

    const createOrder = () => fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${employeeToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ dishId: 1, qty: 1 }] }),
    });
    const rejected = await createOrder();
    assert.equal(rejected.status, 409);
    assert.equal((await rejected.json()).message, 'No active route is available for this company');

    now = Date.parse('2026-11-27T10:00:00Z');
    const created = await createOrder();
    assert.equal(created.status, 201);
    const { id } = await created.json();
    const order = await db('orders').where({ id }).first();
    assert.equal(Number(order.route_departure_unix), Date.parse('2026-11-30T10:00:00Z') / 1000);
    assert.equal(Number(order.route_acceptance_ends_unix), Date.parse('2026-11-30T09:00:00Z') / 1000);

    assert.equal((await setSchedule([2])).status, 200);
    const orderDetails = () => fetch(`${baseUrl}/api/orders/${id}`, {
      headers: { Authorization: `Bearer ${employeeToken()}` },
    });
    const beforeCutoff = await orderDetails();
    assert.equal(beforeCutoff.status, 200);
    const details = await beforeCutoff.json();
    assert.equal(details.canEdit, true);
    assert.equal(details.orderAcceptanceEndsAt, '2026-11-30T09:00:00.000Z');

    now = Date.parse(details.orderAcceptanceEndsAt);
    assert.equal((await (await orderDetails()).json()).canEdit, false);
    const edit = await fetch(`${baseUrl}/api/orders/${id}/dishes`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${employeeToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ dishId: 1, qty: 2 }] }),
    });
    assert.equal(edit.status, 409);
    assert.equal((await edit.json()).message, 'Order acceptance time has ended for this route');
  } finally {
    Date.now = originalNow;
    await stopTestServer(server);
  }
});

test('An eight-day cutoff books the first weekly departure still accepting orders', {
  concurrency: false,
  skip: BUSINESS_TIME_ZONE !== 'Europe/Moscow',
}, async () => {
  const { server, baseUrl } = await startTestServer();
  const originalNow = Date.now;
  const now = Date.parse('2026-11-27T09:00:00Z');

  try {
    await db('orders').where({ id: 1 }).update({
      created_at: db.raw('FROM_UNIXTIME(?)', [(now - 24 * 3600_000) / 1000]),
      order_day: null,
    });
    Date.now = () => now;
    const adminHeaders = { Authorization: `Bearer ${adminToken()}`, 'Content-Type': 'application/json' };
    const schedule = {
      weekdays: [5],
      departureTime: '13:00',
      orderAcceptanceEndsTime: '18:00',
      orderAcceptanceDaysBefore: 8,
    };
    const updated = await fetch(`${baseUrl}/api/routes/2`, {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ schedule }),
    });
    assert.equal(updated.status, 200);
    const routeResponse = await fetch(`${baseUrl}/api/routes/2`, { headers: adminHeaders });
    assert.equal(routeResponse.status, 200);
    assert.equal((await routeResponse.json()).departureAt, '2026-11-27T10:00:00.000Z');

    const headers = { Authorization: `Bearer ${employeeToken()}`, 'Content-Type': 'application/json' };
    const response = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ items: [{ dishId: 1, qty: 1 }] }),
    });
    assert.equal(response.status, 201);
    const { id } = await response.json();
    const order = await db('orders').where({ id }).first();
    assert.equal(Number(order.route_departure_unix), Date.parse('2026-12-11T10:00:00Z') / 1000);
    assert.equal(Number(order.route_acceptance_ends_unix), Date.parse('2026-12-03T15:00:00Z') / 1000);

    const detailsResponse = await fetch(`${baseUrl}/api/orders/${id}`, { headers });
    assert.equal(detailsResponse.status, 200);
    const details = await detailsResponse.json();
    assert.equal(details.orderAcceptanceEndsAt, '2026-12-03T15:00:00.000Z');
    assert.equal(details.canEdit, true);
  } finally {
    Date.now = originalNow;
    await stopTestServer(server);
  }
});
