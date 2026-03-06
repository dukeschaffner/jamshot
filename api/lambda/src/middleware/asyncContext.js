import crypto from 'crypto';
import { asyncLocalStorage } from '../utils/logger.js';

/**
 * Middleware to set up async local storage context with correlation ID and user ID
 * This allows the logger to automatically include these fields in all log entries
 */
export const asyncContextMiddleware = (req, res, next) => {
  const context = {
    correlationId: crypto.randomUUID(),
    userId: req.user?.id,
  };

  // Store correlation ID on request for access in other middleware
  req.correlationId = context.correlationId;

  asyncLocalStorage.run(context, () => {
    next();
  });
};

