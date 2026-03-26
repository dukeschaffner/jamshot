import express from 'express';
import pool from '../config/db.js';
import { adminMiddleware } from '../middleware/adminMiddleware.js';
import { processTrack } from '../utils/trackUtils.js';

const router = express.Router();
const ALLOWED_MODERATION_REASONS = [
  'Copyright infringement',
  'Spam',
  'Hate speech or discriminatory content',
  'Explicit sexual content'
];

// Apply admin middleware to all routes
router.use(adminMiddleware);

// Get tracks waiting for approval by root ID with cursor pagination
router.get('/moderation/tracks/:rootId', async (req, res, next) => {
  try {
    const { rootId } = req.params;
    const { cursor, limit = 15 } = req.query;

    // Validate rootId is a number
    const rootIdNum = parseInt(rootId);
    if (isNaN(rootIdNum)) {
      return res.status(400).json({ error: 'Invalid root ID' });
    }

    const limitNum = Math.min(parseInt(limit), 50); // Max 50 per page

    let query = `
      SELECT
        t.id, t.user_id, t.title, t.audio_url, t.combined_audio_url, t.duration,
        t.layer, t.parent_track_id, t.root_id, t.created_at, t.play_count,
        t.is_private, t.is_loop, t.metronome_bpm, t.time_signature,
        t.allow_download, t.processing_status, t.camp_id, t.room_id,
        t.team_id, t.team_folder_id, t.key, t.guid, t.collab_count,
        t.like_count, t.repost_count, t.comment_count,
        u.username, u.name, u.verified, u.profile_pic_url,
        t.waveform_url, t.combined_waveform_url
      FROM tracks t
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.root_id = $1 AND t.processing_status = 'waiting_for_approval'
    `;

    const queryParams = [rootIdNum];

    // Add cursor condition if provided
    if (cursor) {
      const cursorNum = parseInt(cursor);
      if (!isNaN(cursorNum)) {
        query += ' AND t.id > $2';
        queryParams.push(cursorNum);
      }
    }

    query += ' ORDER BY t.created_at ASC';

    // Add limit
    query += ` LIMIT $${queryParams.length + 1}`;
    queryParams.push(limitNum + 1); // +1 to check if there are more results

    const result = await pool.query(query, queryParams);

    const hasMore = result.rows.length > limitNum;
    const tracks = hasMore ? result.rows.slice(0, -1) : result.rows;

    // Process tracks using the utility function
    const processedTracks = await Promise.all(tracks.map(track => processTrack(track, null)));

    res.json({
      tracks: processedTracks,
      pagination: {
        hasMore,
        cursor: processedTracks.length > 0 ? processedTracks[processedTracks.length - 1]?.id : null,
        limit: limitNum
      }
    });

  } catch (err) {
    next(err);
  }
});

// Approve a track
router.post('/moderation/tracks/:trackId/approve', async (req, res, next) => {
  try {
    const { trackId } = req.params;

    // Validate trackId is a number
    const trackIdNum = parseInt(trackId);
    if (isNaN(trackIdNum)) {
      return res.status(400).json({ error: 'Invalid track ID' });
    }

    // Check if track exists and is waiting for approval
    const trackCheck = await pool.query(
      'SELECT processing_status FROM tracks WHERE id = $1',
      [trackIdNum]
    );

    if (trackCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Track not found' });
    }

    if (trackCheck.rows[0].processing_status !== 'waiting_for_approval') {
      return res.status(400).json({
        error: 'Track is not waiting for approval',
        current_status: trackCheck.rows[0].processing_status
      });
    }

    // Update track status to completed
    await pool.query(
      'UPDATE tracks SET processing_status = $1 WHERE id = $2',
      ['completed', trackIdNum]
    );

    res.json({ message: 'Track approved successfully' });

  } catch (err) {
    next(err);
  }
});

// Reject a track with reason
router.post('/moderation/tracks/:trackId/reject', async (req, res, next) => {
  try {
    const { trackId } = req.params;
    const { reason } = req.body;

    // Validate required fields
    if (!reason) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    // Validate reason is one of the allowed values
    if (!ALLOWED_MODERATION_REASONS.includes(reason)) {
      return res.status(400).json({
        error: 'Invalid rejection reason',
        allowed_reasons: ALLOWED_MODERATION_REASONS
      });
    }

    // Validate trackId is a number
    const trackIdNum = parseInt(trackId);
    if (isNaN(trackIdNum)) {
      return res.status(400).json({ error: 'Invalid track ID' });
    }

    // Check if track exists and is waiting for approval
    const trackCheck = await pool.query(
      'SELECT processing_status, user_id FROM tracks WHERE id = $1',
      [trackIdNum]
    );

    if (trackCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Track not found' });
    }

    if (trackCheck.rows[0].processing_status !== 'waiting_for_approval') {
      return res.status(400).json({
        error: 'Track is not waiting for approval',
        current_status: trackCheck.rows[0].processing_status
      });
    }

    const trackOwnerId = trackCheck.rows[0].user_id;

    // Update track status to rejected and set rejection reason
    await pool.query(
      'UPDATE tracks SET processing_status = $1, rejection_reason = $2 WHERE id = $3',
      ['rejected', reason, trackIdNum]
    );

    // Create notification for track owner
    try {
      await pool.query(
        'INSERT INTO notifications (user_id, type, related_track_id, related_user_id) VALUES ($1, $2, $3, $4)',
        [trackOwnerId, 'track_rejected', trackIdNum, req.user.id]
      );
    } catch (notificationError) {
      console.error('Error creating rejection notification:', notificationError);
      // Continue execution even if notification creation fails
    }

    res.json({
      message: 'Track rejected successfully',
      rejection_reason: reason
    });

  } catch (err) {
    next(err);
  }
});

// Ban a user from uploading
router.post('/user/:userId/ban', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const type = req.body?.type || req.query?.type || 'upload';
    const reason = req.body?.reason || req.query?.reason;
    const expiresAtRaw = req.body?.expires_at || req.query?.expires_at;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    if (type !== 'upload') {
      return res.status(400).json({
        error: 'Invalid ban type',
        allowed_types: ['upload']
      });
    }

    if (!reason) {
      return res.status(400).json({ error: 'Ban reason is required' });
    }

    if (!ALLOWED_MODERATION_REASONS.includes(reason)) {
      return res.status(400).json({
        error: 'Invalid ban reason',
        allowed_reasons: ALLOWED_MODERATION_REASONS
      });
    }

    if (!expiresAtRaw) {
      return res.status(400).json({ error: 'expires_at is required' });
    }

    const expiresAt = new Date(expiresAtRaw);
    if (Number.isNaN(expiresAt.getTime())) {
      return res.status(400).json({ error: 'Invalid expires_at timestamp' });
    }

    const userExists = await pool.query(
      'SELECT id FROM users WHERE id = $1',
      [userId]
    );
    if (userExists.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const banResult = await pool.query(
      `INSERT INTO user_bans (user_id, ban_type, reason, created_by, expires_at)
       VALUES ($1, $2, $3, $4, ($5::timestamptz AT TIME ZONE 'UTC'))
       RETURNING id, user_id, ban_type, reason, created_by, created_at, expires_at`,
      [userId, type, reason, req.user.id, expiresAt.toISOString()]
    );

    res.status(201).json({
      message: 'User banned successfully',
      ban: banResult.rows[0]
    });
  } catch (err) {
    next(err);
  }
});

export default router;