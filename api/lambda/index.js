const serverlessExpress = require('@codegenie/serverless-express');
const app = require('./src/index');

// Create serverless express instance with proper configuration
const serverlessExpressInstance = serverlessExpress({
  app,
  // Configure binary types to handle properly
  binaryMimeTypes: ['application/octet-stream', 'image/*']
});

// Lambda handler function
exports.handler = async (event, context) => {
  // Set callbackWaitsForEmptyEventLoop to false to prevent Lambda from waiting
  // for the event loop to be empty before returning
  context.callbackWaitsForEmptyEventLoop = false;

  // Log key event details for debugging (remove in production)
  console.log('Event method:', event.httpMethod);
  console.log('Event path:', event.path);
  console.log('Content-Type:', event.headers ? event.headers['content-type'] : 'none');
  console.log('Body present:', !!event.body);
  console.log('Body type:', typeof event.body);

  return serverlessExpressInstance(event, context);
};
