import assert from 'node:assert/strict';
import test from 'node:test';
import { down, up } from '../../migrations/20261125020000_require_weekly_route_schedules';
import db from '../../src/db/knex';
import { BUSINESS_TIME_ZONE } from '../../src/utils/businessTime';
import { generateToken } from '../../src/utils/generateToken';
import { getNextScheduledRoute, readRouteSchedule } from '../../src/utils/routeSchedule';
import { lockAndSeedDb, releaseDbTestLock } from '../helpers/db-test-lock';
import { startTestServer, stopTestServer } from '../helpers/test-server';

const serialTest = (name: string, fn: (t: unknown) => Promise<void> | void) =>
  test(name, { concurrency: false }, fn);

const weekdaySchedule = { weekdays: [1, 2, 3, 4, 5], departureTime: '13:00', orderAcceptanceEndsTime: '11:00' };

const adminToken = () =>
  generateToken({ id: 1, email: 'admin@cook.local', role: 'admin', companyId: null });

const managerToken = () =>
  generateToken({ id: 2, email: 'manager.romashka@cook.local', role: 'manager', companyId: 1 });

test.beforeEach(async () => {
  await lockAndSeedDb(db);
});

test.afterEach(() => {
  releaseDbTestLock();
});

serialTest('GET /api/routes returns routes filtered by date range', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const order = await db('orders').where({ id: 1 }).first('route_departure_unix');
    const date = new Date(Number(order.route_departure_unix) * 1000).toISOString();
    const filter = new URLSearchParams({ dateFrom: date, dateTo: date });
    const response = await fetch(`${baseUrl}/api/routes?${filter}`, {
      headers: { Authorization: `Bearer ${adminToken()}` },
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.some((item: { id: number }) => item.id === 2), true);
  } finally {
    await stopTestServer(server);
  }
});

serialTest('GET /api/routes/:id returns one route with its details', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/routes/2`, {
      headers: { Authorization: `Bearer ${adminToken()}` },
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.id, 2);
    assert.equal(payload.schedule.departureTime, '12:00');
    assert.equal(payload.schedule.timeZone, BUSINESS_TIME_ZONE);
    assert.equal(payload.companies.length, 1);
    assert.equal(payload.companies[0].id, 1);
  } finally {
    await stopTestServer(server);
  }
});

serialTest('POST /api/routes creates a route for admin', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    await db('route_companies').whereIn('company_id', [1, 2]).delete();

    const response = await fetch(`${baseUrl}/api/routes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Evening route',
        schedule: weekdaySchedule,
        description: 'Evening deliveries',
        companyIds: [1, 2],
      }),
    });

    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.name, 'Evening route');
    assert.equal(payload.companies.length, 2);
    const companyAssignments = await db('route_companies').whereIn('company_id', [1, 2]);
    assert.equal(companyAssignments.length, 2);
    assert.equal(companyAssignments.every((row) => row.route_id === payload.id), true);
  } finally {
    await stopTestServer(server);
  }
});

serialTest('PUT /api/routes/:id updates route fields', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    await db('routes').where({ id: 3 }).update({ deleted_at: new Date() });

    const response = await fetch(`${baseUrl}/api/routes/2`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${adminToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Updated day route',
        schedule: weekdaySchedule,
        companyIds: [1, 3],
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.name, 'Updated day route');
    assert.deepEqual(
      payload.companies.map((item: { id: number }) => item.id),
      [1, 3]
    );
    const companyAssignments = await db('route_companies').whereIn('company_id', [1, 3]);
    assert.equal(companyAssignments.length, 2);
    assert.equal(companyAssignments.every((row) => row.route_id === 2), true);
  } finally {
    await stopTestServer(server);
  }
});

serialTest('PUT /api/routes/:id ignores omitted fields and keeps current values', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const before = await db('routes').where({ id: 2 }).first();

    const response = await fetch(`${baseUrl}/api/routes/2`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${adminToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.name, before.name);
    const schedule = readRouteSchedule(before.schedule);
    const times = getNextScheduledRoute(schedule, new Date(Date.now() + 1));
    assert.deepEqual(payload.schedule, { ...schedule, timeZone: BUSINESS_TIME_ZONE });
    assert.equal(payload.departureAt, times.departureAt.toISOString());
    assert.equal(payload.orderAcceptanceEndsAt, times.orderAcceptanceEndsAt.toISOString());
  } finally {
    await stopTestServer(server);
  }
});

serialTest('DELETE /api/routes/:id deletes or archives a route', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/routes/2`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken()}` },
    });

    assert.equal(response.status, 204);
    const route = await db('routes').where({ id: 2 }).first();
    assert.ok(route.deleted_at);
  } finally {
    await stopTestServer(server);
  }
});

