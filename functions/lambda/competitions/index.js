const CompetitionProcessor = require('./utils/competitionProcessor');

/**
 * AWS Lambda handler for competition processing
 * 
 * This function can be triggered by:
 * 1. EventBridge (CloudWatch Events) - Competition end events
 * 2. Manual invocation via AWS Console or CLI
 * 3. API Gateway (for manual triggers)
 * 
 * Event structure for manual invocation:
 * {
 *   "type": "competition_end|curated_followup",
 *   "competition_id": "123"
 * }
 */

exports.handler = async (event, context) => {
  console.log('🏆 Jamshot Competition Lambda Started');
  console.log('Event:', JSON.stringify(event, null, 2));
  console.log('Context:', JSON.stringify(context, null, 2));
  
  const processor = new CompetitionProcessor();
  
  try {
    // Parse event parameters
    const type = event.type || event['detail-type'] || 'competition_end';
    const competitionId = event.competition_id || event.detail?.competition_id;
    
    if (!competitionId) {
      throw new Error('competition_id is required in event');
    }
    
    console.log(`📅 Processing competition: ${competitionId}`);
    console.log(`🎯 Type: ${type}`);
    
    let result;
    
    if (type === 'competition_end' || type === 'Competition Ended') {
      console.log('🏁 Processing competition end...');
      result = await processor.processCompetitionEnd(competitionId);
    } else if (type === 'curated_followup' || type === 'Competition Follow-up') {
      console.log('⏰ Processing curated competition follow-up...');
      result = await processor.processCuratedFollowup(competitionId);
    } else {
      throw new Error(`Invalid type specified: ${type}. Valid options: competition_end, curated_followup`);
    }
    
    console.log('✅ Competition processing completed successfully!');
    console.log('Result:', JSON.stringify(result, null, 2));
    
    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };
    
  } catch (error) {
    console.error('❌ Error during competition processing:', error);
    
    const errorResult = {
      status: 'error',
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    };
    
    return {
      statusCode: 500,
      body: JSON.stringify(errorResult)
    };
  }
};

/**
 * Handler for competition end events
 * This is the main entry point for competition end processing
 */
exports.competitionEndHandler = async (event, context) => {
  console.log('🏁 Competition end handler triggered');
  
  const modifiedEvent = {
    type: 'competition_end',
    competition_id: event.competition_id || event.detail?.competition_id
  };
  
  return exports.handler(modifiedEvent, context);
};

/**
 * Handler for curated competition follow-up events
 * This handles 24-hour follow-up for curated competitions
 */
exports.curatedFollowupHandler = async (event, context) => {
  console.log('⏰ Curated competition follow-up handler triggered');
  
  const modifiedEvent = {
    type: 'curated_followup',
    competition_id: event.competition_id || event.detail?.competition_id
  };
  
  return exports.handler(modifiedEvent, context);
};

/**
 * Handler for manual competition processing
 * Can be triggered via AWS Console or CLI for testing
 */
exports.manualHandler = async (event, context) => {
  console.log('🔧 Manual competition processing triggered');
  
  return exports.handler(event, context);
};
