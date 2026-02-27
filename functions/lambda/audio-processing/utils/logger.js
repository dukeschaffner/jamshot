import pino from 'pino';
import { AsyncLocalStorage } from 'async_hooks';

// Async local storage for invocation context (correlationId, track_id)
export const asyncLocalStorage = new AsyncLocalStorage();

const pinoLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

function withContext(obj) {
  const context = asyncLocalStorage.getStore() || {};
  return { ...context, ...obj };
}

export const logger = {
  info: (obj) => pinoLogger.info(withContext(obj)),
  error: (obj) => pinoLogger.error(withContext(obj)),
  warn: (obj) => pinoLogger.warn(withContext(obj)),
  debug: (obj) => pinoLogger.debug(withContext(obj)),
};
