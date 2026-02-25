import pino from 'pino';
import { AsyncLocalStorage } from 'async_hooks';

// Create async local storage for request context
export const asyncLocalStorage = new AsyncLocalStorage();

// Create pino logger instance
const pinoLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Logger wrapper that automatically includes context from async local storage
export const logger = {
  info: (obj) => {
    const context = asyncLocalStorage.getStore();
    pinoLogger.info({ ...context, ...obj });
  },
  error: (obj) => {
    const context = asyncLocalStorage.getStore();
    pinoLogger.error({ ...context, ...obj });
  },
  warn: (obj) => {
    const context = asyncLocalStorage.getStore();
    pinoLogger.warn({ ...context, ...obj });
  },
  debug: (obj) => {
    const context = asyncLocalStorage.getStore();
    pinoLogger.debug({ ...context, ...obj });
  },
  trace: (obj) => {
    const context = asyncLocalStorage.getStore();
    pinoLogger.trace({ ...context, ...obj });
  },
};

