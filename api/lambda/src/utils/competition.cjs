/**
 * Competition utilities for Jamshot
 * Shared across different parts of the application
 */

const pool = require('../config/db.cjs');

/**
 * Validate if a track upload can be entered as a competition entry
 * @param {number} parentTrackId - ID of the parent track (competition track)
 * @param {number} userId - ID of the user uploading the track
 * @returns {Object} Validation result with valid boolean and error message
 */
const validateCompetitionEntry = async (parentTrackId, userId) => {
  try {
    // Get the competition associated with the parent track
    const competitionQuery = `
      SELECT c.*, t.user_id as track_owner_id
      FROM competitions c
      JOIN tracks t ON c.track_id = t.id
      WHERE c.track_id = $1
    `;

    const competitionResult = await pool.query(competitionQuery, [parentTrackId]);

    if (competitionResult.rows.length === 0) {
      return {
        valid: false,
        error: 'The parent track is not associated with any competition'
      };
    }

    const competition = competitionResult.rows[0];
    const now = new Date();

    // Check if competition is active (between start and end dates)
    const startDate = new Date(competition.startdate);
    const endDate = new Date(competition.enddate);

    if (now < startDate) {
      return {
        valid: false,
        error: 'This competition has not started yet'
      };
    }

    if (now > endDate) {
      return {
        valid: false,
        error: 'This competition has ended'
      };
    }

    // Check if current user is NOT the owner of the competition track
    if (competition.track_owner_id === userId) {
      return {
        valid: false,
        error: 'You cannot enter your own competition'
      };
    }

    // Check if current user has already uploaded an entry for this competition
    const existingEntryQuery = `
      SELECT id FROM tracks
      WHERE parent_track_id = $1
      AND user_id = $2
      AND is_competition_entry = true
      AND competition_id = $3
    `;

    const existingEntryResult = await pool.query(existingEntryQuery, [
      parentTrackId,
      userId,
      competition.id
    ]);

    if (existingEntryResult.rows.length > 0) {
      return {
        valid: false,
        error: 'You have already entered this competition'
      };
    }

    // If all checks pass, return success
    return {
      valid: true,
      competitionId: competition.id
    };

  } catch (error) {
    console.error('Error validating competition entry:', error);
    return {
      valid: false,
      error: 'Failed to validate competition entry'
    };
  }
};

module.exports = {
  validateCompetitionEntry
};
