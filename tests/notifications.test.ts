import assert from 'node:assert/strict';
import test from 'node:test';
import db from '../src/db/knex';
import {
  REMINDER_BODY,
  REMINDER_TITLE,
  loadDailyOrderReminderRecipients,
} from '../src/services/orderReminderScheduler';
import { generateSessionEmailHtml } from '../src/utils/mailService';
import { lockAndSeedDb, releaseDbTestLock } from './helpers/db-test-lock';

test('daily order reminder uses readable Russian copy', () => {
  assert.equal(REMINDER_TITLE, '\u041d\u0430\u043f\u043e\u043c\u0438\u043d\u0430\u043d\u0438\u0435 \u043e \u0437\u0430\u043a\u0430\u0437\u0435');
  assert.equal(
    REMINDER_BODY,
    '\u0421\u043a\u043e\u0440\u043e \u0431\u0443\u0434\u0435\u0442 \u0441\u0444\u043e\u0440\u043c\u0438\u0440\u043e\u0432\u0430\u043d \u0437\u0430\u043a\u0430\u0437. \u0415\u0441\u043b\u0438 \u0445\u043e\u0442\u0438\u0442\u0435 \u0447\u0442\u043e-\u0442\u043e \u0434\u043e\u0431\u0430\u0432\u0438\u0442\u044c, \u043f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 \u043a\u043e\u0440\u0437\u0438\u043d\u0443 \u0437\u0430\u0440\u0430\u043d\u0435\u0435.'
  );
});

test('session email template uses readable Russian copy', () => {
  const html = generateSessionEmailHtml(
    '\u0418\u0432\u0430\u043d \u0418\u0432\u0430\u043d\u043e\u0432',
    '2026-06-02',
    '09:00',
    '10:00',
    '\u0426\u0435\u043d\u0442\u0440\u0430\u043b\u044c\u043d\u044b\u0439 \u0440\u0430\u0439\u043e\u043d',
    'data:image/png;base64,abc'
  );

  assert.match(html, /\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u0435 \u0432\u0430\u0448\u0435\u0439 \u0437\u0430\u043f\u0438\u0441\u0438/);
  assert.match(html, /\u0417\u0434\u0440\u0430\u0432\u0441\u0442\u0432\u0443\u0439\u0442\u0435, <strong>\u0418\u0432\u0430\u043d \u0418\u0432\u0430\u043d\u043e\u0432<\/strong>!/);
  assert.match(html, /\u0412\u044b \u0437\u0430\u043f\u0438\u0441\u0430\u043d\u044b \u043d\u0430 \u043f\u0440\u0438\u0451\u043c/);
  assert.match(html, /\u0414\u0430\u0442\u0430:/);
  assert.match(html, /\u0412\u0440\u0435\u043c\u044f:/);
  assert.match(html, /\u041c\u0435\u0441\u0442\u043e:/);
  assert.match(html, /\u041f\u0440\u0435\u0434\u044a\u044f\u0432\u0438\u0442\u0435 \u044d\u0442\u043e\u0442 QR-\u043a\u043e\u0434 \u043f\u0440\u0438 \u0432\u0438\u0437\u0438\u0442\u0435/);
  assert.doesNotMatch(html, /\u0420[\u045f\u045c\u040e\u201d\u2019\u045a\u2022\u00ad]/);
});
test('daily order reminder loads one Firebase recipient per user deviceId', async () => {
  await lockAndSeedDb(db);

  try {
    const now = new Date();
    await db('auth_sessions').insert([
      {
        user_id: 4,
        device_id: 'device-a',
        firebase_token: 'token-a',
        created_at: now,
        updated_at: now,
      },
      {
        user_id: 4,
        device_id: 'device-b',
        firebase_token: 'token-b',
        created_at: now,
        updated_at: now,
      },
      {
        user_id: 4,
        device_id: null,
        firebase_token: 'legacy-token-without-device',
        created_at: now,
        updated_at: now,
      },
      {
        user_id: 1,
        device_id: 'admin-device',
        firebase_token: 'admin-token',
        created_at: now,
        updated_at: now,
      },
    ]);

    const recipients = await loadDailyOrderReminderRecipients();

    assert.deepEqual(
      recipients.map((recipient) => recipient.firebase_token).sort(),
      ['token-a', 'token-b']
    );
    assert.deepEqual(
      recipients.map((recipient) => recipient.device_id).sort(),
      ['device-a', 'device-b']
    );
  } finally {
    releaseDbTestLock();
  }
});
