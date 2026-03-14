import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, stopTestServer } from './helpers/test-server';

test('GET /api-docs responds with redirect or success', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api-docs`, {
      redirect: 'manual',
    });

    assert.ok(response.status === 200 || response.status === 301 || response.status === 302);
  } finally {
    await stopTestServer(server);
  }
});

test('GET /api/unknown returns 404 for an unmapped route', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/unknown`);
    assert.equal(response.status, 404);
  } finally {
    await stopTestServer(server);
  }
});
