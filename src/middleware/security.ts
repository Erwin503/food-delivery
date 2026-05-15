import rateLimit from 'express-rate-limit';

const rateLimitResponse = {
  status: 'error',
  message: 'Too many requests, please try again later',
  error: {
    message: 'Too many requests, please try again later',
    code: 'RATE_LIMITED',
    statusCode: 429,
  },
};

export const authCodeRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitResponse,
});

export const authCodeConfirmLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitResponse,
});

export const passwordLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitResponse,
});
