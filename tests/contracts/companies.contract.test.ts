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

const freeEmployeeToken = () =>
  generateToken({ id: 7, email: 'employee.sever@cook.local', role: 'employee', companyId: null });

test.beforeEach(async () => {
  await seed(db);
  await db('users').where({ id: 7 }).update({ company_id: null, updated_at: '2026-03-15 09:00:00' });
});

test('GET /api/companies returns all visible companies for an authenticated user', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const adminResponse = await fetch(`${baseUrl}/api/companies`, {
      headers: { Authorization: `Bearer ${adminToken()}` },
    });
    const managerResponse = await fetch(`${baseUrl}/api/companies`, {
      headers: { Authorization: `Bearer ${managerToken()}` },
    });
    const employeeResponse = await fetch(`${baseUrl}/api/companies`, {
      headers: { Authorization: `Bearer ${employeeToken()}` },
    });

    assert.equal(adminResponse.status, 200);
    assert.equal(managerResponse.status, 200);
    assert.equal(employeeResponse.status, 403);

    const adminPayload = await adminResponse.json();
    const managerPayload = await managerResponse.json();

    assert.equal(adminPayload.length, 3);
    assert.equal(managerPayload.length, 1);
    assert.equal(managerPayload[0].id, 1);
  } finally {
    await stopTestServer(server);
  }
});

test('GET /api/companies/:id returns a single company by id', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/companies/1`, {
      headers: { Authorization: `Bearer ${managerToken()}` },
    });
    const forbiddenResponse = await fetch(`${baseUrl}/api/companies/1`, {
      headers: { Authorization: `Bearer ${employeeToken()}` },
    });

    assert.equal(response.status, 200);
    assert.equal(forbiddenResponse.status, 403);
    const payload = await response.json();
    assert.equal(payload.name, 'Romashka LLC');
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/companies creates a company for admin role', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/companies`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Orbit LLC',
        description: 'New customer',
        address: 'Moscow, Tverskaya 1',
      }),
    });

    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.name, 'Orbit LLC');
  } finally {
    await stopTestServer(server);
  }
});

test('PUT /api/companies/:id updates company fields for admin or manager', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/companies/1`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${managerToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        description: 'Updated by company manager',
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.description, 'Updated by company manager');
  } finally {
    await stopTestServer(server);
  }
});

test('DELETE /api/companies/:id removes or archives a company for admin role', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/companies/3`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken()}` },
    });

    assert.equal(response.status, 204);

    const company = await db('companies').where({ id: 3 }).first();
    assert.ok(company.deleted_at);
  } finally {
    await stopTestServer(server);
  }
});

test('GET /api/companies/:id/users returns company users for admin or manager', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/companies/1/users`, {
      headers: { Authorization: `Bearer ${managerToken()}` },
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(
      payload.map((item: { email: string }) => item.email),
      ['manager.romashka@cook.local', 'employee.ivanov@cook.local', 'employee.sidorova@cook.local']
    );
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/companies/:id/users assigns a user to a company', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/companies/1/users`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: 'employee.sever@cook.local' }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.companyId, 1);

    const user = await db('users').where({ id: 7 }).first();
    assert.equal(user.company_id, 1);
  } finally {
    await stopTestServer(server);
  }
});

test('DELETE /api/companies/:id/users/:userId clears company assignment for a user', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/companies/1/users/5`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${managerToken()}` },
    });

    assert.equal(response.status, 204);

    const user = await db('users').where({ id: 5 }).first();
    assert.equal(user.company_id, null);
  } finally {
    await stopTestServer(server);
  }
});

test('GET /api/companies/:id/manager returns the assigned manager or null', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/companies/1/manager`, {
      headers: { Authorization: `Bearer ${managerToken()}` },
    });
    const forbiddenResponse = await fetch(`${baseUrl}/api/companies/1/manager`, {
      headers: { Authorization: `Bearer ${employeeToken()}` },
    });

    assert.equal(response.status, 200);
    assert.equal(forbiddenResponse.status, 403);
    const payload = await response.json();
    assert.equal(payload.email, 'manager.romashka@cook.local');
  } finally {
    await stopTestServer(server);
  }
});

test('PUT /api/companies/:id/manager assigns the company manager', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/companies/3/manager`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${adminToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId: 7 }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.role, 'manager');
    assert.equal(payload.companyId, 3);

    const managerRow = await db('company_managers').where({ company_id: 3 }).first();
    assert.equal(managerRow.user_id, 7);
  } finally {
    await stopTestServer(server);
  }
});

test('PUT /api/companies/:id/manager lets current manager transfer role to an employee of the same company', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/companies/1/manager`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${managerToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId: 5 }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.id, 5);
    assert.equal(payload.role, 'manager');

    const previousManager = await db('users').where({ id: 2 }).first();
    const nextManager = await db('users').where({ id: 5 }).first();
    const managerRow = await db('company_managers').where({ company_id: 1 }).first();

    assert.equal(previousManager.role, 'employee');
    assert.equal(nextManager.role, 'manager');
    assert.equal(managerRow.user_id, 5);
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/companies/:id/subscription purchases or extends company subscription for one month', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/companies/1/subscription`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${managerToken()}` },
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.hasActiveSubscription, true);
    assert.ok(payload.subscriptionStartedAt);
    assert.ok(payload.subscriptionExpiresAt);

    const company = await db('companies').where({ id: 1 }).first();
    assert.ok(company.subscription_started_at);
    assert.ok(company.subscription_expires_at);
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/companies/:id/join-code creates a short join code for the manager company', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/companies/1/join-code`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${managerToken()}` },
    });

    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(typeof payload.code, 'string');
    assert.equal(payload.code.length, 6);
    assert.equal(payload.expiresInSeconds, 900);
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/companies/join lets a regular user join company with a short code', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    await db('users').where({ id: 7 }).update({
      company_id: null,
      role: 'employee',
      updated_at: '2026-03-15 09:00:00',
    });

    const joinCodeResponse = await fetch(`${baseUrl}/api/companies/1/join-code`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${managerToken()}` },
    });
    const joinCodePayload = await joinCodeResponse.json();

    const response = await fetch(`${baseUrl}/api/companies/join`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${freeEmployeeToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code: joinCodePayload.code }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.companyId, 1);

    const user = await db('users').where({ id: 7 }).first();
    assert.equal(user.company_id, 1);

    const code = await db('company_join_codes').where({ code: joinCodePayload.code }).first();
    assert.equal(code.consumed_by_user_id, 7);
    assert.ok(code.consumed_at);
  } finally {
    await stopTestServer(server);
  }
});
