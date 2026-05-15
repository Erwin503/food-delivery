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
        fullName: 'Brand New',
        password: 'Password123!',
      }),
    });

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { ok: true, expiresInSeconds: 900 });

    const user = await db('users').where({ email: 'brand.new@cook.local' }).first();
    assert.ok(user);
    assert.equal(user.email_verified_at, null);
    assert.equal(user.full_name, 'Brand New');

    const code = await db('auth_email_verification_codes')
      .where({ email: 'brand.new@cook.local' })
      .orderBy('id', 'desc')
      .first();
    assert.ok(code);
    assert.equal(String(code.code).length, 4);
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/auth/signup updates an existing unverified user and issues a fresh verification code', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const firstResponse = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'retry.signup@cook.local',
        fullName: 'First Name',
        password: 'Password123!',
      }),
    });

    assert.equal(firstResponse.status, 201);

    const userBeforeRetry = await db('users').where({ email: 'retry.signup@cook.local' }).first();
    const firstCode = await db('auth_email_verification_codes')
      .where({ email: 'retry.signup@cook.local' })
      .orderBy('id', 'desc')
      .first();

    assert.ok(userBeforeRetry);
    assert.ok(firstCode);

    const secondResponse = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'retry.signup@cook.local',
        fullName: 'Second Name',
        password: 'NewPassword123!',
      }),
    });

    assert.equal(secondResponse.status, 201);

    const users = await db('users').where({ email: 'retry.signup@cook.local' });
    const userAfterRetry = users[0];
    const secondCode = await db('auth_email_verification_codes')
      .where({ email: 'retry.signup@cook.local' })
      .orderBy('id', 'desc')
      .first();

    assert.equal(users.length, 1);
    assert.equal(userAfterRetry.full_name, 'Second Name');
    assert.notEqual(userAfterRetry.password_hash, userBeforeRetry.password_hash);
    assert.notEqual(secondCode.id, firstCode.id);
    assert.equal(String(secondCode.code).length, 4);
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/auth/signup/confirm verifies the code created during password signup and returns JWT', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const signupResponse = await fetch(`${baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'new.signup.confirm@cook.local',
        fullName: 'Confirm User',
        password: 'Password123!',
      }),
    });
    assert.equal(signupResponse.status, 201);

    const verificationCode = await db('auth_email_verification_codes')
      .where({ email: 'new.signup.confirm@cook.local' })
      .orderBy('id', 'desc')
      .first();
    assert.ok(verificationCode);
    assert.equal(String(verificationCode.code).length, 4);

    const response = await fetch(`${baseUrl}/api/auth/signup/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'new.signup.confirm@cook.local',
        code: String(verificationCode.code),
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.user.email, 'new.signup.confirm@cook.local');

    const user = await db('users').where({ email: 'new.signup.confirm@cook.local' }).first();
    assert.ok(user.email_verified_at);
    assert.equal(user.full_name, 'Confirm User');
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/auth/login/step1 sends a one-time email code only for a verified user', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/auth/login/step1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'employee.ivanov@cook.local' }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, expiresInSeconds: 300 });

    const codeRow = await db('auth_login_codes').where({ email: 'employee.ivanov@cook.local' }).orderBy('id', 'desc').first();
    assert.ok(codeRow);
    assert.equal(String(codeRow.code).length, 4);
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/auth/login/step1 rejects unknown email', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/auth/login/step1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'missing.user@cook.local' }),
    });

    assert.equal(response.status, 404);
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/auth/login/step1 rejects unverified user', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    await db('users').where({ id: 4 }).update({ email_verified_at: null });

    const response = await fetch(`${baseUrl}/api/auth/login/step1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'employee.ivanov@cook.local' }),
    });

    assert.equal(response.status, 403);
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/auth/login/step2 returns JWT for a verified user with a valid code', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/auth/login/step2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'employee.ivanov@cook.local', code: '1234' }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.user.email, 'employee.ivanov@cook.local');
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/auth/login/step2 rejects unverified user even with a valid code', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    await db('users').where({ id: 4 }).update({ email_verified_at: null });

    const response = await fetch(`${baseUrl}/api/auth/login/step2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'employee.ivanov@cook.local', code: '1234' }),
    });

    assert.equal(response.status, 403);
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/auth/login/password rejects unverified user', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    await db('users').where({ id: 4 }).update({ email_verified_at: null });

    const response = await fetch(`${baseUrl}/api/auth/login/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'employee.ivanov@cook.local', password: 'Password123!' }),
    });

    assert.equal(response.status, 403);
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
      body: JSON.stringify({ email: 'employee.ivanov@cook.local', code: '1112', newPassword: 'Recovered123!' }),
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
