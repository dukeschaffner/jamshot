import { routeProjectWsEvent } from '../../../api/lambda/src/projectWs/projectWsRouter.js';

export const handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  try {
    return await routeProjectWsEvent(event);
  } catch (error) {
    console.error('[project-ws] Unhandled error:', error);
    return { statusCode: 500, body: 'Internal server error' };
  }
};
