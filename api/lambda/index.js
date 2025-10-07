const serverlessExpress = require('@codegenie/serverless-express');
const app = require('./src/index');

// Create serverless express instance with proper configuration
const serverlessExpressInstance = serverlessExpress({
  app
});

// Lambda handler function
exports.handler = async (event, context) => {
  // Set callbackWaitsForEmptyEventLoop to false to prevent Lambda from waiting
  // for the event loop to be empty before returning
  context.callbackWaitsForEmptyEventLoop = false;
  console.log('Event body type:', typeof event.body);
  console.log('Event isBase64Encoded:', event.isBase64Encoded);

  console.log('Event:', JSON.stringify(event, null, 2));
  console.log('Context:', JSON.stringify(context, null, 2));

  return serverlessExpressInstance(event, context);
};