serialTest('GET /api/routes/:id/companies returns companies assigned to a route', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/routes/1/companies`, {
      headers: { Authorization: `Bearer ${adminToken()}` },
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(payload.map((item: { id: number }) => item.id), [2]);
  } finally {
    await stopTestServer(server);
  }
});

serialTest('GET /api/routes/available-companies returns only companies without an active route', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    await db('routes').where({ id: 3 }).update({
      deleted_at: new Date(),
      updated_at: new Date(),
    });

    const response = await fetch(`${baseUrl}/api/routes/available-companies`, {
      headers: { Authorization: `Bearer ${adminToken()}` },
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(payload.map((company: { id: number }) => company.id), [3]);
  } finally {
    await stopTestServer(server);
  }
});

serialTest('POST /api/routes/:id/companies assigns a company to a route', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    await db('route_companies').where({ company_id: 3 }).delete();
    const response = await fetch(`${baseUrl}/api/routes/1/companies`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ companyId: 3 }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.some((item: { id: number }) => item.id === 3), true);
    const assignments = await db('route_companies').where({ company_id: 3 });
    assert.deepEqual(assignments.map((row) => row.route_id), [1]);
  } finally {
    await stopTestServer(server);
  }
});

serialTest('Every route write rejects a company assigned to another active route', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    const assignments = () => db('route_companies').select('company_id', 'route_id').orderBy('company_id');
    const before = await assignments();
    const headers = { Authorization: `Bearer ${adminToken()}`, 'Content-Type': 'application/json' };
    const requests = [
      ['POST', '/routes', {
        name: 'Conflicting delivery',
        schedule: weekdaySchedule,
        companyIds: [1],
      }],
      ['PUT', '/routes/1', { name: 'Conflicting update', companyIds: [1, 2] }],
      ['POST', '/routes/1/companies', { companyId: 1 }],
    ] as const;
    for (const [method, path, body] of requests) {
      const response = await fetch(`${baseUrl}/api${path}`, { method, headers, body: JSON.stringify(body) });
      assert.equal(response.status, 409);
      assert.deepEqual(await assignments(), before);
    }
    const routes = await db('routes').select('name');
    assert.equal(routes.length, 3);
    assert.ok(routes.every((route) => !route.name.startsWith('Conflicting')));
  } finally {
    await stopTestServer(server);
  }
});

serialTest('Concurrent route assignments leave one winner and one conflict', async () => {
  const { server, baseUrl } = await startTestServer();
  try {
    await db('route_companies').where({ company_id: 3 }).delete();
    const responses = await Promise.all([1, 2].map(routeId => fetch(`${baseUrl}/api/routes/${routeId}/companies`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId: 3 }),
    })));
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
    const assignments = await db('route_companies').where({ company_id: 3 });
    assert.equal(assignments.length, 1);
    assert.equal(assignments[0].route_id, responses[0].status === 200 ? 1 : 2);
  } finally {
    await stopTestServer(server);
  }
});

serialTest('DELETE /api/routes/:id/companies/:companyId removes a company from a route', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/routes/1/companies/2`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken()}` },
    });

    assert.equal(response.status, 204);
    const row = await db('route_companies').where({ route_id: 1, company_id: 2 }).first();
    assert.equal(row, undefined);
  } finally {
    await stopTestServer(server);
  }
});

serialTest('routes endpoints are forbidden for non-admin users', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/routes`, {
      headers: { Authorization: `Bearer ${managerToken()}` },
    });

    assert.equal(response.status, 403);
  } finally {
    await stopTestServer(server);
  }
});

