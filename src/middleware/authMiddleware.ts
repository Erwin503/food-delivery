import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import logger from "../utils/logger";

export interface AuthRequest extends Request {
  user?: any;
}

export const authenticateToken = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers["authorization"];

  if (!authHeader) {
    res.status(401).json({ message: "Отсутствует заголовок авторизации" });
    return;
  }

  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    res.status(401).json({ message: "Токен не предоставлен" });
  }

  jwt.verify(token!, process.env.JWT_SECRET as string, (err, user) => {
    if (err) {
      logger.error(err);
      return res.status(403).json({ message: "Недействительный токен" });
    }
    logger.debug(JSON.stringify(user));
    req.user = user;
    next();
  });
};
