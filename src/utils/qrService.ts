import { v4 as uuidv4 } from "uuid";
import QRCode from "qrcode";
import knex from "../db/knex";

export const generateSessionQrCode = async (sessionId: number) => {
  const session = await knex("Sessions").where({ id: sessionId }).first();
  if (!session) throw new Error("Сессия не найдена");

  const token = uuidv4();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const url = `${
    process.env.BASE_URL || "http://localhost:3000"
  }/api/qr/access/${token}`;

  await knex("QueueQrTokens").insert({
    token,
    session_id: sessionId,
    expires_at: expiresAt,
    used: false,
  });

  const qrCode = await QRCode.toDataURL(url);

  return { token, expiresAt, url, qrCode };
};
