import knex from '../db/knex';
import logger from './logger';
import { generateSessionQrCode } from './qrService';

const defaultFromEmail = process.env.SMTP_FROM_EMAIL || 'no-reply@example.com';
const defaultFromName = process.env.SMTP_FROM_NAME || 'Cook';
const unisenderApiUrl = process.env.UNISENDER_API_URL || 'https://api.unisender.com/ru/api/sendEmail';
const unisenderApiKey = process.env.UNISENDER_API_KEY?.trim() || '';
const unisenderListId = process.env.UNISENDER_LIST_ID?.trim() || '';

let mailConnectionCheckedAt: string | null = null;
let mailConnectionStatus: 'unknown' | 'not_configured' | 'ok' | 'error' = 'unknown';
let mailConnectionMessage: string | null = null;
const unisenderProviderName = 'unisender_api';

const getUnisenderListsUrl = (): string => {
  try {
    const url = new URL(unisenderApiUrl);
    url.pathname = url.pathname.replace(/sendEmail\/?$/, 'getLists');
    return url.toString();
  } catch {
    return 'https://api.unisender.com/ru/api/getLists';
  }
};

const isUnisenderConfigured = (): boolean => Boolean(unisenderApiKey && unisenderListId && defaultFromEmail);

export const isMailConfigured = (): boolean => isUnisenderConfigured();

const parseUnisenderResponse = async (response: Response) => {
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(`Unisender API request failed with status ${response.status}`);
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('Unisender API returned an invalid response');
  }

  if ('error' in payload && payload.error) {
    throw new Error(String(payload.error));
  }

  return payload as Record<string, unknown>;
};

export const sendEmail = async (
  to: string,
  subject: string,
  html: string,
  fromName = defaultFromName
) => {
  if (!isUnisenderConfigured()) {
    throw new Error('Unisender API is not configured');
  }

  const body = new URLSearchParams({
    format: 'json',
    api_key: unisenderApiKey,
    email: to,
    sender_name: fromName,
    sender_email: defaultFromEmail,
    subject,
    body: html,
    list_id: unisenderListId,
    error_checking: '1',
  });

  const response = await fetch(unisenderApiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const payload = await parseUnisenderResponse(response);

  if (Array.isArray(payload.result)) {
    const firstResult = payload.result[0] as { errors?: { message?: string }[] } | undefined;
    const firstError = firstResult?.errors?.[0]?.message;

    if (firstError) {
      throw new Error(firstError);
    }
  }

  logger.info('Email sent via Unisender API', { to, subject });
  return true;
};

export const verifyMailConnection = async (): Promise<void> => {
  mailConnectionCheckedAt = new Date().toISOString();

  if (!isMailConfigured()) {
    mailConnectionStatus = 'not_configured';
    mailConnectionMessage = 'Unisender API credentials are not configured';
    return;
  }

  try {
    const body = new URLSearchParams({
      format: 'json',
      api_key: unisenderApiKey,
    });

    const response = await fetch(getUnisenderListsUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    await parseUnisenderResponse(response);
    mailConnectionStatus = 'ok';
    mailConnectionMessage = null;
    logger.info('Unisender API connection verified', {
      provider: unisenderProviderName,
      endpoint: unisenderApiUrl,
    });
  } catch (error) {
    mailConnectionStatus = 'error';
    mailConnectionMessage = error instanceof Error ? error.message : String(error);
    logger.error('Unisender API connection verification failed', {
      provider: unisenderProviderName,
      endpoint: unisenderApiUrl,
      error: mailConnectionMessage,
    });
  }
};

export const getMailHealth = () => ({
  configured: isMailConfigured(),
  provider: isMailConfigured() ? unisenderProviderName : null,
  status: mailConnectionStatus,
  checkedAt: mailConnectionCheckedAt,
  message: mailConnectionMessage,
});

export const queueEmail = (to: string, subject: string, html: string, fromName?: string): void => {
  if (!isMailConfigured()) {
    return;
  }

  setImmediate(() => {
    sendEmail(to, subject, html, fromName).catch((error) => {
      logger.error('Email delivery failed', {
        to,
        subject,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  });
};

export const generateSessionEmailHtml = (
  fullName: string,
  sessionDate: string,
  startTime: string,
  endTime: string,
  districtName: string,
  qrCodeBase64?: string
): string => {
  return `
    <div style="font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 20px;">
      <div style="max-width: 600px; margin: auto; background-color: #fff; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); padding: 24px;">
        <h2 style="color: #2a9d8f;">Подтверждение вашей записи</h2>

        <p>Здравствуйте, <strong>${fullName}</strong>!</p>
        <p>Вы записаны на приём. Ниже информация по вашей записи:</p>

        <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
          <tr>
            <td style="padding: 8px; font-weight: bold;">Дата:</td>
            <td style="padding: 8px;">${sessionDate}</td>
          </tr>
          <tr>
            <td style="padding: 8px; font-weight: bold;">Время:</td>
            <td style="padding: 8px;">${startTime} - ${endTime}</td>
          </tr>
          <tr>
            <td style="padding: 8px; font-weight: bold;">Место:</td>
            <td style="padding: 8px;">${districtName}</td>
          </tr>
        </table>

        ${
          qrCodeBase64
            ? `<p style="margin-top: 24px;">Предъявите этот QR-код при визите:</p>
               <img src="${qrCodeBase64}" alt="QR Code" style="max-width: 200px; border: 1px solid #ddd; padding: 8px;" />`
            : ''
        }

        <p style="margin-top: 24px;">Если у вас возникнут вопросы, свяжитесь с нашим администратором.</p>

        <p style="color: #888; font-size: 12px; margin-top: 40px;">Это автоматическое уведомление, не отвечайте на него.</p>
      </div>
    </div>
    `;
};

export const buildSessionEmailContent = async (
  sessionId: number,
  userName: string
): Promise<{ subject: string; html: string }> => {
  const session = await knex('Sessions')
    .join('WorkingHours', 'Sessions.working_hour_id', 'WorkingHours.id')
    .join('Districts', 'Sessions.district_id', 'Districts.id')
    .select(
      'WorkingHours.specific_date',
      'WorkingHours.start_time',
      'WorkingHours.end_time',
      'Districts.name as district_name'
    )
    .where('Sessions.id', sessionId)
    .first();

  if (!session) {
    throw new Error('\u0421\u0435\u0441\u0441\u0438\u044f \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u0430');
  }

  const { qrCode } = await generateSessionQrCode(sessionId);

  const html = generateSessionEmailHtml(
    userName,
    session.specific_date,
    session.start_time,
    session.end_time,
    session.district_name,
    qrCode
  );

  const subject = `\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u0435 \u0437\u0430\u043f\u0438\u0441\u0438 \u043d\u0430 \u043f\u0440\u0438\u0451\u043c - ${session.specific_date} ${session.start_time}`;

  return { subject, html };
};
