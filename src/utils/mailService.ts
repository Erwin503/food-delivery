import nodemailer from 'nodemailer';
import knex from '../db/knex';
import logger from './logger';
import { generateSessionQrCode } from './qrService';

const smtpPort = Number(process.env.SMTP_PORT) || 2525;
const smtpSecure =
  process.env.SMTP_SECURE != null ? process.env.SMTP_SECURE === 'true' : smtpPort === 465;

export const mailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'sandbox.smtp.mailtrap.io',
  port: smtpPort,
  secure: smtpSecure,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export const isMailConfigured = (): boolean => Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);

export const sendEmail = async (
  to: string,
  subject: string,
  html: string,
  fromName = 'Система уведомлений'
) => {
  const from = `"${fromName}" <${process.env.SMTP_USER}>`;

  await mailTransporter.sendMail({
    from,
    to,
    subject,
    html,
  });

  logger.info('Email sent', { to, subject });
  return true;
};

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
    throw new Error('Сессия не найдена');
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

  const subject = `Подтверждение записи на приём - ${session.specific_date} ${session.start_time}`;

  return { subject, html };
};
