import rateLimit from 'express-rate-limit';

const isTestMode = process.env.NODE_ENV === 'test' || Boolean(process.env.TEST_MODULE);
const getLimit = (value: number): number => (isTestMode ? Number.MAX_SAFE_INTEGER : value);

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
  limit: getLimit(5),
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitResponse,
});

export const authCodeConfirmLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: getLimit(10),
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitResponse,
});

export const passwordLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: getLimit(10),
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitResponse,
});
