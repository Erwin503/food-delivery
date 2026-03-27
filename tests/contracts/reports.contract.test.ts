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

test('GET /api/reports/orders/today.pdf возвращает PDF с таблицей заказов на сегодня для администратора', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/reports/orders/today.pdf`, {
      headers: { Authorization: `Bearer ${adminToken()}` },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/pdf');

    const body = normalizePdfText(extractPdfText(Buffer.from(await response.arrayBuffer())));
    assert.match(body, /Заказынасегодня/);
    assert.match(body, /ОООРомашка/);
    assert.match(body, /АОВектор/);
    assert.match(body, /Сотрудник/);
    assert.match(body, /Сумма/);
    assert.match(body, /20260315-000001/);
  } finally {
    await stopTestServer(server);
  }
});

test('GET /api/reports/dishes/today.pdf возвращает PDF со сводной таблицей блюд на сегодня для администратора', async () => {
  const { server, baseUrl } = await startTestServer();

  try {
    const response = await fetch(`${baseUrl}/api/reports/dishes/today.pdf`, {
      headers: { Authorization: `Bearer ${adminToken()}` },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/pdf');

    const body = normalizePdfText(extractPdfText(Buffer.from(await response.arrayBuffer())));
    assert.match(body, /Списокблюднасегодня/);
    assert.match(body, /Блюдо/);
    assert.match(body, /Количество/);
    assert.match(body, /Пепперони/);
    assert.match(body, /Клюквенныйморс/);
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

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/pdf');

    const body = normalizePdfText(extractPdfText(Buffer.from(await response.arrayBuffer())));
    assert.match(body, /Наклейкиназаказы/);
    assert.match(body, /Состав/);
    assert.match(body, /ИванИванов/);
    assert.match(body, /ОООРомашка/);
    assert.match(body, /Маргаритаx2/);
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

    const labelsPdf = entries.find((entry) => entry.filename === 'labels-today.pdf');
    assert.ok(labelsPdf);

    const labelsBody = normalizePdfText(extractPdfText(labelsPdf.content));
    assert.match(labelsBody, /Наклейкиназаказы/);

    const leftoverOrders = await db('orders').where('order_number', 'like', 'TEST-RPT-%');
    const leftoverRoutes = await db('routes').where('name', 'like', 'Тестовый рейс отчётов TEST-RPT-%');

    assert.equal(leftoverOrders.length, 0);
    assert.equal(leftoverRoutes.length, 0);
  } finally {
    await stopTestServer(server);
  }
});
