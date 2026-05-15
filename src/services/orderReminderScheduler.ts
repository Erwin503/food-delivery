import cron from 'node-cron';
import db from '../db/knex';
import { isFirebaseConfigured, sendPushNotification } from '../utils/firebaseService';
import logger from '../utils/logger';

const REMINDER_CRON = process.env.ORDER_REMINDER_CRON?.trim() || '0 9 * * *';
const REMINDER_TIMEZONE = process.env.ORDER_REMINDER_TIMEZONE?.trim() || 'Europe/Moscow';

const REMINDER_TITLE = 'Напоминание о заказе';
const REMINDER_BODY = 'Скоро будет сформирован заказ. Если хотите что-то добавить, проверьте корзину заранее.';

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