test('Weekly routes create, filter by occurrence, and keep their schedule on a partial update', {
  concurrency: false,
  skip: BUSINESS_TIME_ZONE !== 'Europe/Moscow',
}, async () => {
  const { server, baseUrl } = await startTestServer();
  const originalNow = Date.now;

  try {
    Date.now = () => Date.parse('2026-11-26T08:00:00Z');
    const headers = { Authorization: `Bearer ${adminToken()}`, 'Content-Type': 'application/json' };
    const write = (method: 'POST' | 'PUT', path: string, body: object) =>
      fetch(`${baseUrl}/api/routes${path}`, { method, headers, body: JSON.stringify(body) });
    const schedule = { weekdays: [5, 2, 1, 3, 5], departureTime: '13:00', orderAcceptanceEndsTime: '11:00' };

    const creation = await write('POST', '', { name: 'Регулярный рейс', schedule });
    assert.equal(creation.status, 201);
    const route = await creation.json();
    assert.deepEqual(route.schedule, { ...schedule, weekdays: [1, 2, 3, 5], timeZone: BUSINESS_TIME_ZONE });
    assert.equal(route.departureAt, '2026-11-27T10:00:00.000Z');
    assert.equal(route.orderAcceptanceEndsAt, '2026-11-27T08:00:00.000Z');

    const list = async (dateFrom: string, dateTo?: string) => {
      const query = new URLSearchParams({ dateFrom });
      if (dateTo) query.set('dateTo', dateTo);
      const response = await fetch(`${baseUrl}/api/routes?${query}`, { headers });
      assert.equal(response.status, 200);
      return await response.json() as Array<{ id: number; departureAt: string }>;
    };
    const ranged = await list('2026-11-27T10:00:00.001Z', '2026-11-30T10:00:00.000Z');
    assert.deepEqual(ranged.filter((item) => item.id === route.id).map((item) => item.departureAt), [
      '2026-11-30T10:00:00.000Z',
    ]);
    assert.ok(!(await list('2026-11-27T10:00:00.001Z', '2026-11-30T09:59:59.999Z'))
      .some((item) => item.id === route.id));

    for (const range of [
      { dateFrom: '0099-01-01T00:00:00Z' },
      { dateTo: '+010000-01-01T00:00:00Z' },
    ]) {
      const query = new URLSearchParams(Object.entries(range));
      const response = await fetch(`${baseUrl}/api/routes?${query}`, { headers });
      assert.equal(response.status, 400);
    }
    assert.deepEqual(await list('9999-12-31T23:59:59.999Z'), []);

    const rename = await write('PUT', `/${route.id}`, { name: 'Новое название' });
    assert.equal(rename.status, 200);
    assert.deepEqual((await rename.json()).schedule, route.schedule);
    assert.equal((await write('PUT', `/${route.id}`, { departureAt: route.departureAt })).status, 400);

    const daily = { ...schedule, weekdays: [1, 2, 3, 4, 5, 6, 7], orderAcceptanceEndsTime: '12:00' };
    const reschedule = await write('PUT', `/${route.id}`, { schedule: daily });
    assert.equal(reschedule.status, 200);
    const everyDay = await reschedule.json();
    assert.deepEqual(everyDay.schedule, { ...daily, timeZone: BUSINESS_TIME_ZONE });
    assert.equal(everyDay.departureAt, '2026-11-26T10:00:00.000Z');
    assert.equal(everyDay.orderAcceptanceEndsAt, '2026-11-26T09:00:00.000Z');

    const priorDay = { ...daily, orderAcceptanceEndsTime: '18:00', orderAcceptanceDaysBefore: 1 };
    const priorDayUpdate = await write('PUT', `/${route.id}`, { schedule: priorDay });
    assert.equal(priorDayUpdate.status, 200);
    const priorDayRoute = await priorDayUpdate.json();
    assert.deepEqual(priorDayRoute.schedule, { ...priorDay, timeZone: BUSINESS_TIME_ZONE });
    assert.equal(priorDayRoute.departureAt, '2026-11-26T10:00:00.000Z');
    assert.equal(priorDayRoute.orderAcceptanceEndsAt, '2026-11-25T15:00:00.000Z');

    assert.equal((await write('PUT', `/${route.id}`, { schedule: null })).status, 400);
    assert.equal((await write('PUT', `/${route.id}`, { orderAcceptanceEndsAt: null })).status, 400);
    assert.equal((await write('PUT', `/${route.id}`, {
      schedule: null,
      departureAt: '2026-12-04T10:00:00.000Z',
      orderAcceptanceEndsAt: '2026-12-03T18:00:00.000Z',
    })).status, 400);
  } finally {
    Date.now = originalNow;
    await stopTestServer(server);
  }
});

serialTest('POST /api/routes rejects missing or invalid schedules and absolute route times', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const headers = { Authorization: `Bearer ${adminToken()}`, 'Content-Type': 'application/json' };
    const schedule = { weekdays: [1, 2], departureTime: '13:00', orderAcceptanceEndsTime: '11:00' };
    const invalid = [
      {},
      { departureAt: '2026-12-04T10:00:00.000Z', orderAcceptanceEndsAt: '2026-12-03T18:00:00.000Z' },
      { schedule: { ...schedule, weekdays: [] } },
      { schedule: { ...schedule, weekdays: [1, 8] } },
      { schedule: { ...schedule, weekdays: ['1', 2] } },
      { schedule: { ...schedule, departureTime: '9:15' } },
      { schedule: { ...schedule, departureTime: '24:00' } },
      { schedule: { ...schedule, orderAcceptanceEndsTime: '13:00' } },
      { schedule: { ...schedule, orderAcceptanceDaysBefore: -1 } },
      { schedule: { ...schedule, orderAcceptanceDaysBefore: 1.5 } },
      { schedule: { ...schedule, orderAcceptanceDaysBefore: '1' } },
      { schedule: { ...schedule, orderAcceptanceDaysBefore: null } },
      { schedule, departureAt: '2026-12-04T10:00:00.000Z' },
      { schedule, orderAcceptanceEndsAt: null },
      { schedule: null },
    ];
    for (const body of invalid) {
      const response = await fetch(`${baseUrl}/api/routes`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'Неверное расписание', ...body }),
      });
      assert.equal(response.status, 400, JSON.stringify(body));
    }
  } finally {
    await stopTestServer(server);
  }
});

