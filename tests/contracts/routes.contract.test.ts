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

test.beforeEach(async () => {
  await seed(db);
});

test('GET /api/routes returns routes filtered by date range', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const route = await db('routes').where({ id: 2 }).first();
    const response = await fetch(`${baseUrl}/api/routes?dateFrom=${encodeURIComponent(route.departure_at)}`, {
      headers: { Authorization: `Bearer ${adminToken()}` },
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.some((item: { id: number }) => item.id === 2), true);
  } finally {
    await stopTestServer(server);
  }
});

test('GET /api/routes/:id returns one route with its details', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/routes/2`, {
      headers: { Authorization: `Bearer ${adminToken()}` },
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.id, 2);
    assert.equal(payload.companies.length, 1);
    assert.equal(payload.companies[0].id, 1);
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/routes creates a route for admin', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const departureAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const orderAcceptanceEndsAt = new Date(Date.now() + 46 * 60 * 60 * 1000).toISOString();

    const response = await fetch(`${baseUrl}/api/routes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Evening route',
        departureAt,
        orderAcceptanceEndsAt,
        description: 'Evening deliveries',
        companyIds: [1, 2],
      }),
    });

    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.name, 'Evening route');
    assert.equal(payload.companies.length, 2);
  } finally {
    await stopTestServer(server);
  }
});

test('PUT /api/routes/:id updates route fields', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const departureAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    const orderAcceptanceEndsAt = new Date(Date.now() + 70 * 60 * 60 * 1000).toISOString();

    const response = await fetch(`${baseUrl}/api/routes/2`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${adminToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Updated day route',
        departureAt,
        orderAcceptanceEndsAt,
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
  } finally {
    await stopTestServer(server);
  }
});

test('DELETE /api/routes/:id deletes or archives a route', async () => {
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

test('GET /api/routes/:id/companies returns companies assigned to a route', async () => {
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

test('POST /api/routes/:id/companies assigns a company to a route', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
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
  } finally {
    await stopTestServer(server);
  }
});

test('DELETE /api/routes/:id/companies/:companyId removes a company from a route', async () => {
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

test('routes endpoints are forbidden for non-admin users', async () => {
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
