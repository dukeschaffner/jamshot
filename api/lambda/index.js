
import { createRequire } from 'module';
const require = createRequire(import.meta.url);


// Main routing handler
export const handler = async (event, context) => {
  // Set callbackWaitsForEmptyEventLoop to false
  context.callbackWaitsForEmptyEventLoop = false;

  // Log incoming request details
  console.log(`[LAMBDA HANDLER] Request received:`, {
    method: event.requestContext?.http?.method || event.httpMethod || 'UNKNOWN',
    path: event.rawPath || event.path || 'UNKNOWN',
    queryStringParameters: event.queryStringParameters,
    headers: event.headers,
    bodyLength: event.body ? event.body.length : 0,
    isBase64Encoded: event.isBase64Encoded,
    stage: event.requestContext?.stage || 'UNKNOWN'
  });

  // Determine if this is an auth request
  const isAuthRequest = event.rawPath && event.rawPath.includes('/api/auth');
  console.log(`[LAMBDA HANDLER] Routing decision: ${isAuthRequest ? 'Auth request (Hono)' : 'Non-auth request (Express)'}`);

  // Decode base64 body if needed
  if (event.body && event.isBase64Encoded) {
    console.log(`[LAMBDA HANDLER] Decoding base64 body`);
    event.body = Buffer.from(event.body, 'base64');
  }

  try {
    if (isAuthRequest) {
      // Route auth requests to Hono handler
      console.log(`[LAMBDA HANDLER] Routing to Hono handler for auth request`);
      const { handle } = await import("hono/aws-lambda");
      const honoApp = await import('./src/hono-api.js');
      const result = await handle(honoApp.default)(event, context);
      console.log(`[LAMBDA HANDLER] Hono handler returned:`, {
        statusCode: result.statusCode,
        headers: result.headers
      });
      return result;
    } else {
      // Route all other requests to serverless express handler
      console.log(`[LAMBDA HANDLER] Routing to Express handler for non-auth request`);
      const serverlessExpress = require('@codegenie/serverless-express');
      const expressApp = await import('./src/express-api.js');
      const serverlessExpressInstance = serverlessExpress({
        app: expressApp.default,
        shouldParseBody: false,
      });
      const result = await serverlessExpressInstance(event, context);
      console.log(`[LAMBDA HANDLER] Express handler returned:`, {
        statusCode: result.statusCode,
        headers: result.headers
      });
      return result;
    }
  } catch (error) {
    console.error(`[LAMBDA HANDLER] Error processing request:`, {
      error: error.message,
      stack: error.stack,
      path: event.rawPath || event.path,
      method: event.requestContext?.http?.method || event.httpMethod
    });
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: 'An unexpected error occurred'
      })
    };
  }
};
