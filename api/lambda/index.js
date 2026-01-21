
// Main routing handler
export const handler = async (event, context) => {
  // Set callbackWaitsForEmptyEventLoop to false
  context.callbackWaitsForEmptyEventLoop = false;

  // Determine if this is an auth request
  const isAuthRequest = event.rawPath && event.rawPath.includes('/api/auth');

  // Decode base64 body if needed
  if (event.body && event.isBase64Encoded) {
    event.body = Buffer.from(event.body, 'base64');
  }

  try {
    if (isAuthRequest) {
      // Route auth requests to Hono handler
      const { handle } = await import("hono/aws-lambda");
      const honoApp = await import('./src/hono-api.js');
      const result = await handle(honoApp.default)(event, context);
      return result;
    } else {
      // Route all other requests to serverless express handler
      const { configure } = await import('@codegenie/serverless-express');
      const expressApp = await import('./src/express-api.js');
      const serverlessExpressInstance = configure({
        app: expressApp.default,
        framework: 'express'
      });
      return await serverlessExpressInstance(event, context);
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
