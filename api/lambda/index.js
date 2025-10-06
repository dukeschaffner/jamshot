const serverlessExpress = require('@codegenie/serverless-express');
const app = require('./src/index');

// Create serverless express instance with configuration
const serverlessExpressInstance = serverlessExpress({ app });

// Lambda handler function
exports.handler = (event, context) => {
  // Set callbackWaitsForEmptyEventLoop to false to prevent Lambda from waiting
  // for the event loop to be empty before returning
  context.callbackWaitsForEmptyEventLoop = false;

  return serverlessExpressInstance(event, context);
};
