// Debug utilities for React Native app

export const debugLog = (component, message, data = null) => {
  const timestamp = new Date().toISOString();
  console.log(`🔍 [${timestamp}] ${component}:`, message, data || '');
};

export const debugError = (component, error, context = null) => {
  const timestamp = new Date().toISOString();
  console.error(`❌ [${timestamp}] ${component} Error:`, error, context || '');
};

export const debugPerformance = (component, operation, startTime) => {
  const endTime = Date.now();
  const duration = endTime - startTime;
  console.log(`⚡ [${component}] ${operation}: ${duration}ms`);
};

export const debugState = (component, state) => {
  console.log(`📊 [${component}] State:`, state);
};

export const debugProps = (component, props) => {
  console.log(`🎯 [${component}] Props:`, props);
};

// Performance wrapper
export const withPerformanceLogging = (componentName, operation) => {
  return (func) => {
    return (...args) => {
      const startTime = Date.now();
      const result = func(...args);
      debugPerformance(componentName, operation, startTime);
      return result;
    };
  };
};

// Debug mode flag
export const DEBUG_MODE = __DEV__;

// Conditional logging
export const debug = {
  log: (message, data) => {
    if (DEBUG_MODE) {
      console.log(`🔍 DEBUG: ${message}`, data);
    }
  },
  error: (message, error) => {
    if (DEBUG_MODE) {
      console.error(`❌ DEBUG ERROR: ${message}`, error);
    }
  },
  warn: (message, data) => {
    if (DEBUG_MODE) {
      console.warn(`⚠️ DEBUG WARNING: ${message}`, data);
    }
  }
}; 