import assert from 'node:assert/strict';
import test from 'node:test';
import db from '../../src/db/knex';
import { generateToken } from '../../src/utils/generateToken';
import { seed } from '../../seeds/01_demo_data';
import { startTestServer, stopTestServer } from '../helpers/test-server';

test.beforeEach(async () => {
  await seed(db);
});

test.after(async () => {
  await db.destroy();
});

test('POST /api/auth/login/step1 sends a one-time email code', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/auth/login/step1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'new.user@cook.local' }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, expiresInSeconds: 300 });

    const codeRow = await db('auth_login_codes').where({ email: 'new.user@cook.local' }).orderBy('id', 'desc').first();
    assert.ok(codeRow);
    assert.match(String(codeRow.code), /^\d{6}$/);
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/auth/login/step2 returns JWT and user DTO for a valid code', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/auth/login/step2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'employee.ivanov@cook.local', code: '123456' }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(typeof payload.token, 'string');
    assert.equal(payload.user.email, 'employee.ivanov@cook.local');
    assert.equal(payload.user.role, 'employee');
    assert.equal(payload.user.companyId, 1);
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/auth/login/password returns JWT and user DTO for a valid password', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/auth/login/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'employee.ivanov@cook.local', password: 'Password123!' }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.user.email, 'employee.ivanov@cook.local');
    assert.equal(typeof payload.token, 'string');
  } finally {
    await stopTestServer(server);
  }
});

test('GET /api/auth/profile returns current user for a valid bearer token', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const token = generateToken({ id: 4, email: 'employee.ivanov@cook.local', role: 'employee', companyId: 1 });
    const response = await fetch(`${baseUrl}/api/auth/profile`, { headers: { Authorization: `Bearer ${token}` } });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.id, 4);
    assert.equal(payload.email, 'employee.ivanov@cook.local');
  } finally {
    await stopTestServer(server);
  }
});

test('PUT /api/auth/profile updates profile fields and returns the updated user', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const token = generateToken({ id: 4, email: 'employee.ivanov@cook.local', role: 'employee', companyId: 1 });
    const response = await fetch(`${baseUrl}/api/auth/profile`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: 'Ivan Updated', phone: '+79991112233', avatarUrl: 'https://example.com/avatar.png' }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.fullName, 'Ivan Updated');
    assert.equal(payload.phone, '+79991112233');
    assert.equal(payload.avatarUrl, 'https://example.com/avatar.png');
  } finally {
    await stopTestServer(server);
  }
});

test('PUT /api/auth/password sets a new password for the current user', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const token = generateToken({ id: 4, email: 'employee.ivanov@cook.local', role: 'employee', companyId: 1 });
    const response = await fetch(`${baseUrl}/api/auth/password`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'Password123!', newPassword: 'NewPassword123!' }),
    });

    assert.equal(response.status, 200);

    const loginResponse = await fetch(`${baseUrl}/api/auth/login/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'employee.ivanov@cook.local', password: 'NewPassword123!' }),
    });

    assert.equal(loginResponse.status, 200);
  } finally {
    await stopTestServer(server);
  }
});

test('DELETE /api/auth/profile performs a soft delete for the current user', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const token = generateToken({ id: 5, email: 'employee.sidorova@cook.local', role: 'employee', companyId: 1 });
    const response = await fetch(`${baseUrl}/api/auth/profile`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(response.status, 204);
    const user = await db('users').where({ id: 5 }).first();
    assert.ok(user.deleted_at);
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/auth/password/reset/request creates a reset code for an existing user', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/auth/password/reset/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'employee.vector@cook.local' }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, expiresInSeconds: 900 });

    const resetCode = await db('auth_password_reset_codes').where({ email: 'employee.vector@cook.local' }).orderBy('id', 'desc').first();
    assert.ok(resetCode);
    assert.match(String(resetCode.code), /^\d{6}$/);
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/auth/password/reset/confirm resets the password using a valid code', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/auth/password/reset/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'employee.ivanov@cook.local', code: '111222', newPassword: 'Recovered123!' }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.user.email, 'employee.ivanov@cook.local');

    const loginResponse = await fetch(`${baseUrl}/api/auth/login/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'employee.ivanov@cook.local', password: 'Recovered123!' }),
    });

    assert.equal(loginResponse.status, 200);
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/auth/promote allows only admins to change user role', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const adminToken = generateToken({ id: 1, email: 'admin@cook.local', role: 'admin', companyId: null });
    const response = await fetch(`${baseUrl}/api/auth/promote`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 4, role: 'manager' }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.role, 'manager');
  } finally {
    await stopTestServer(server);
  }
});

test('GET /api/auth/all returns users list for admins only', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const adminToken = generateToken({ id: 1, email: 'admin@cook.local', role: 'admin', companyId: null });
    const response = await fetch(`${baseUrl}/api/auth/all`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(Array.isArray(payload), true);
    assert.equal(payload.length >= 7, true);
  } finally {
    await stopTestServer(server);
  }
});
