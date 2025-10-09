const serverlessExpress = require('@codegenie/serverless-express');
const app = require('./src/index');

// Create serverless express instance with proper configuration
const serverlessExpressInstance = serverlessExpress({
  app,
  shouldParseBody: false,
});

// Lambda handler function
exports.handler = async (event, context) => {
  // Set callbackWaitsForEmptyEventLoop to false to prevent Lambda from waiting
  // for the event loop to be empty before returning
  context.callbackWaitsForEmptyEventLoop = false;
  console.log('Event body type:', typeof event.body);
  console.log('Event isBase64Encoded:', event.isBase64Encoded);
  console.log('Event body:', event.body);

  if (event.body && event.isBase64Encoded) {
    event.body = Buffer.from(event.body, 'base64');
    console.log('Event body decoded:', event.body);
  }

  console.log('Event url:', event.url);

  return serverlessExpressInstance(event, context);
};
