import assert from 'node:assert/strict';
import test from 'node:test';
import db from '../../src/db/knex';
import { seed } from '../../seeds/01_demo_data';
import { generateToken } from '../../src/utils/generateToken';
import { extractPdfText, findZipEntries, normalizePdfText } from '../helpers/report-file-utils';
import { startTestServer, stopTestServer } from '../helpers/test-server';

const adminToken = () =>
  generateToken({ id: 1, email: 'admin@cook.local', role: 'admin', companyId: null });

const managerToken = () =>
  generateToken({ id: 2, email: 'manager.romashka@cook.local', role: 'manager', companyId: 1 });

const assertPdfResponse = async (response: Response): Promise<Buffer> => {
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/pdf');

  const body = Buffer.from(await response.arrayBuffer());
  assert.equal(body.subarray(0, 4).toString('ascii'), '%PDF');

  return body;
};

const setRoutesToToday = async () => {
  const now = new Date();

  const route1Departure = new Date(now);
  route1Departure.setHours(10, 0, 0, 0);
  const route1Cutoff = new Date(route1Departure.getTime() - 2 * 60 * 60 * 1000);

  const route2Departure = new Date(now);
  route2Departure.setHours(13, 0, 0, 0);
  const route2Cutoff = new Date(route2Departure.getTime() - 2 * 60 * 60 * 1000);

  const route3Departure = new Date(now);
  route3Departure.setDate(route3Departure.getDate() - 1);
  route3Departure.setHours(13, 0, 0, 0);
  const route3Cutoff = new Date(route3Departure.getTime() - 2 * 60 * 60 * 1000);

  await db('routes').where({ id: 1 }).update({
    departure_at: route1Departure,
    order_acceptance_ends_at: route1Cutoff,
  });
  await db('routes').where({ id: 2 }).update({
    departure_at: route2Departure,
    order_acceptance_ends_at: route2Cutoff,
  });
  await db('routes').where({ id: 3 }).update({
    departure_at: route3Departure,
    order_acceptance_ends_at: route3Cutoff,
  });
};

test.beforeEach(async () => {
  await seed(db);
  await setRoutesToToday();
});

test('GET /api/reports/orders/today.pdf возвращает PDF с заказами на сегодня для администратора', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/reports/orders/today.pdf`, {
      headers: { Authorization: `Bearer ${adminToken()}` },
    });

    const pdfBuffer = await assertPdfResponse(response);
    const body = normalizePdfText(extractPdfText(pdfBuffer));

    assert.match(body, /Зак/);
    assert.match(body, /сегод/);
  } finally {
    await stopTestServer(server);
  }
});

test('GET /api/reports/dishes/today.pdf возвращает PDF со списком блюд на сегодня для администратора', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/reports/dishes/today.pdf`, {
      headers: { Authorization: `Bearer ${adminToken()}` },
    });

    const pdfBuffer = await assertPdfResponse(response);
    const body = normalizePdfText(extractPdfText(pdfBuffer));

    assert.match(body, /Список/);
    assert.match(body, /блюд/);
  } finally {
    await stopTestServer(server);
  }
});

test('GET /api/reports/labels/today.pdf возвращает PDF с наклейками по отдельным заказам', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/reports/labels/today.pdf`, {
      headers: { Authorization: `Bearer ${adminToken()}` },
    });

    const pdfBuffer = await assertPdfResponse(response);
    const body = normalizePdfText(extractPdfText(pdfBuffer));

    assert.match(body, /Наклей/);
  } finally {
    await stopTestServer(server);
  }
});

test('эндпоинты отчётов запрещены для не-администраторов', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/reports/orders/today.pdf`, {
      headers: { Authorization: `Bearer ${managerToken()}` },
    });

    assert.equal(response.status, 403);
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/reports/test-run/today создаёт временные заказы, возвращает zip с PDF и очищает данные', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/reports/test-run/today`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken()}` },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/zip');

    const zipBuffer = Buffer.from(await response.arrayBuffer());
    const entries = findZipEntries(zipBuffer);

    assert.deepEqual(
      entries.map((entry) => entry.filename).sort(),
      ['dishes-today.pdf', 'labels-today.pdf', 'orders-today.pdf']
    );

    for (const entry of entries) {
      assert.equal(entry.content.subarray(0, 4).toString('ascii'), '%PDF');
    }

    const labelsPdf = entries.find((entry) => entry.filename === 'labels-today.pdf');
    assert.ok(labelsPdf);

    const labelsBody = normalizePdfText(extractPdfText(labelsPdf.content));
    assert.match(labelsBody, /Наклей/);

    const leftoverOrders = await db('orders').where('order_number', 'like', 'TEST-RPT-%');
    const leftoverRoutes = await db('routes').where('name', 'like', 'Тестовый рейс отчётов TEST-RPT-%');

    assert.equal(leftoverOrders.length, 0);
    assert.equal(leftoverRoutes.length, 0);
  } finally {
    await stopTestServer(server);
  }
});
