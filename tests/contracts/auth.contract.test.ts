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

test('POST /api/auth/signup creates an unverified user and verification code', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'brand.new@cook.local',
        password: 'Password123!',
      }),
    });

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { ok: true, expiresInSeconds: 900 });

    const user = await db('users').where({ email: 'brand.new@cook.local' }).first();
    assert.ok(user);
    assert.equal(user.email_verified_at, null);

    const code = await db('auth_email_verification_codes')
      .where({ email: 'brand.new@cook.local' })
      .orderBy('id', 'desc')
      .first();
    assert.ok(code);
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/auth/signup/confirm verifies email and returns JWT', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    await db('users').insert({
      email: 'new.signup@cook.local',
      role: 'employee',
      company_id: null,
      password_hash: '$2a$10$gqcYbN4vYkR1A4X4dJVxBO9Ukr0lG/PbI1jW8C0z7v5SKl7R4T2uK',
      email_verified_at: null,
      full_name: 'New Signup',
      phone: null,
      avatar_url: null,
      created_at: '2026-03-15 09:00:00',
      updated_at: '2026-03-15 09:00:00',
      deleted_at: null,
    });

    const response = await fetch(`${baseUrl}/api/auth/signup/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'new.signup@cook.local', code: '222333' }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.user.email, 'new.signup@cook.local');

    const user = await db('users').where({ email: 'new.signup@cook.local' }).first();
    assert.ok(user.email_verified_at);
  } finally {
    await stopTestServer(server);
  }
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
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/auth/login/step2 returns JWT and marks email as verified', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    await db('users').where({ id: 4 }).update({ email_verified_at: null });

    const response = await fetch(`${baseUrl}/api/auth/login/step2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'employee.ivanov@cook.local', code: '123456' }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.user.email, 'employee.ivanov@cook.local');

    const user = await db('users').where({ id: 4 }).first();
    assert.ok(user.email_verified_at);
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/auth/login/password returns JWT and user DTO even if email is not verified', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    await db('users').where({ id: 4 }).update({ email_verified_at: null });

    const response = await fetch(`${baseUrl}/api/auth/login/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'employee.ivanov@cook.local', password: 'Password123!' }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.user.email, 'employee.ivanov@cook.local');
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
  } finally {
    await stopTestServer(server);
  }
});

test('PUT /api/auth/profile updates profile and uploads avatar for current user', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const token = generateToken({ id: 4, email: 'employee.ivanov@cook.local', role: 'employee', companyId: 1 });
    const formData = new FormData();
    formData.append('fullName', 'Иван Иванов');
    formData.append('avatar', new Blob(['fake-image-content'], { type: 'image/png' }), 'avatar.png');

    const response = await fetch(`${baseUrl}/api/auth/profile`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.fullName, 'Иван Иванов');
    assert.match(payload.avatarUrl, /^\/uploads\/avatars\/.+\.png$/);

    const user = await db('users').where({ id: 4 }).first();
    assert.match(user.avatar_url, /^\/uploads\/avatars\/.+\.png$/);
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
  } finally {
    await stopTestServer(server);
  }
});
