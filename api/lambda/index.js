const serverlessExpress = require('@codegenie/serverless-express');
const app = require('./src/index');

// Create serverless express instance with proper binary handling
const serverlessExpressInstance = serverlessExpress({
  app,
  binaryMimeTypes: ['application/json', 'application/x-www-form-urlencoded'],
  resolutionMode: 'CALLBACK' // Use callback resolution for better stream handling
});

// Lambda handler function
exports.handler = async (event, context) => {
  // Set callbackWaitsForEmptyEventLoop to false to prevent Lambda from waiting
  // for the event loop to be empty before returning
  context.callbackWaitsForEmptyEventLoop = false;

  return serverlessExpressInstance(event, context);
};
