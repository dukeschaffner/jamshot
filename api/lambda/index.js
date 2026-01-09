import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const serverlessExpress = require('@codegenie/serverless-express');
import app from './src/index.js';

// Create serverless express instance with proper configuration
const serverlessExpressInstance = serverlessExpress({
  app,
  shouldParseBody: false,
});

// Global error handlers for Lambda environment
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process in Lambda - just log the error
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  // Don't exit the process in Lambda - just log the error
});

// Lambda handler function
export const handler = async (event, context) => {
  // Set callbackWaitsForEmptyEventLoop to false to prevent Lambda from waiting
  // for the event loop to be empty before returning
  context.callbackWaitsForEmptyEventLoop = false;

  // Enhanced logging for all requests, especially auth endpoints
  const isAuthEndpoint = event.rawPath && event.rawPath.includes('/api/auth/');
  const logLevel = isAuthEndpoint ? '🔐 AUTH REQUEST' : '📡 API REQUEST';

  console.log(`${logLevel}:`);
  console.log(`  - Method: ${event.requestContext?.http?.method || 'UNKNOWN'}`);
  console.log(`  - Path: ${event.rawPath || 'UNKNOWN'}`);
  console.log(`  - Query: ${event.rawQueryString || '(none)'}`);
  console.log(`  - User-Agent: ${event.headers?.['user-agent'] || 'UNKNOWN'}`);
  console.log(`  - Origin: ${event.headers?.origin || 'UNKNOWN'}`);
  console.log(`  - NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
  console.log(`  - Stage: ${event.requestContext?.stage || 'UNKNOWN'}`);

  if (isAuthEndpoint) {
    console.log(`  - Headers:`, JSON.stringify(event.headers, null, 2));
    if (event.body) {
      // Don't log full body for security, but log that body exists
      console.log(`  - Has body: ${!!event.body} (${typeof event.body})`);
    }
  }

  if (event.body && event.isBase64Encoded) {
    event.body = Buffer.from(event.body, 'base64');
  }

  return serverlessExpressInstance(event, context);
};


// {
//   "version": "2.0",
//   "routeKey": "ANY /{proxy+}",
//   "rawPath": "/test/api/notifications/count",
//   "rawQueryString": "",
//   "headers": {
//       "accept": "application/json, text/plain, */*",
//       "accept-encoding": "gzip, deflate, br, zstd",
//       "accept-language": "en-US,en;q=0.9,la;q=0.8",
//       "authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MywiaWF0IjoxNzYwOTkxMzI4LCJleHAiOjE3NjA5OTQ5Mjh9.czk2EA0pfPoyebIlzijEoWHfe3mkf-8qG-R9IuN7QV4",
//       "content-length": "0",
//       "host": "kxdwjea5mk.execute-api.us-east-2.amazonaws.com",
//       "if-none-match": "W/\"b-ch7MNww9+xUYoTgutbGr6VU0GaU\"",
//       "origin": "https://dev.d3cx888lrkmdbn.amplifyapp.com",
//       "priority": "u=1, i",
//       "referer": "https://dev.d3cx888lrkmdbn.amplifyapp.com/",
//       "sec-fetch-dest": "empty",
//       "sec-fetch-mode": "cors",
//       "sec-fetch-site": "cross-site",
//       "sec-fetch-storage-access": "none",
//       "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
//       "x-amzn-trace-id": "Root=1-68f698d9-64db5f25155a73fb587bbc0f",
//       "x-forwarded-for": "152.37.139.214",
//       "x-forwarded-port": "443",
//       "x-forwarded-proto": "https"
//   },
//   "requestContext": {
//       "accountId": "700630379830",
//       "apiId": "kxdwjea5mk",
//       "domainName": "kxdwjea5mk.execute-api.us-east-2.amazonaws.com",
//       "domainPrefix": "kxdwjea5mk",
//       "http": {
//           "method": "GET",
//           "path": "/test/api/notifications/count",
//           "protocol": "HTTP/1.1",
//           "sourceIp": "152.37.139.214",
//           "userAgent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1"
//       },
//       "requestId": "SwzSAgYliYcEPJQ=",
//       "routeKey": "ANY /{proxy+}",
//       "stage": "test",
//       "time": "20/Oct/2025:20:17:29 +0000",
//       "timeEpoch": 1760991449264
//   },
//   "pathParameters": {
//       "proxy": "api/notifications/count"
//   },
//   "isBase64Encoded": false
// }