import jwt from "jsonwebtoken";
import logger from "../utils/logger";

export const generateToken = (payload: object): string => {
  const secret = process.env.JWT_SECRET as string;
  const expiresIn = process.env.JWT_EXPIRES_IN || "3600"; // по умолчанию 1 час

  const token = jwt.sign(payload, secret, { expiresIn });

  logger.debug(`token: ${token}`);

  return token;
};
