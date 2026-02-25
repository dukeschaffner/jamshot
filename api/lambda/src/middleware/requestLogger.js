import { logger } from '../utils/logger.js';

/**
 * Middleware to log all HTTP requests with timing information
 * Logs when the response finishes, including route, method, status code, duration, and context
 */
export const requestLoggerMiddleware = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    logger.info({
      route: req.originalUrl,
      method: req.method,
      statusCode: res.statusCode,
      duration_ms: Date.now() - start,
      userId: req.user?.id,
      correlationId: req.correlationId,
    });
  });

  next();
};

