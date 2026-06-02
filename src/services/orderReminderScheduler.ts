import cron from 'node-cron';
import db from '../db/knex';
import { isFirebaseConfigured, sendPushNotification } from '../utils/firebaseService';
import logger from '../utils/logger';

const REMINDER_CRON = process.env.ORDER_REMINDER_CRON?.trim() || '0 9 * * *';
const REMINDER_TIMEZONE = process.env.ORDER_REMINDER_TIMEZONE?.trim() || 'Europe/Moscow';

export const REMINDER_TITLE = '\u041d\u0430\u043f\u043e\u043c\u0438\u043d\u0430\u043d\u0438\u0435 \u043e \u0437\u0430\u043a\u0430\u0437\u0435';
export const REMINDER_BODY = '\u0421\u043a\u043e\u0440\u043e \u0431\u0443\u0434\u0435\u0442 \u0441\u0444\u043e\u0440\u043c\u0438\u0440\u043e\u0432\u0430\u043d \u0437\u0430\u043a\u0430\u0437. \u0415\u0441\u043b\u0438 \u0445\u043e\u0442\u0438\u0442\u0435 \u0447\u0442\u043e-\u0442\u043e \u0434\u043e\u0431\u0430\u0432\u0438\u0442\u044c, \u043f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 \u043a\u043e\u0440\u0437\u0438\u043d\u0443 \u0437\u0430\u0440\u0430\u043d\u0435\u0435.';

export const sendDailyOrderReminder = async (): Promise<void> => {
  if (!isFirebaseConfigured()) {
    logger.warn('Order reminder skipped because Firebase is not configured.');
    return;
  }

  const users = await db('users')
    .select('id', 'firebase_token')
    .whereIn('role', ['employee', 'manager'])
    .whereNotNull('email_verified_at')
    .whereNull('deleted_at')
    .whereNotNull('firebase_token');

  const tokens = users
    .map((user) => String(user.firebase_token || '').trim())
    .filter(Boolean);

  if (!tokens.length) {
    logger.info('Order reminder skipped because no Firebase tokens are registered.');
    return;
  }

  await sendPushNotification(tokens, REMINDER_TITLE, REMINDER_BODY, {
    type: 'daily_order_reminder',
  });

  logger.info('Daily Firebase order reminder sent', {
    recipients: tokens.length,
  });
};

export const startOrderReminderScheduler = (): void => {
  if (process.env.NODE_ENV === 'test' || process.env.TEST_MODULE) {
    return;
  }

  cron.schedule(
    REMINDER_CRON,
    () => {
      sendDailyOrderReminder().catch((error) => {
        logger.error('Daily order reminder failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    },
    {
      timezone: REMINDER_TIMEZONE,
    }
  );

  logger.info('Order reminder scheduler started', {
    cron: REMINDER_CRON,
    timezone: REMINDER_TIMEZONE,
  });
};
