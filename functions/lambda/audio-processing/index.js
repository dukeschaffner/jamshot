import crypto from 'crypto';
import AudioProcessor from './utils/audioProcessor.js';
import { asyncLocalStorage, logger } from './utils/logger.js';

/**
 * AWS Lambda handler for audio processing
 *
 * This function can be triggered by:
 * 1. EventBridge (CloudWatch Events) - After track creation
 * 2. Manual invocation via AWS Console or CLI
 * 3. API Gateway (for manual triggers)
 *
 * Event structure for manual invocation:
 * {
 *   "track_id": "123",
 *   "s3_key": "temp/tracks/123/raw-filename.mp3"
 * }
 * EventBridge detail may include correlation_id (from API) for request tracing.
 */

export const handler = async (event, context) => {
  const correlationId = event.detail?.correlation_id ?? event.correlation_id ?? crypto.randomUUID();
  const assetId = event.asset_id ?? event.detail?.asset_id ?? process.env.ASSET_ID;
  const trackId = event.track_id ?? event.detail?.track_id ?? process.env.TRACK_ID;
  const s3Key = event.s3_key ?? event.detail?.s3_key ?? process.env.S3_KEY;

  const invocationContext = {
    correlationId,
    track_id: trackId,
    asset_id: assetId,
  };

  return asyncLocalStorage.run(invocationContext, async () => {

    const processor = new AudioProcessor();

    try {
      if (assetId) {
        const result = await processor.processProjectAsset(assetId, s3Key);
        return {
          statusCode: 200,
          body: JSON.stringify({ ...result, correlationId }),
        };
      }

      if (!trackId) {
        throw new Error('track_id or asset_id is required in event');
      }

      const result = await processor.processAudio(trackId);

      return {
        statusCode: 200,
        body: JSON.stringify({ ...result, correlationId }),
      };
    } catch (error) {
      logger.error({
        message: 'Error during audio processing',
        error: error.message,
        stack: error.stack,
        track_id: trackId,
        asset_id: assetId,
      });

      const errorResult = {
        status: 'error',
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
        track_id: trackId,
        asset_id: assetId,
        correlationId,
      };

      return {
        statusCode: 500,
        body: JSON.stringify(errorResult),
      };
    }
  });
};

/**
 * Handler for track creation events
 * This is triggered when a new track is created
 */
export const trackCreatedHandler = async (event, context) => {
  const modifiedEvent = {
    ...event,
    track_id: event.detail?.track_id,
    s3_key: event.detail?.s3_key,
    detail: { ...event.detail, correlation_id: event.detail?.correlation_id },
  };
  return handler(modifiedEvent, context);
};

export const projectAssetCreatedHandler = async (event, context) => {
  const modifiedEvent = {
    ...event,
    asset_id: event.detail?.asset_id,
    s3_key: event.detail?.s3_key,
    detail: { ...event.detail, correlation_id: event.detail?.correlation_id },
  };
  return handler(modifiedEvent, context);
};

/**
 * Handler for manual audio processing
 * Can be triggered via AWS Console or CLI for testing
 */
export const manualHandler = async (event, context) => {
  return handler(event, context);
};

// Local development: if this file is run directly, invoke the handler
import { fileURLToPath } from 'url';
import { resolve } from 'path';
import { argv } from 'process';

const __filename = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] && resolve(process.argv[1]) === __filename;

if (isMainModule) {
  console.log('🔧 Running in local development mode');
  (async () => {
    try {
      // Create event object from environment variables (set by dev server)
      const event = {
        track_id: process.env.TRACK_ID,
        asset_id: process.env.ASSET_ID,
        s3_key: process.env.S3_KEY,
      };
      console.log('🔍 Debug: Local event object:', event);

      const result = await handler(event, {});
      console.log('✅ Local execution completed:', result);
      process.exit(0);
    } catch (error) {
      console.error('❌ Local execution failed:', error);
      process.exit(1);
    }
  })();
}
