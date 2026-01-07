const { EventBridgeClient, PutEventsCommand } = require('@aws-sdk/client-eventbridge');

// Initialize EventBridge
const eventBridgeClient = new EventBridgeClient({
  region: process.env.AWS_REGION || 'us-east-1'
});

// Determine which event bus to use based on environment
const getEventBusName = () => {
  const env = process.env.NODE_ENV;
  if (env === 'production') return 'sterio-prod-events';
  if (env === 'test') return 'sterio-test-events';
  // Default to test for safety in unknown environments
  return 'sterio-test-events';
};

/**
 * Schedule a competition end event to trigger the Lambda function
 * @param {string} competitionId - The competition ID
 * @param {Date} endDate - When the competition ends
 * @param {string} winnerSelectionMethod - 'automated' or 'curated'
 */
async function scheduleCompetitionEnd(competitionId, endDate, winnerSelectionMethod) {
  try {
    console.log(`Scheduling competition end for ID: ${competitionId} at ${endDate.toISOString()}`);
    if( process.env.NODE_ENV === 'dev' ) {
      return;
    }
    
    // Create the scheduled event
    const params = {
      Entries: [
        {
          Source: 'sterio.competitions',
          DetailType: 'competition_end',
          Detail: JSON.stringify({
            competition_id: competitionId,
            winner_selection_method: winnerSelectionMethod,
            scheduled_for: endDate.toISOString()
          }),
          Time: endDate,
          EventBusName: getEventBusName()
        }
      ]
    };

    const command = new PutEventsCommand(params);
    const result = await eventBridgeClient.send(command);

    console.log(`Competition end event scheduled:`, result);
    
    // For curated competitions, also schedule the 24hr follow-up
    // if (winnerSelectionMethod === 'curated') {
    //   const followupDate = new Date(endDate);
    //   followupDate.setHours(followupDate.getHours() + 24);
      
    //   await scheduleCuratedFollowup(competitionId, followupDate);
    // }
    
    return result;
    
  } catch (error) {
    console.error('Error scheduling competition end:', error);
    throw error;
  }
}

/**
 * Schedule a curated competition follow-up event (24 hours after end)
 * @param {string} competitionId - The competition ID
 * @param {Date} followupDate - When to run the follow-up (24hrs after end)
 */
async function scheduleCuratedFollowup(competitionId, followupDate) {
  try {
    console.log(`Scheduling curated follow-up for ID: ${competitionId} at ${followupDate.toISOString()}`);
    
    const params = {
      Entries: [
        {
          Source: 'sterio.competitions',
          DetailType: 'curated_followup',
          Detail: JSON.stringify({
            competition_id: competitionId,
            type: 'curated_followup',
            scheduled_for: followupDate.toISOString()
          }),
          Time: followupDate,
          EventBusName: getEventBusName()
        }
      ]
    };

    const command = new PutEventsCommand(params);
    const result = await eventBridgeClient.send(command);

    console.log(`Curated follow-up event scheduled:`, result);
    return result;
    
  } catch (error) {
    console.error('Error scheduling curated follow-up:', error);
    throw error;
  }
}

/**
 * Cancel scheduled events for a competition (if competition is deleted/cancelled)
 * @param {string} competitionId - The competition ID
 */
async function cancelScheduledEvents(competitionId) {
  try {
    console.log(`Cancelling scheduled events for competition: ${competitionId}`);
    
    // Note: EventBridge doesn't support direct cancellation of scheduled events
    // You would need to track scheduled events in your database and handle cancellation
    // by checking if the competition still exists when the event fires
    
    // For now, we'll just log this - in production you might want to:
    // 1. Store event IDs in your database
    // 2. Check competition status when events fire
    // 3. Skip processing if competition was cancelled
    
    console.log(`Scheduled events cancellation requested for competition: ${competitionId}`);
    
  } catch (error) {
    console.error('Error cancelling scheduled events:', error);
    throw error;
  }
}

/**
 * Test function to manually trigger a competition end event
 * @param {string} competitionId - The competition ID
 */
async function triggerCompetitionEndNow(competitionId) {
  try {
    console.log(`Manually triggering competition end for ID: ${competitionId}`);
    
    const params = {
      Entries: [
        {
          Source: 'sterio.competitions',
          DetailType: 'competition_end',
          Detail: JSON.stringify({
            competition_id: competitionId,
            winner_selection_method: 'automated',
            manual_trigger: true,
            triggered_at: new Date().toISOString()
          }),
          Time: new Date(),
          EventBusName: getEventBusName()
        }
      ]
    };

    const command = new PutEventsCommand(params);
    const result = await eventBridgeClient.send(command);

    console.log(`Competition end event triggered:`, result);
    return result;
    
  } catch (error) {
    console.error('Error triggering competition end:', error);
    throw error;
  }
}

module.exports = {
  scheduleCompetitionEnd,
  scheduleCuratedFollowup,
  cancelScheduledEvents,
  triggerCompetitionEndNow
};
