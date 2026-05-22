import { LOOP_LISTENING_DEBUG } from './config';

const PREFIX = '[LoopListening]';

function shouldLog() {
  if (LOOP_LISTENING_DEBUG) return true;
  if (typeof window !== 'undefined' && window.__LOOP_LISTENING_DEBUG__) return true;
  return false;
}

function formatPayload(step, message, data) {
  return {
    step,
    message,
    ts: typeof performance !== 'undefined' ? Number(performance.now().toFixed(1)) : Date.now(),
    ...data,
  };
}

export function loopLog(step, message, data = {}) {
  if (!shouldLog()) return;
  console.log(`${PREFIX} ${step}: ${message}`, formatPayload(step, message, data));
}

export function loopWarn(step, message, data = {}) {
  if (!shouldLog()) return;
  console.warn(`${PREFIX} ${step}: ${message}`, formatPayload(step, message, data));
}

export function loopError(step, message, data = {}) {
  if (!shouldLog()) return;
  console.error(`${PREFIX} ${step}: ${message}`, formatPayload(step, message, data));
}

export function loopGroup(step, message, fn) {
  if (!shouldLog()) return fn();
  console.groupCollapsed(`${PREFIX} ${step}: ${message}`);
  try {
    return fn();
  } finally {
    console.groupEnd();
  }
}