test('Migration converts historical routes and snapshots without changing existing schedules or assignments', {
  concurrency: false,
  skip: BUSINESS_TIME_ZONE !== 'Europe/Moscow',
}, async () => {
  const activeOrder = await db('orders').where({ id: 1 }).first();
  const archivedOrder = await db('orders').where({ id: 3 }).first();
  const assignments = () => db('route_companies').select('company_id', 'route_id').orderBy('company_id');
  const oldAssignments = await assignments();
  const originalWeekly = readRouteSchedule((await db('routes').where({ id: 2 }).first('schedule')).schedule);
  const activeDeparture = Date.parse('2026-11-26T21:00:30Z') / 1000;
  const activeCutoff = Date.parse('2026-11-26T21:00:10Z') / 1000;
  const archivedDeparture = Date.parse('2026-11-27T10:20:00Z') / 1000;
  const archivedCutoff = Date.parse('2026-11-25T15:45:00Z') / 1000;

  const setupLegacyRoute = (id: number, departure: number, cutoff: number, deleted: boolean) =>
    db('routes').where({ id }).update({
      schedule: null,
      departure_at: db.raw('FROM_UNIXTIME(?)', [departure]),
      order_acceptance_ends_at: db.raw('FROM_UNIXTIME(?)', [cutoff]),
      deleted_at: deleted ? new Date() : null,
    });

  let schemaNeedsUpgrade = false;
  try {
    await down(db);
    schemaNeedsUpgrade = true;
    const newRouteAnchors = await db('routes').where({ id: 2 }).first('departure_at', 'order_acceptance_ends_at');
    assert.ok(newRouteAnchors.departure_at);
    assert.ok(newRouteAnchors.order_acceptance_ends_at);
    await setupLegacyRoute(1, activeDeparture, activeCutoff, false);
    await setupLegacyRoute(3, archivedDeparture, archivedCutoff, true);
    await db('orders').where({ id: 2 }).update({ route_departure_unix: null, route_acceptance_ends_unix: null });
    await db('orders').where({ id: 3 }).update({ route_acceptance_ends_unix: null });

    await up(db);
    schemaNeedsUpgrade = false;

    const routes = await db('routes').select('id', 'schedule', 'deleted_at').orderBy('id');
    assert.deepEqual(routes.map((route) => readRouteSchedule(route.schedule)), [
      { weekdays: [5], departureTime: '00:00', orderAcceptanceEndsTime: '23:59', orderAcceptanceDaysBefore: 1 },
      originalWeekly,
      { weekdays: [5], departureTime: '13:20', orderAcceptanceEndsTime: '18:45', orderAcceptanceDaysBefore: 2 },
    ]);
    assert.ok(routes[2].deleted_at);

    const orders = await db('orders').select('id', 'route_departure_unix', 'route_acceptance_ends_unix').orderBy('id');
    assert.deepEqual(orders.map(({ id, route_departure_unix, route_acceptance_ends_unix }) =>
      [id, Number(route_departure_unix), Number(route_acceptance_ends_unix)]), [
      [1, Number(activeOrder.route_departure_unix), Number(activeOrder.route_acceptance_ends_unix)],
      [2, activeDeparture, activeCutoff],
      [3, Number(archivedOrder.route_departure_unix), archivedCutoff],
    ]);
    assert.deepEqual(await assignments(), oldAssignments);

    await db('routes').where({ id: 2 }).update({
      schedule: JSON.stringify({ ...originalWeekly, orderAcceptanceDaysBefore: 1 }),
    });
    await assert.rejects(down(db), /Cannot roll back route 2/);
    assert.deepEqual(readRouteSchedule((await db('routes').where({ id: 2 }).first('schedule')).schedule), {
      ...originalWeekly,
      orderAcceptanceDaysBefore: 1,
    });
    await db('routes').where({ id: 2 }).update({ schedule: JSON.stringify(originalWeekly) });

    await down(db);
    schemaNeedsUpgrade = true;
    const downgraded = await db('routes').select('schedule').orderBy('id');
    assert.equal(downgraded[0].schedule, null);
    assert.deepEqual(readRouteSchedule(downgraded[1].schedule), originalWeekly);
    assert.equal(downgraded[2].schedule, null);
  } finally {
    if (schemaNeedsUpgrade) await up(db);
  }
});
