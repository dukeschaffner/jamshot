const DEV_LOG_URL = 'http://127.0.0.1:5099/log';

function isLocalDev() {
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
    return true;
  }
  if (typeof window !== 'undefined') {
    const host = window.location?.hostname;
    return host === 'localhost' || host === '127.0.0.1';
  }
  return false;
}

function formatMessage(args) {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg;
      if (arg instanceof Error) return arg.stack || arg.message;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(' ');
}

function shipToDevLog(level, args) {
  if (!isLocalDev()) return;

  const message = formatMessage(args);
  if (!message) return;

  const body = JSON.stringify({
    source: 'UI',
    level,
    message,
    ts: new Date().toISOString(),
  });

  try {
    // Prefer sendBeacon when available (unload-safe); fall back to fetch
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon(DEV_LOG_URL, blob)) return;
    }

    fetch(DEV_LOG_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      // Fail silently — log server may not be running
    });
  } catch {
    // Fail silently
  }
}

function createLoggerMethod(consoleFn, level) {
  return (...args) => {
    consoleFn(...args);
    shipToDevLog(level, args);
  };
}

/**
 * Local-dev logger: always writes to the browser/Node console, and when running
 * locally also POSTs to the unified DevLog server (`npm run dev:backend`).
 */
export const logger = {
  log: createLoggerMethod(console.log.bind(console), 'info'),
  info: createLoggerMethod(console.info.bind(console), 'info'),
  warn: createLoggerMethod(console.warn.bind(console), 'warn'),
  error: createLoggerMethod(console.error.bind(console), 'error'),
  debug: createLoggerMethod(console.debug.bind(console), 'debug'),
};

export default logger;
