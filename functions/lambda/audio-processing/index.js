const AudioProcessor = require('./utils/audioProcessor');

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
 */

exports.handler = async (event, context) => {
  console.log('🎵 Jamshot Audio Processing Lambda Started');
  console.log('Event:', JSON.stringify(event, null, 2));
  console.log('Context:', JSON.stringify(context, null, 2));

  const processor = new AudioProcessor();

  try {
    // Parse event parameters
    const trackId = event.track_id || event.detail?.track_id;
    const s3Key = event.s3_key || event.detail?.s3_key;

    if (!trackId) {
      throw new Error('track_id is required in event');
    }

    console.log(`🎵 Processing audio for track: ${trackId}`);
    console.log(`📁 S3 Key: ${s3Key}`);

    // Process the audio
    const result = await processor.processAudio(trackId, s3Key);

    console.log('✅ Audio processing completed successfully!');
    console.log('Result:', JSON.stringify(result, null, 2));

    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };

  } catch (error) {
    console.error('❌ Error during audio processing:', error);

    const errorResult = {
      status: 'error',
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      track_id: event.track_id || event.detail?.track_id
    };

    return {
      statusCode: 500,
      body: JSON.stringify(errorResult)
    };
  }
};

/**
 * Handler for track creation events
 * This is triggered when a new track is created
 */
exports.trackCreatedHandler = async (event, context) => {
  console.log('🎵 Track created event received');

  const modifiedEvent = {
    track_id: event.detail?.track_id,
    s3_key: event.detail?.s3_key
  };

  return exports.handler(modifiedEvent, context);
};

/**
 * Handler for manual audio processing
 * Can be triggered via AWS Console or CLI for testing
 */
exports.manualHandler = async (event, context) => {
  console.log('🔧 Manual audio processing triggered');

  return exports.handler(event, context);
};
