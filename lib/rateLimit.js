const rateLimit = require('express-rate-limit');

// Login Rate Limiter (5 attempts per 15 minutes)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per 15 min
  message: {
    success: false,
    message: 'Too many login attempts. Try again after 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// General API Limiter (300 requests per minute)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  message: {
    success: false,
    message: 'Too many requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  loginLimiter,
  apiLimiter
};
