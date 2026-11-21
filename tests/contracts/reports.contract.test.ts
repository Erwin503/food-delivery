import assert from 'node:assert/strict';
import test from 'node:test';
import db from '../../src/db/knex';
import { lockAndSeedDb, releaseDbTestLock } from '../helpers/db-test-lock';
import { BUSINESS_TIME_ZONE, BusinessDay, getBusinessDay } from '../../src/utils/businessTime';
import { generateToken } from '../../src/utils/generateToken';
import { extractPdfText, findZipEntries, normalizePdfText } from '../helpers/report-file-utils';
import { startTestServer, stopTestServer } from '../helpers/test-server';

const serialTest = (name: string, fn: (t: unknown) => Promise<void> | void) =>
  test(name, { concurrency: false }, fn);

const adminToken = () =>
  generateToken({ id: 1, email: 'admin@cook.local', role: 'admin', companyId: null });

const managerToken = () =>
  generateToken({ id: 2, email: 'manager.romashka@cook.local', role: 'manager', companyId: 1 });

const assertPdfResponse = async (response: Response): Promise<Buffer> => {
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/pdf');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.match(response.headers.get('x-report-day') ?? '', /^\d{4}-\d{2}-\d{2}$/);
  assert.match(response.headers.get('x-report-valid-for-ms') ?? '', /^\d+$/);
  assert.match(response.headers.get('access-control-expose-headers') ?? '', /X-Report-Day.*X-Report-Valid-For-Ms/i);

  const body = Buffer.from(await response.arrayBuffer());
  assert.equal(body.subarray(0, 4).toString('ascii'), '%PDF');

  return body;
};

const setRoutesToToday = async () => {
  const today = getBusinessDay();
  const yesterday = getBusinessDay(new Date(today.start.getTime() - 1));
  const routeTimes = (day: BusinessDay, hours: number) => ({
    departure_at: db.raw('FROM_UNIXTIME(?)', [day.start.getTime() / 1000 + hours * 3600]),
    order_acceptance_ends_at: db.raw('FROM_UNIXTIME(?)', [day.start.getTime() / 1000 + (hours - 2) * 3600]),
  });

  await db('routes').where({ id: 1 }).update(routeTimes(today, 10));
  await db('routes').where({ id: 2 }).update(routeTimes(today, 13));
  await db('routes').where({ id: 3 }).update(routeTimes(yesterday, 13));
};

test.beforeEach(async () => {
  await lockAndSeedDb(db);
  await setRoutesToToday();
});

test.afterEach(() => {
  releaseDbTestLock();
});

serialTest('GET /api/reports/orders/today.pdf возвращает PDF с заказами на сегодня для администратора', async () => {
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

serialTest('GET /api/reports/dishes/today.pdf возвращает PDF со списком блюд на сегодня для администратора', async () => {
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

serialTest('GET /api/reports/labels/today.pdf возвращает PDF с наклейками по отдельным заказам', async () => {
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

test('Дневной отчёт сохраняет дату выборки при переходе через московскую полночь', {
  concurrency: false,
  skip: BUSINESS_TIME_ZONE !== 'Europe/Moscow',
}, async () => {
  const { server, baseUrl } = await startTestServer();
  const originalNow = Date.now;
  const previousDay = '2026-11-20';
  const nextDay = '2026-11-21';
  const previousStart = Date.parse('2026-11-19T21:00:00Z');
  const midnight = Date.parse('2026-11-20T21:00:00Z');
  const nextEnd = Date.parse('2026-11-21T21:00:00Z');
  let now = midnight - 1;
  const ranges: number[][] = [];
  const moveClockDuringQuery = ({ sql, bindings }: { sql: string; bindings: number[] }) => {
    if (sql.includes('`orders` as `o`') && sql.includes('`r`.`departure_at`')) {
      ranges.push(bindings.map((seconds) => seconds * 1000));
      now = midnight;
    }
  };

  try {
    Date.now = () => now;
    const headers = { Authorization: `Bearer ${adminToken()}` };
    const reportUrl = `${baseUrl}/api/reports/orders/today.pdf`;
    const before = await fetch(reportUrl, { headers });
    await assertPdfResponse(before);
    assert.equal(before.headers.get('x-report-day'), previousDay);
    assert.equal(before.headers.get('x-report-valid-for-ms'), '1');

    db.on('query', moveClockDuringQuery);
    const crossing = await fetch(reportUrl, { headers });
    await assertPdfResponse(crossing);
    assert.equal(crossing.headers.get('x-report-day'), previousDay);
    assert.equal(crossing.headers.get('x-report-valid-for-ms'), '0');

    const after = await fetch(reportUrl, { headers });
    await assertPdfResponse(after);
    assert.equal(after.headers.get('x-report-day'), nextDay);
    assert.ok(Number(after.headers.get('x-report-valid-for-ms')) > 0);
    assert.deepEqual(ranges, [
      [previousStart, midnight],
      [midnight, nextEnd],
    ]);
  } finally {
    db.off('query', moveClockDuringQuery);
    Date.now = originalNow;
    await stopTestServer(server);
  }
});

serialTest('Бизнес-день учитывает перевод часов и пропущенную полночь', () => {
  const spring = getBusinessDay(new Date('2026-03-08T12:00:00Z'), 'America/New_York');
  assert.equal(spring.start.toISOString(), '2026-03-08T05:00:00.000Z');
  assert.equal(spring.end.toISOString(), '2026-03-09T04:00:00.000Z');

  const autumn = getBusinessDay(new Date('2026-11-01T12:00:00Z'), 'America/New_York');
  assert.equal(autumn.start.toISOString(), '2026-11-01T04:00:00.000Z');
  assert.equal(autumn.end.toISOString(), '2026-11-02T05:00:00.000Z');

  const skippedMidnight = getBusinessDay(new Date('2018-11-04T12:00:00Z'), 'America/Sao_Paulo');
  assert.equal(skippedMidnight.day, '2018-11-04');
  assert.equal(skippedMidnight.start.toISOString(), '2018-11-04T03:00:00.000Z');
  assert.equal(skippedMidnight.end.toISOString(), '2018-11-05T02:00:00.000Z');
});

serialTest('эндпоинты отчётов запрещены для не-администраторов', async () => {
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

serialTest('POST /api/reports/test-run/today создаёт временные заказы, возвращает zip с PDF и очищает данные', async () => {
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
