import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { betterAuthMiddleware, optionalBetterAuthMiddleware } from '../middleware/betterAuthMiddleware.js';

const __filename = import.meta.url ? fileURLToPath(import.meta.url) : __filename;
const __dirname = import.meta.url ? dirname(__filename) : process.cwd();

import * as mm from 'music-metadata';
import pool from '../config/db.js';
import { 
  uploadLimiter, 
  contentCreationLimiter, 
  interactionLimiter, 
  apiEndpointLimiter 
} from '../middleware/rateLimiting.js';
import {
  s3Client,
  generateSignedUrl,
  processTrack,
  downloadS3File,
  moveS3File,
  checkTrackAccess,
  generateSecureToken,
  generateUploadUrl,
  generateTrackFilenameBase,
  generateStandardTrackFilename,
  getBaseTrackSelectQuery,
  getPopularFeedQuery,
  getFollowingFeedQuery,
  getForYouFeedQuery,
  findAllDescendantTracks,
  deleteTrack,
  getStemChain,
  validateAndUpdateStemChain,
  parseTrackUploadBody,
  getActiveUploadBan,
  createCollaborationNotification
} from '../utils/trackUtils.js';
import { getUserPlan, checkDailyUploadQuota, checkTotalUploadQuota, checkTeamDailyUploadQuota, checkTeamTotalUploadQuota, getTeamPlan } from '../utils/subscriptionUtils.js';
import { getGeolocationData } from '../utils/geolocation.js';
import { validateCompetitionEntry } from '../utils/competition.js';
import { validateTeamAccess, validateTeamFolderAccess } from '../utils/teamUtils.js';
import { isFeatureEnabled } from '../utils/featureFlags.js';
import { checkVideoExportLimit } from '../utils/videoExportUtils.js';

/**
 * Checks if a track has a status that prevents normal access
 * Returns appropriate error response for tracks waiting for approval or rejected
 */
async function checkTrackStatus(trackId) {
  const result = await pool.query(
    'SELECT processing_status, rejection_reason FROM tracks WHERE id = $1',
    [trackId]
  );

  if (result.rows.length === 0) {
    return null; // Track not found, let caller handle
  }

  const track = result.rows[0];

  if (track.processing_status === 'waiting_for_approval') {
    return {
      status: 400,
      error: {
        code: 'TRACK_WAITING_FOR_APPROVAL',
        message: 'This track is waiting for moderator approval. Please check back later.'
      }
    };
  }

  if (track.processing_status === 'rejected') {
    return {
      status: 400,
      error: {
        code: 'TRACK_REJECTED',
        message: 'This track was rejected by moderators.',
        rejection_reason: track.rejection_reason
      }
    };
  }

  return null; // Track is accessible
}

/**
 * Sanitizes error messages to prevent exposing detailed server-side errors to clients.
 * Returns generic user-friendly error messages for audio processing and upload errors.
 */
function sanitizeErrorForClient(error, isProcessingError = false) {
  // For known user-facing errors (like quota limits), return as-is
  if (error && typeof error === 'string') {
    // Check if it's a user-facing error (quota limits, validation errors, etc.)
    const userFacingPatterns = [
      /daily upload limit/i,
      /total track limit/i,
      /private tracks are not allowed/i,
      /track not found/i,
      /access denied/i,
      /unauthorized/i,
      /forbidden/i
    ];
    
    if (userFacingPatterns.some(pattern => pattern.test(error))) {
      return error;
    }
  }
  
  // For processing errors, return generic message
  if (isProcessingError) {
    return 'Audio processing failed. Please try uploading again or contact support if the issue persists.';
  }
  
  // For upload errors, return generic message
  return 'Upload failed. Please check your connection and try again. If the problem persists, contact support.';
}

async function getParser() {
  if (typeof mm.parseFile === 'function') {
    // Local dev: parseFile available directly
    return mm;
  }

  if (typeof mm.loadMusicMetadata === 'function') {
    // Lambda / CJS environment: dynamically load
    return await mm.loadMusicMetadata();
  }

  throw new Error('No parseFile or loadMusicMetadata found in music-metadata');
}

// Audio processing is now handled by the dedicated audio-processing lambda

// Initialize EventBridge client for production audio processing triggers
const eventBridgeClient = new EventBridgeClient({
  region: process.env.AWS_REGION || 'us-east-2'
});

// Initialize Lambda client for video export processing
const lambdaClient = new LambdaClient({
  region: process.env.AWS_REGION || 'us-east-2'
});

// Determine which event bus to use based on environment
const getEventBusName = () => {
  const env = process.env.NODE_ENV;
  if (env === 'production') return 'sterio-prod-events';
  if (env === 'test') return 'sterio-test-events';
  // Default to test for safety in unknown environments
  return 'sterio-test-events';
};

const router = express.Router();

const tempDir = process.env.NODE_ENV !== 'dev' ? '/tmp' : path.join(__dirname, '../../temp');

// Multer setup - Disk storage for large files
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      // Ensure temp directory exists
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      cb(null, tempDir);
    },
    filename: (req, file, cb) => {
      // Generate unique filename to avoid conflicts
      const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}-${file.originalname}`;
      cb(null, uniqueName);
    }
  }),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit for 5min 24-bit audio
});

// Apply optional auth middleware to all routes
router.use(optionalBetterAuthMiddleware);

// Audio processing health check is now handled by the audio-processing lambda



/*

Track Load Configurations

Full Track
a) Columns from tracks table:
- id
- user_id
- title
- audio_url
- combined_audio_url
- duration
- parent_track_id
- is_private
- created_at
- play_count
- layer
- metronome_bpm
- time_signature

b) Other properties:
- artist username
- artist profile pic url
- artist verified status
- parent track title (if it exists)
- like count
- collab count
- comment count
- repost count
- is_liked
- is_reposted
- track tags (captured by processtrack function)

Endpoints:
track by id endpoint
feed endpoints
user track endpoint
id/tree endpoint
*/



// Multer error handling wrapper
const handleMulterError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    console.error('Multer error:', error);
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 100MB.' });
    }
    return res.status(400).json({ error: `Upload error: ${error.message}` });
  } else if (error) {
    console.error('Unknown upload error:', error);
    return res.status(400).json({ error: `Upload error: ${error.message}` });
  }
  next();
};









// Initialize upload by generating pre-signed S3 URL
router.post('/upload/init', uploadLimiter, betterAuthMiddleware, async (req, res, next) => {
  try {
    const { filename, fileSize, is_camp_track, team_id } = req.body;
    const userId = req.user.id;

    const activeUploadBan = await getActiveUploadBan(userId);
    if (activeUploadBan) {
      return res.status(403).json({
        error: 'USER_BANNED',
        ban_type: activeUploadBan.ban_type,
        message: activeUploadBan.reason
          ? `You are temporarily blocked from uploading due to ${activeUploadBan.reason.toLowerCase()}.`
          : 'You are temporarily blocked from uploading.',
        expires_at: activeUploadBan.expires_at
      });
    }

    if (!filename || !fileSize) {
      return res.status(400).json({ error: 'filename and fileSize are required' });
    }

    if (fileSize > 100 * 1024 * 1024) { // 100MB limit
      return res.status(400).json({ error: 'File size exceeds maximum limit of 100MB' });
    }

    // Skip quota validations for camp tracks and team uploads
    if (!is_camp_track && !team_id) {
      // Check user's subscription limits (but don't consume them yet)
      const userResult = await pool.query(
        'SELECT subscription_tier, subscription_expires_at FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const user = userResult.rows[0];
      const subscription = getUserPlan(user);

      // Check if user has reached their daily upload limit
      const dailyQuotaCheck = await checkDailyUploadQuota(userId, user, subscription);
      if (dailyQuotaCheck) {
        return res.status(dailyQuotaCheck.status).json(dailyQuotaCheck.body);
      }

      // Check if user has reached their total track limit
      const totalQuotaCheck = await checkTotalUploadQuota(userId, user, subscription);
      if (totalQuotaCheck) {
        return res.status(totalQuotaCheck.status).json(totalQuotaCheck.body);
      }
    }

    // Generate filename base for consistent naming throughout the upload process
    const filenameBase = generateTrackFilenameBase();

    // Generate pre-signed upload URL with the filename base
    const uploadData = await generateUploadUrl(userId, filename, fileSize, filenameBase);

    res.json({
      uploadUrl: uploadData.uploadUrl,
      key: uploadData.key,
      filenameBase: uploadData.filenameBase,
      expiresAt: uploadData.expiresAt,
      maxSize: 100 * 1024 * 1024 // 100MB
    });
  } catch (err) {
    next(err);
  }
});

// Process upload after S3 upload is complete
router.post('/upload', uploadLimiter, betterAuthMiddleware, async (req, res, next) => {
  try {
    const userId = req.user.id;
    let layer = 0;
    let parentIsPrivate = false;
    let parentSecretToken = null;
    let isCompetitionEntry = false;
    let competitionId = null;
    let parentTrack = null;
    let isLoop = false;

    let {
      title,
      parent_track_id,
      enter_competition,
      s3Key,
      parsedGenreIds,
      parsedInstrumentIds,
      parsedElementIds,
      parsedInstrumentRequestIds,
      parsedElementRequestIds,
      parsedMetronomeBpm,
      parsedStems,
      parsedTimeSignature,
      isPrivate,
      allowDownload,
      parsedMetronomeOffset,
      camp_id,
      room_id,
      team_id,
      folder_id,
      key
    } = parseTrackUploadBody(req.body);

    if (!s3Key) return res.status(400).json({ error: 's3Key is required' });

    // Validate S3 key format
    if (!s3Key.startsWith('uploads/temp/') || !s3Key.includes(`/${userId}/`)) {
      return res.status(400).json({ error: 'Invalid S3 key format' });
    }

    // Download file from S3 for validation
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    var localFilePath = path.join(tempDir, `validation-${Date.now()}-${path.basename(s3Key)}`);

    await downloadS3File(s3Key, localFilePath);

    // Skip quota validations for camp tracks and team uploads
    if (!camp_id && !team_id) {
      // Get user and subscription for quota checks and later use
      const userResult = await pool.query(
        'SELECT subscription_tier, subscription_expires_at FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const user = userResult.rows[0];
      const subscription = getUserPlan(user);

      // Check if user has reached their daily upload limit
      const dailyQuotaCheck = await checkDailyUploadQuota(userId, user, subscription);
      if (dailyQuotaCheck) {
        return res.status(dailyQuotaCheck.status).json(dailyQuotaCheck.body);
      }

      // Check if user has reached their total track limit
      const totalQuotaCheck = await checkTotalUploadQuota(userId, user, subscription);
      if (totalQuotaCheck) {
        return res.status(totalQuotaCheck.status).json(totalQuotaCheck.body);
      }
    }

    let duration;
    const parser = await getParser();
    const metadata = await parser.parseFile(localFilePath);
    duration = metadata.format.duration;

    // Validate track duration (max 5 minutes = 300 seconds)
    if (duration > 5 * 60) {
      return res.status(400).json({ error: 'Track duration exceeds the maximum limit of 5 minutes' });
    }



    // Get the complete stem chain for mixing
    let stemChain = parent_track_id ? await getStemChain(parent_track_id) : [];
    const validation = validateAndUpdateStemChain(stemChain, parsedStems);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Invalid stem chain or stems',
        message: validation.error
      });
    }


    // Set audio_url to the permanent temp S3 location for audio processing lambda
    // The lambda will extract the base and derive final URLs
    const audioUrl = s3Key.replace('uploads/temp/', 'temp/tracks/');

    // Validate collaboration logic (but don't do audio processing yet)

    let rootId = null;
    if (parent_track_id) {
      const parentResult = await pool.query(
        'SELECT duration, is_private, secret_token, layer, metronome_bpm, time_signature, metronome_offset, team_id, team_folder_id, is_loop, root_id FROM tracks WHERE id = $1',
        [parent_track_id]
      );
      if (parentResult.rows.length === 0) {
        return res.status(400).json({ error: 'Parent track not found' });
      }

      parentTrack = parentResult.rows[0];
      // Set root_id to parent's root_id (or parent's id if parent is root)
      rootId = parentTrack.root_id || parent_track_id;
      const parentDuration = parentTrack.duration;

      // Store parent privacy status and secret token
      parentIsPrivate = parentTrack.is_private;
      parentSecretToken = parentTrack.secret_token;

      isPrivate = parentIsPrivate;

      parsedMetronomeBpm = parentTrack.metronome_bpm;
      parsedTimeSignature = parentTrack.time_signature;
      // Use parent's metronome offset for collaborations
      parsedMetronomeOffset = parentTrack.metronome_offset || 0;
      
      // Inherit is_loop from parent track for collaborations
      isLoop = parentTrack.is_loop || false;

      // Validate that collaboration isn't longer than parent track
      // if (duration > parentDuration) {
      //   return res.status(400).json({ error: 'Collaboration track cannot be longer than the original track' });
      // }

      layer = (parentTrack.layer ?? 0) + 1;
      if (layer > 4) {
        return res.status(400).json({ error: 'Layer limit reached' });
      }

      // Validate competition entry only if user opted in and parent track exists
      if (enter_competition == true) {
        // Check if parent track is associated with a competition
        const parentCompetitionCheck = await pool.query(
          'SELECT c.id FROM competitions c WHERE c.track_id = $1',
          [parent_track_id]
        );

        if (parentCompetitionCheck.rows.length > 0) {
          // Parent track is a competition track, validate if this can be an entry
          const competitionValidation = await validateCompetitionEntry(parent_track_id, userId);

          if (!competitionValidation.valid) {
            return res.status(400).json({
              error: 'Competition entry validation failed',
              message: competitionValidation.error
            });
          }

          // Validation passed, set competition entry flags
          isCompetitionEntry = true;
          competitionId = competitionValidation.competitionId;
        }
      }
    } else {
      // If no parent track, check private track restrictions
      if (!camp_id) {
        // Check if subscriptions feature is enabled
        const subscriptionsEnabled = await isFeatureEnabled('subscriptions', false);
        
        // If subscriptions disabled, block private tracks
        if (!subscriptionsEnabled && isPrivate) {
          return res.status(400).json({
            error: 'Private tracks are not available at this time.'
          });
        }
        
        // If subscriptions enabled, check subscription tier
        if (subscriptionsEnabled && isPrivate && !subscription.features.private_tracks) {
          return res.status(400).json({
            error: 'Private tracks are not allowed for your subscription tier. Upgrade your plan to enable private tracks.',
            upgrade_link: `${process.env.FRONTEND_URL || ''}/subscribe`
          });
        }
      }
    }

    // Camp/Room validation for songwriting camps
    if (camp_id) {
      // Validate camp exists, is active, and user is a member
      const campResult = await pool.query(
        'SELECT c.id, c.start_date, c.end_date, uc.role FROM camps c JOIN user_camps uc ON c.id = uc.camp_id WHERE c.id = $1 AND uc.user_id = $2',
        [camp_id, userId]
      );

      if (campResult.rows.length === 0) {
        return res.status(403).json({ error: 'You are not a member of this camp or the camp does not exist' });
      }

      const camp = campResult.rows[0];
      const now = new Date();

      // Check if camp is still active
      if (now > new Date(camp.end_date)) {
        return res.status(400).json({ error: 'This camp has ended' });
      }

      // All camp tracks/beats must be private
      isPrivate = true;

      // Validate room exists and belongs to this camp
      if (room_id) {
        const roomResult = await pool.query(
          'SELECT id FROM rooms WHERE id = $1 AND camp_id = $2',
          [room_id, camp_id]
        );

        if (roomResult.rows.length === 0) {
          return res.status(400).json({ error: 'Room does not exist in this camp' });
        }
      }

      if (parent_track_id) {
        // This is a Track (collaboration on a beat) - camp must have started
        if (now < new Date(camp.start_date)) {
          return res.status(400).json({ error: 'Track uploads are not allowed until the camp has started' });
        }

        // If parent track has a room_id, descendants must inherit it
        const parentRoomCheck = await pool.query(
          'SELECT room_id FROM tracks WHERE id = $1',
          [parent_track_id]
        );

        if (parentRoomCheck.rows.length > 0 && parentRoomCheck.rows[0].room_id) {
          room_id = parentRoomCheck.rows[0].room_id;
        }

        if (!room_id) { // no room_id provided and parent track has no room_id, use user's current room_id
          const userRoomResult = await pool.query(
            `SELECT ur.room_id 
             FROM user_rooms ur
             JOIN rooms r ON ur.room_id = r.id
             WHERE ur.user_id = $1 AND r.camp_id = $2`,
            [userId, camp_id]
          );
          if (userRoomResult.rows.length > 0) {
            room_id = userRoomResult.rows[0].room_id;
          }
        }
      } else {
        // This is a Beat upload - no room validation needed for beats
        // Room assignment happens when someone starts an idea from a beat or uploads track to room
      }
    }
    else if (team_id || (parent_track_id && parentTrack && parentTrack.team_id)) {
      // Inherit team_id and team_folder_id from parent track for collaborations
      if (parent_track_id && parentTrack && parentTrack.team_id) {
        team_id = parentTrack.team_id;
        // Inherit folder_id from parent if parent has one
        if (parentTrack.team_folder_id) {
          folder_id = parentTrack.team_folder_id;
        }
      }

      // Validate team access
      const teamAccessValidation = await validateTeamAccess(team_id, userId);
      if (!teamAccessValidation.valid) {
        return res.status(403).json({ error: teamAccessValidation.error });
      }

      const team = teamAccessValidation.team;
      // Get team plan once and reuse it for both quota checks
      const teamPlan = getTeamPlan(team.product_version);
      if (!teamPlan) {
        return res.status(400).json({ error: 'Invalid team product version' });
      }


      // Check if team has reached their daily upload limit
      const teamDailyQuotaCheck = await checkTeamDailyUploadQuota(team_id, team, teamPlan);
      if (teamDailyQuotaCheck) {
        return res.status(teamDailyQuotaCheck.status).json(teamDailyQuotaCheck.body);
      }

      // Check if team has reached their total track limit
      const teamTotalQuotaCheck = await checkTeamTotalUploadQuota(team_id, team, teamPlan);
      if (teamTotalQuotaCheck) {
        return res.status(teamTotalQuotaCheck.status).json(teamTotalQuotaCheck.body);
      }

      // Validate folder access if folder_id is provided
      // Pass team object to avoid redundant team access validation
      if (folder_id) {
        const folderValidation = await validateTeamFolderAccess(folder_id, team_id, userId, team);
        if (!folderValidation.valid) {
          return res.status(403).json({ error: folderValidation.error });
        }
      }

      // Team tracks should be private by default
      isPrivate = true;
    }

    // Phase 1: Insert track with placeholder mix_gains
    // Create a copy of stem chain without audio_url property for placeholder
    const stemChainToInsert = stemChain.map(stem => ({
      track_id: stem.track_id,
      gain: stem.gain,
      order: stem.order,
      // Include regions if present
      ...(stem.regions && { regions: stem.regions })
    }));

    let mixGainsToInsert = {
      stems: stemChainToInsert
    };

    const result = await pool.query(
        'INSERT INTO tracks (user_id, title, audio_url, duration, parent_track_id, metronome_bpm, layer, time_signature, is_private, secret_token, metronome_offset, allow_download, is_competition_entry, competition_id, mix_gains, processing_status, camp_id, room_id, team_id, team_folder_id, key, guid, is_loop, root_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, gen_random_uuid(), $22, $23) RETURNING *',
        [userId, title, audioUrl, duration, parent_track_id || null, parsedMetronomeBpm, layer, parsedTimeSignature, isPrivate, parentSecretToken, parsedMetronomeOffset, allowDownload, isCompetitionEntry, competitionId, JSON.stringify(mixGainsToInsert), 'processing', camp_id, room_id, team_id, folder_id, key, isLoop, rootId]
    );

    const trackId = result.rows[0].id;

    // If no parent (root track), set root_id to track's own id
    if (!parent_track_id) {
      await pool.query(
        'UPDATE tracks SET root_id = $1 WHERE id = $1',
        [trackId]
      );
    }

    // Phase 2: update stem for recording: change trackId to the new trackId
    const recordingStem = stemChainToInsert.find(s => s.track_id === 'recording');
    if (recordingStem) {
      recordingStem.track_id = trackId;
    }
    const completeMixGains = {
      stems: stemChainToInsert
    };

    // Update with complete stem information
    await pool.query(
      'UPDATE tracks SET mix_gains = $1 WHERE id = $2',
      [JSON.stringify(completeMixGains), trackId]
    );
    
    // Create collaboration notification unless this is a moderated loop track.
    // In that case, defer notification until moderator approval.
    if (parent_track_id) {
      try {
        const moderationEnabled = await isFeatureEnabled('moderation', false);
        const shouldDeferCollabNotification = Boolean(isLoop && moderationEnabled);

        if (!shouldDeferCollabNotification) {
          await createCollaborationNotification(parent_track_id, userId, trackId);
        }
      } catch (err) {
        console.error('Error creating collaboration notification:', err);
        // Continue execution even if notification creation fails
      }
    }
    
    // Add genres if provided
    if (parsedGenreIds && parsedGenreIds.length > 0) {
      for (const genreId of parsedGenreIds) {
        await pool.query(
          'INSERT INTO track_genres (track_id, genre_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [trackId, genreId]
        );
      }
    }
    
    // Add instruments if provided
    if (parsedInstrumentIds && parsedInstrumentIds.length > 0) {
      for (const instrumentId of parsedInstrumentIds) {
        await pool.query(
          'INSERT INTO track_instruments (track_id, instrument_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [trackId, instrumentId]
        );
      }
    }
    
    // Validate and add elements if provided (max 2)
    if (parsedElementIds && parsedElementIds.length > 0) {
      if (parsedElementIds.length > 2) {
        return res.status(400).json({ error: 'Maximum 2 elements allowed per track' });
      }
      for (const elementId of parsedElementIds) {
        await pool.query(
          'INSERT INTO track_elements (track_id, element_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [trackId, elementId]
        );
      }
    }
    
    // Validate and add instrument requests if provided (max 2)
    if (parsedInstrumentRequestIds && parsedInstrumentRequestIds.length > 0) {
      if (parsedInstrumentRequestIds.length > 2) {
        return res.status(400).json({ error: 'Maximum 2 instrument requests allowed per track' });
      }
      for (const instrumentId of parsedInstrumentRequestIds) {
        await pool.query(
          'INSERT INTO track_instrument_requests (track_id, instrument_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [trackId, instrumentId]
        );
      }
    }
    
    // Validate and add element requests if provided (max 2)
    if (parsedElementRequestIds && parsedElementRequestIds.length > 0) {
      if (parsedElementRequestIds.length > 2) {
        return res.status(400).json({ error: 'Maximum 2 element requests allowed per track' });
      }
      for (const elementId of parsedElementRequestIds) {
        await pool.query(
          'INSERT INTO track_element_requests (track_id, element_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [trackId, elementId]
        );
      }
    }

    // Clean up the downloaded file from disk storage
    await fsPromises.unlink(localFilePath).catch(err => console.error('Upload file cleanup error:', err));

    // Move S3 file to permanent temp location for processing
    const permanentTempKey = s3Key.replace('uploads/temp/', 'temp/tracks/');
    await moveS3File(s3Key, permanentTempKey);

    // Emit EventBridge event to trigger audio processing (production only)
    if (process.env.NODE_ENV !== 'dev') {
      try {
        const eventParams = {
          Entries: [
            {
              Source: 'sterio.tracks',
              DetailType: 'track_created',
              Detail: JSON.stringify({
                track_id: trackId,
                user_id: userId,
                s3_key: permanentTempKey,
                correlation_id: req.correlationId,
                created_at: new Date().toISOString()
              }),
              EventBusName: getEventBusName()
            }
          ]
        };

        const eventCommand = new PutEventsCommand(eventParams);
        await eventBridgeClient.send(eventCommand);
        console.log(`✅ EventBridge event emitted for track ${trackId}`);
      } catch (eventError) {
        console.error('❌ Failed to emit EventBridge event:', eventError);
        // Don't fail the upload, just log the error
      }
    } else {
      console.log(`🔧 Skipping EventBridge event emission (dev mode) - track ${trackId} will be processed by local monitor`);
    }

    res.status(201).json({
      ...result.rows[0],
      processing_status: 'processing'
    });
  } catch (err) {
    // Clean up downloaded file on error
    if (localFilePath) {
      await fsPromises.unlink(localFilePath).catch(cleanupErr => console.error('Upload file cleanup error:', cleanupErr));
    }

    next(err);
  }
});

// Get "For You" feed (mixed content - followed users + popular)
router.get('/feed/for-you', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { page = 1, limit = 5, genreIds, instrumentIds, elementIds, instrumentRequestIds, elementRequestIds } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    // Parse tag filter parameters
    const tagFilters = {};
    if (genreIds) tagFilters.genreIds = genreIds.split(',').map(id => parseInt(id));
    if (instrumentIds) tagFilters.instrumentIds = instrumentIds.split(',').map(id => parseInt(id));
    if (elementIds) tagFilters.elementIds = elementIds.split(',').map(id => parseInt(id));
    if (instrumentRequestIds) tagFilters.instrumentRequestIds = instrumentRequestIds.split(',').map(id => parseInt(id));
    if (elementRequestIds) tagFilters.elementRequestIds = elementRequestIds.split(',').map(id => parseInt(id));

    let query;
    let queryParams;

    // Mixed feed: combination of followed artists, their reposts, and popular tracks
    if (userId) {
      // Use the standardized For You feed query function
      query = getForYouFeedQuery(2, 3, tagFilters);
      queryParams = [userId, limitNum, offset];
    } else {
      // For non-logged in users, just show popular tracks
      query = getPopularFeedQuery(false, null, 1, 2, false, tagFilters);
      queryParams = [limitNum, offset];
    }

    const result = await pool.query(query, queryParams);

    // Use the processTrack utility function
    const tracks = await Promise.all(result.rows.map(track => processTrack(track, userId)));

    res.json(tracks);
  } catch (err) {
    next(err);
  }
});

// Get Following feed (just followed artists)
router.get('/feed/following', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { page = 1, limit = 5, genreIds, instrumentIds, elementIds, instrumentRequestIds, elementRequestIds } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Parse tag filter parameters
    const tagFilters = {};
    if (genreIds) tagFilters.genreIds = genreIds.split(',').map(id => parseInt(id));
    if (instrumentIds) tagFilters.instrumentIds = instrumentIds.split(',').map(id => parseInt(id));
    if (elementIds) tagFilters.elementIds = elementIds.split(',').map(id => parseInt(id));
    if (instrumentRequestIds) tagFilters.instrumentRequestIds = instrumentRequestIds.split(',').map(id => parseInt(id));
    if (elementRequestIds) tagFilters.elementRequestIds = elementRequestIds.split(',').map(id => parseInt(id));

    // Use the standardized following feed query function
    const query = getFollowingFeedQuery(2, 3, tagFilters);
    const queryParams = [userId, limitNum, offset];

    const result = await pool.query(query, queryParams);

    // Use the processTrack utility function
    const tracks = await Promise.all(result.rows.map(track => processTrack(track, userId)));

    res.json(tracks);
  } catch (err) {
    next(err);
  }
});

// Get Popular feed (globally popular tracks)
router.get('/feed/popular', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { page = 1, limit = 5, genreIds, instrumentIds, elementIds, instrumentRequestIds, elementRequestIds } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    // Parse tag filter parameters
    const tagFilters = {};
    if (genreIds) tagFilters.genreIds = genreIds.split(',').map(id => parseInt(id));
    if (instrumentIds) tagFilters.instrumentIds = instrumentIds.split(',').map(id => parseInt(id));
    if (elementIds) tagFilters.elementIds = elementIds.split(',').map(id => parseInt(id));
    if (instrumentRequestIds) tagFilters.instrumentRequestIds = instrumentRequestIds.split(',').map(id => parseInt(id));
    if (elementRequestIds) tagFilters.elementRequestIds = elementRequestIds.split(',').map(id => parseInt(id));

    // Use the standardized popular feed query function
    let query;
    let queryParams;
    if (userId) {
      query = getPopularFeedQuery(!!userId, 1, 2, 3, true, tagFilters);
      queryParams = [userId, limitNum, offset];
    } else {
      query = getPopularFeedQuery(false, null, 1, 2, false, tagFilters);
      queryParams = [limitNum, offset];
    }

    const result = await pool.query(query, queryParams);

    // Use the processTrack utility function
    const tracks = await Promise.all(result.rows.map(track => processTrack(track, userId)));

    res.json(tracks);
  } catch (err) {
    next(err);
  }
});


// Get Track and Versions
router.get('/:id', optionalBetterAuthMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const { secret } = req.query; // Secret token for private tracks
    
    // Check if the track exists and if user has access
    const accessCheck = await checkTrackAccess(id, userId, secret);
    if (!accessCheck.hasAccess) {
      return res.status(accessCheck.status).json({ error: accessCheck.error });
    }

    // Use the numeric ID from accessCheck for the actual query
    const trackId = accessCheck.track.id;

    // Check if track has restricted status
    const statusCheck = await checkTrackStatus(trackId);
    if (statusCheck) {
      return res.status(statusCheck.status).json({ error: statusCheck.error });
    }

    let baseQuery;
    let queryParams;
    if (userId) {
      baseQuery = getBaseTrackSelectQuery(true, 2, true);
      queryParams = [trackId, userId];
    } else {
      baseQuery = getBaseTrackSelectQuery(false, 1, true);
      queryParams = [trackId];
    }

    const result = await pool.query(`
      SELECT 
        t.metronome_offset, ${baseQuery}
      FROM tracks t
      LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN users u2 ON t2.user_id = u2.id
      WHERE t.id = $1 OR t.parent_track_id = $1 
      ORDER BY t.created_at ASC
    `, queryParams);
    
    // Use the processTrack utility function to process all tracks
    const tracks = await Promise.all(result.rows.map(track => processTrack(track, userId)));
    
    res.json(tracks);
  } catch (err) {
    next(err);
  }
});

// Get stem chain for DAW loading
router.get('/:id/stems', optionalBetterAuthMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    // Check if user has access to the track
    const accessCheck = await checkTrackAccess(id, userId);
    if (!accessCheck.hasAccess) {
      return res.status(accessCheck.status).json({ error: accessCheck.error });
    }

    // Get the complete stem chain using the utility function
    const stemChain = await getStemChain(id);

    // Convert S3 URLs to signed URLs for client access
    const stemsWithSignedUrls = stemChain.map(stem => ({
      ...stem,
      audio_url: generateSignedUrl(stem.audio_url)
    }));

    res.json(stemsWithSignedUrls);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/related', async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const { page = 1, limit = 5, includeParent = true, includeChildCount = false } = req.query;
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    let baseQuery;
    let queryParams;
    const includeChildCountBool = includeChildCount === 'true';
    if (userId) {
      baseQuery = getBaseTrackSelectQuery(true, 2, false, includeChildCountBool);
      queryParams = [id, userId];
    } else {
      baseQuery = getBaseTrackSelectQuery(false, 1, false, includeChildCountBool);
      queryParams = [id];
    }
    // Only include the parent track and current track on the first page
    let combinedTracks = [];

    if (parseInt(page) === 1 && includeParent === true) {
      // First, get the parent track if it exists
      let parentTrackQuery = `
        SELECT
          ${baseQuery}
        FROM tracks t
        LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
        LEFT JOIN users u ON t.user_id = u.id
        WHERE (t.id = (SELECT parent_track_id FROM tracks WHERE id = $1)) AND t.processing_status = 'completed'
      `;

      const [parentTrackResult] = await Promise.all([
        pool.query(parentTrackQuery, queryParams),
      ]);

      // Add parent track if it exists
      if (parentTrackResult.rows.length > 0) {
        combinedTracks.push(parentTrackResult.rows[0]);
      }
    }
    
    // Then get the child tracks with pagination
    let childTracksQuery = `
      SELECT
        ${baseQuery}
      FROM tracks t
      LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.parent_track_id = $1 AND t.processing_status = 'completed'
      ORDER BY t.created_at DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;
    
    // Get the total count for pagination info
    let countQuery = `
      SELECT COUNT(*)
      FROM tracks
      WHERE parent_track_id = $1 AND processing_status = 'completed'
    `;
    
    // Execute queries for child tracks and count
    const [childTracksResult, countResult] = await Promise.all([
      pool.query(childTracksQuery, [...queryParams, limitNum, offset]),
      pool.query(countQuery, [id])
    ]);
    
    // Add child tracks
    combinedTracks = [...combinedTracks, ...childTracksResult.rows];
    
    // Process tracks
    const tracks = await Promise.all(combinedTracks.map(track => processTrack(track, userId)));
    
    // Get pagination info
    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / limitNum);
    
    res.json({
      tracks,
      pagination: {
        total: totalCount,
        page: parseInt(page),
        limit: limitNum,
        pages: totalPages,
        hasMore: parseInt(page) < totalPages
      }
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/related2', async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const { lastId, limit = 5, orderBy = 'newest', includeParent = true, includeChildCount = false } = req.query;
    
    const limitNum = parseInt(limit);
    const orderByNewest = orderBy !== 'oldest'; // Default to newest
    const includeChildCountBool = includeChildCount === 'true';

    let baseQuery;
    let queryParams;
    if (userId) {
      baseQuery = getBaseTrackSelectQuery(true, 2, false, includeChildCountBool);
      queryParams = [id, userId];
    } else {
      baseQuery = getBaseTrackSelectQuery(false, 1, false, includeChildCountBool);
      queryParams = [id];
    }

    // Only include the parent track on the first request (when lastId is not provided)
    let combinedTracks = [];
    
    if (!lastId && includeParent === 'true') {
      // First, get the parent track if it exists
      let parentTrackQuery = `
        SELECT
          ${baseQuery}
        FROM tracks t
        LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
        LEFT JOIN users u ON t.user_id = u.id
        WHERE (t.id = (SELECT parent_track_id FROM tracks WHERE id = $1)) AND t.processing_status = 'completed'
      `;

      const parentTrackResult = await pool.query(parentTrackQuery, queryParams);

      // Add parent track if it exists
      if (parentTrackResult.rows.length > 0) {
        combinedTracks.push(parentTrackResult.rows[0]);
      }
    }
    
    // Build the query for child tracks with cursor pagination using ID
    let childTracksQuery = `
      SELECT
        ${baseQuery}
      FROM tracks t
      LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.parent_track_id = $1 AND t.processing_status = 'completed'
    `;
    
    // Add cursor condition based on order using ID
    if (lastId) {
      if (orderByNewest) {
        // For newest first, get tracks with ID less than the cursor (assuming IDs are sequential)
        // We still order by created_at to respect the orderBy parameter
        childTracksQuery += ` AND t.id < $${queryParams.length + 1}`;
        queryParams.push(lastId);
      } else {
        // For oldest first, get tracks with ID greater than the cursor
        childTracksQuery += ` AND t.id > $${queryParams.length + 1}`;
        queryParams.push(lastId);
      }
    }
    
    // Add ordering by created_at to respect orderBy parameter
    if (orderByNewest) {
      childTracksQuery += ` ORDER BY t.created_at DESC`;
    } else {
      childTracksQuery += ` ORDER BY t.created_at ASC`;
    }
    
    // Add limit
    childTracksQuery += ` LIMIT $${queryParams.length + 1}`;
    queryParams.push(limitNum);
    
    // Execute query for child tracks
    const childTracksResult = await pool.query(childTracksQuery, queryParams);
    
    // Add child tracks
    combinedTracks = [...combinedTracks, ...childTracksResult.rows];
    
    // Process tracks
    const processedTracks = await Promise.all(combinedTracks.map(track => processTrack(track, userId)));
    
    // Calculate hasMore using a separate query with ID as cursor
    let hasMore = false;
    if (processedTracks.length > 0) {
      // Use the last child track (not parent) for hasMore calculation
      const childTracks = processedTracks.filter(track => track.parent_track_id === parseInt(id));
      if (childTracks.length > 0) {
        const lastTrackId = childTracks[childTracks.length - 1].id;
        
        // Check if there are more tracks after the last one using ID
        let hasMoreQuery = `
          SELECT 1
          FROM tracks
          WHERE parent_track_id = $1 
            AND processing_status = 'completed'
        `;
        
        const hasMoreParams = [id];
        
        if (orderByNewest) {
          hasMoreQuery += ` AND id < $2 ORDER BY created_at DESC LIMIT 1`;
          hasMoreParams.push(lastTrackId);
        } else {
          hasMoreQuery += ` AND id > $2 ORDER BY created_at ASC LIMIT 1`;
          hasMoreParams.push(lastTrackId);
        }
        
        const hasMoreResult = await pool.query(hasMoreQuery, hasMoreParams);
        hasMore = hasMoreResult.rows.length > 0;
      }
    }
    
    res.json({
      tracks: processedTracks,
      pagination: {
        hasMore
      }
    });
  } catch (err) {
    next(err);
  }
});

// Get track processing status
router.get('/:id/status', optionalBetterAuthMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    // Check if track exists and user has access
    const accessCheck = await checkTrackAccess(id, userId);
    if (!accessCheck.hasAccess) {
      return res.status(accessCheck.status).json({ error: accessCheck.error });
    }

    // Get processing status
    const result = await pool.query(
      'SELECT processing_status, processing_error, created_at FROM tracks WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Track not found' });
    }

    const track = result.rows[0];
    const status = track.processing_status || 'completed'; // Default to completed for existing tracks

    // Calculate estimated time for processing tracks
    let estimatedTimeRemaining = null;
    if (status === 'processing') {
      const createdAt = new Date(track.created_at);
      const now = new Date();
      const elapsedMs = now - createdAt;

      // Estimate 5 minutes max processing time
      const estimatedTotalMs = 5 * 60 * 1000;
      const remainingMs = Math.max(0, estimatedTotalMs - elapsedMs);

      if (remainingMs > 0) {
        estimatedTimeRemaining = Math.ceil(remainingMs / 1000); // seconds
      }
    }

    // Sanitize processing error if present
    const sanitizedError = track.processing_error 
      ? sanitizeErrorForClient(track.processing_error, true)
      : null;

    res.json({
      track_id: id,
      status: status,
      error: sanitizedError,
      estimated_time_remaining: estimatedTimeRemaining
    });

  } catch (err) {
    next(err);
  }
});

// Request video export for a track
// router.post('/:id/video-export', contentCreationLimiter, betterAuthMiddleware, async (req, res) => {
//   const { id } = req.params;
//   const userId = req.user.id;
//   const { start_time, duration } = req.body;

//   try {
//     // Verify user is track creator
//     const trackResult = await pool.query(
//       'SELECT id, user_id, guid, duration FROM tracks WHERE id = $1',
//       [id]
//     );

//     if (trackResult.rows.length === 0) {
//       return res.status(404).json({ error: 'Track not found' });
//     }

//     const track = trackResult.rows[0];
//     if (track.user_id !== userId) {
//       return res.status(403).json({ error: 'Only the track creator can export videos' });
//     }

//     // Check daily rate limit
//     const limitCheck = await checkVideoExportLimit(userId);
//     if (!limitCheck || !limitCheck.allowed) {
//       return res.status(429).json({
//         error: 'Daily video export limit reached',
//         message: `You've reached the daily limit of ${limitCheck?.limit || 5} video exports. Try again tomorrow.`,
//         count: limitCheck?.count || 0,
//         limit: limitCheck?.limit || 5
//       });
//     }

//     // Validate parameters
//     const startTime = start_time !== undefined ? parseFloat(start_time) : 0;
//     const videoDuration = duration !== undefined ? parseFloat(duration) : Math.min(track.duration, 90);
    
//     if (startTime < 0 || startTime >= track.duration) {
//       return res.status(400).json({ error: 'Invalid start time' });
//     }

//     if (videoDuration <= 0 || videoDuration > 90) {
//       return res.status(400).json({ error: 'Duration must be between 0 and 90 seconds' });
//     }

//     if (startTime + videoDuration > track.duration) {
//       return res.status(400).json({ error: 'Start time + duration exceeds track duration' });
//     }

//     // Create video export record
//     const exportResult = await pool.query(
//       `INSERT INTO video_exports (track_id, user_id, status, start_time, duration)
//        VALUES ($1, $2, 'pending', $3, $4)
//        RETURNING id, track_id, user_id, status, start_time, duration, created_at`,
//       [id, userId, startTime, videoDuration]
//     );

//     const exportJob = exportResult.rows[0];

//     // Invoke Lambda function asynchronously
//     try {
//       if(process.env.NODE_ENV !== 'dev') { // dev
//         const lambdaFunctionName = 'sterio-video-export' + (process.env.NODE_ENV === 'production' ? '' : '-test');
        
//         const invokeCommand = new InvokeCommand({
//           FunctionName: lambdaFunctionName,
//           InvocationType: 'Event', // Async invocation
//           Payload: JSON.stringify({
//             export_id: exportJob.id,
//             track_id: id,
//             track_guid: track.guid,
//             start_time: startTime,
//             duration: videoDuration
//           })
//         });

//         await lambdaClient.send(invokeCommand);
//       }
      
//       // Update status to processing
//       await pool.query(
//         'UPDATE video_exports SET status = $1 WHERE id = $2',
//         ['processing', exportJob.id]
//       );

//       res.json({
//         export_id: exportJob.id,
//         track_id: id,
//         status: 'processing',
//         start_time: startTime,
//         duration: videoDuration,
//         created_at: exportJob.created_at
//       });
//     } catch (lambdaError) {
//       console.error('Error invoking video export Lambda:', lambdaError);
      
//       // Update status to failed
//       await pool.query(
//         `UPDATE video_exports SET status = $1, error_message = $2 WHERE id = $3`,
//         ['failed', 'Video export service unavailable. Please try again later.', exportJob.id]
//       );

//       return res.status(500).json({
//         error: 'Failed to start video export',
//         message: 'Video export service unavailable. Please try again later.'
//       });
//     }

//   } catch (err) {
//     console.error('Error requesting video export:', err);
//     const sanitizedError = sanitizeErrorForClient(err.message, false);
//     res.status(500).json({ error: sanitizedError });
//   }
// });

// // Get video export status
// router.get('/:id/video-export/:exportId/status', betterAuthMiddleware, async (req, res) => {
//   const { id, exportId } = req.params;
//   const userId = req.user.id;

//   try {
//     // Verify user owns the export
//     const exportResult = await pool.query(
//       `SELECT id, track_id, user_id, status, video_url, start_time, duration, 
//               error_message, created_at, updated_at
//        FROM video_exports
//        WHERE id = $1 AND track_id = $2 AND user_id = $3`,
//       [exportId, id, userId]
//     );

//     if (exportResult.rows.length === 0) {
//       return res.status(404).json({ error: 'Video export not found' });
//     }

//     const exportJob = exportResult.rows[0];

//     res.json({
//       export_id: exportJob.id,
//       track_id: exportJob.track_id,
//       status: exportJob.status,
//       video_url: exportJob.video_url || null,
//       start_time: exportJob.start_time,
//       duration: exportJob.duration,
//       error_message: exportJob.error_message || null,
//       created_at: exportJob.created_at,
//       updated_at: exportJob.updated_at
//     });

//   } catch (err) {
//     console.error('Error fetching video export status:', err);
//     const sanitizedError = sanitizeErrorForClient(err.message, false);
//     res.status(500).json({ error: sanitizedError });
//   }
// });

// // Get video export download URL
// router.get('/:id/video-export/:exportId/download', betterAuthMiddleware, async (req, res) => {
//   const { id, exportId } = req.params;
//   const userId = req.user.id;

//   try {
//     // Verify user owns the export and it's completed
//     const exportResult = await pool.query(
//       `SELECT id, track_id, user_id, status, video_url
//        FROM video_exports
//        WHERE id = $1 AND track_id = $2 AND user_id = $3`,
//       [exportId, id, userId]
//     );

//     if (exportResult.rows.length === 0) {
//       return res.status(404).json({ error: 'Video export not found' });
//     }

//     const exportJob = exportResult.rows[0];

//     if (exportJob.status !== 'completed') {
//       return res.status(400).json({ 
//         error: 'Video export not completed',
//         status: exportJob.status
//       });
//     }

//     if (!exportJob.video_url) {
//       return res.status(404).json({ error: 'Video URL not available' });
//     }

//     // Return the video URL (R2 public URL)
//     res.json({
//       download_url: exportJob.video_url
//     });

//   } catch (err) {
//     console.error('Error fetching video export download:', err);
//     const sanitizedError = sanitizeErrorForClient(err.message, false);
//     res.status(500).json({ error: sanitizedError });
//   }
// });

// Like a Track
router.post('/:id/like', interactionLimiter, betterAuthMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    // Check if track exists and get track owner
    const trackCheck = await pool.query('SELECT user_id FROM tracks WHERE id = $1', [id]);
    if (trackCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Track not found' });
    }
    
    // Don't create notification if liking your own track
    const trackOwnerId = trackCheck.rows[0].user_id;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const result = await client.query(
        'INSERT INTO likes (user_id, track_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING id',
        [userId, id]
      );
      
      // Only increment if a new like was actually inserted
      if (result.rows.length > 0) {
        await client.query(
          'UPDATE tracks SET like_count = like_count + 1 WHERE id = $1',
          [id]
        );
      }
      
      // Create notification for track owner (if not liking own track)
      if (trackOwnerId !== userId && result.rows.length > 0) {
        await client.query(
          'INSERT INTO notifications (user_id, type, related_track_id) VALUES ($1, $2, $3)',
          [trackOwnerId, 'like', id]
        );
      }
      
      await client.query('COMMIT');
      res.status(200).json({ message: 'Liked' });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

// Unlike a Track
router.delete('/:id/like', betterAuthMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const result = await client.query(
        'DELETE FROM likes WHERE user_id = $1 AND track_id = $2',
        [userId, id]
      );
      
      // Only decrement if a like was actually deleted
      if (result.rowCount > 0) {
        await client.query(
          'UPDATE tracks SET like_count = GREATEST(0, like_count - 1) WHERE id = $1',
          [id]
        );
      }
      
      await client.query('COMMIT');
      res.status(200).json({ message: 'Unliked' });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

// Get users who liked a track
router.get('/:id/likes', optionalBetterAuthMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const { page = 1, limit = 20 } = req.query;
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);
  

    // First check if track exists and if user has access
    const trackCheck = await pool.query(
      'SELECT id, user_id, is_private FROM tracks WHERE id = $1',
      [id]
    );
    
    if (trackCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Track not found' });
    }
    
    const track = trackCheck.rows[0];
    
    // If track is private, check if user is authorized to view it
    if (track.is_private) {
      const isOwner = userId && track.user_id === userId;
      
      if (!isOwner) {
        return res.status(403).json({ error: 'This track is private' });
      }
    }
    
    // Get users who liked this track
    const likesQuery = `
      SELECT 
        u.id,
        u.username,
        u.name,
        u.verified,
        u.profile_pic_url,
        l.created_at as liked_at,
        CASE WHEN f.follower_id IS NOT NULL THEN true ELSE false END as is_following
      FROM likes l
      JOIN users u ON l.user_id = u.id
      LEFT JOIN follows f ON f.following_id = u.id AND f.follower_id = $3
      WHERE l.track_id = $1
      ORDER BY l.created_at DESC
      LIMIT $2 OFFSET $4
    `;
    
    const countQuery = `
      SELECT COUNT(*) 
      FROM likes 
      WHERE track_id = $1
    `;
    
    const [likesResult, countResult] = await Promise.all([
      pool.query(likesQuery, [id, limitNum, userId || null, offset]),
      pool.query(countQuery, [id])
    ]);
    
    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / limitNum);
    const hasMore = parseInt(page) < totalPages;
    
    res.json({
      users: likesResult.rows,
      pagination: {
        total: totalCount,
        page: parseInt(page),
        limit: limitNum,
        pages: totalPages,
        hasMore
      }
    });
  } catch (err) {
    next(err);
  }
});

// Get comments for a track with pagination
router.get('/:id/comments', optionalBetterAuthMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const { page = 1, limit = 10, parent_id = null } = req.query;
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);
  
    // First check if track exists and if user has access
    const trackCheck = await pool.query(
      'SELECT id, user_id, is_private FROM tracks WHERE id = $1',
      [id]
    );
    
    if (trackCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Track not found' });
    }
    
    const track = trackCheck.rows[0];
    
    // If track is private, check if user is authorized to view it
    if (track.is_private) {
      const isOwner = userId && track.user_id === userId;
      
      if (!isOwner) {
        return res.status(403).json({ error: 'This track is private' });
      }
    }
    
    // Get comments for this track
    const commentsQuery = `
      SELECT 
        c.*,
        u.username,
        u.name,
        u.verified,
        u.profile_pic_url,
        (SELECT COUNT(*) FROM comments WHERE parent_comment_id = c.id) AS reply_count,
        (c.user_id = $4) AS is_owner
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.track_id = $1 AND (c.parent_comment_id IS NULL AND $2::int IS NULL OR c.parent_comment_id = $2)
      ORDER BY c.created_at DESC
      LIMIT $3 OFFSET $5
    `;
    
    const countQuery = `
      SELECT COUNT(*) 
      FROM comments 
      WHERE track_id = $1 AND (parent_comment_id IS NULL AND $2::int IS NULL OR parent_comment_id = $2)
    `;
    
    const [commentsResult, countResult] = await Promise.all([
      pool.query(commentsQuery, [id, parent_id, limitNum, userId || null, offset]),
      pool.query(countQuery, [id, parent_id])
    ]);
    
    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / limitNum);
    
    res.json({
      comments: commentsResult.rows,
      pagination: {
        total: totalCount,
        page: parseInt(page),
        limit: limitNum,
        pages: totalPages
      }
    });
  } catch (err) {
    next(err);
  }
});

// Comment on a Track
router.post('/:id/comment', contentCreationLimiter, betterAuthMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { content, parent_comment_id } = req.body;
    const userId = req.user.id;
    
    // Validate comment content length
    const MAX_COMMENT_LENGTH = 1000;
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'Comment content is required' });
    }
    if (content.trim().length === 0) {
      return res.status(400).json({ error: 'Comment content cannot be empty' });
    }
    if (content.length > MAX_COMMENT_LENGTH) {
      return res.status(400).json({ error: `Comment cannot exceed ${MAX_COMMENT_LENGTH} characters` });
    }

    // Check if track exists and get track owner
    const trackCheck = await pool.query('SELECT user_id FROM tracks WHERE id = $1', [id]);
    if (trackCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Track not found' });
    }
    
    // Don't create notification if commenting on your own track
    const trackOwnerId = trackCheck.rows[0].user_id;
    
    // Check if this is a reply to another comment
    let notifyUserId = trackOwnerId;
    
    if (parent_comment_id) {
      // Verify parent comment exists and belongs to this track
      const parentCommentCheck = await pool.query(
        'SELECT c.user_id, c.track_id FROM comments c WHERE c.id = $1',
        [parent_comment_id]
      );
      
      if (parentCommentCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Parent comment not found' });
      }
      
      if (parentCommentCheck.rows[0].track_id !== parseInt(id)) {
        return res.status(400).json({ error: 'Parent comment does not belong to this track' });
      }
      
      // Set notification recipient to parent comment author (unless it's yourself)
      const parentCommentUserId = parentCommentCheck.rows[0].user_id;
      if (parentCommentUserId !== userId) {
        notifyUserId = parentCommentUserId;
      }
    }
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Insert the comment
      const result = await client.query(
        'INSERT INTO comments (user_id, track_id, content, parent_comment_id) VALUES ($1, $2, $3, $4) RETURNING *',
        [userId, id, content, parent_comment_id || null]
      );
      
      // Only increment comment_count for top-level comments (not replies)
      // Replies have parent_comment_id set, so we only count direct track comments
      if (!parent_comment_id) {
        await client.query(
          'UPDATE tracks SET comment_count = comment_count + 1 WHERE id = $1',
          [id]
        );
      }
      
      // Get user info for the response
      const userInfo = await client.query(
        'SELECT username, name, verified, profile_pic_url FROM users WHERE id = $1',
        [userId]
      );
      
      // Create notification (if not commenting on own track or replying to own comment)
      if (notifyUserId !== userId) {
        await client.query(
          'INSERT INTO notifications (user_id, type, related_track_id, related_user_id) VALUES ($1, $2, $3, $4)',
          [notifyUserId, 'comment', id, userId]
        );
      }
      
      await client.query('COMMIT');
      
      const comment = {
        ...result.rows[0],
        ...userInfo.rows[0],
        reply_count: 0,
        is_owner: true
      };
      
      res.status(201).json(comment);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

// Update a comment
router.put('/comments/:commentId', betterAuthMiddleware, async (req, res, next) => {
  try {
    const { commentId } = req.params;
    const { content } = req.body;
    const userId = req.user.id;
    
    // Validate comment content length
    const MAX_COMMENT_LENGTH = 1000;
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'Comment content is required' });
    }
    if (content.trim().length === 0) {
      return res.status(400).json({ error: 'Comment content cannot be empty' });
    }
    if (content.length > MAX_COMMENT_LENGTH) {
      return res.status(400).json({ error: `Comment cannot exceed ${MAX_COMMENT_LENGTH} characters` });
    }

    // Check if comment exists and belongs to the user
    const commentCheck = await pool.query(
      'SELECT * FROM comments WHERE id = $1',
      [commentId]
    );
    
    if (commentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    
    if (commentCheck.rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'You can only edit your own comments' });
    }
    
    // Update the comment
    const result = await pool.query(
      'UPDATE comments SET content = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [content, commentId]
    );
    
    // Get user info for the response
    const userInfo = await pool.query(
      'SELECT username, name, verified, profile_pic_url FROM users WHERE id = $1',
      [userId]
    );
    
    // Get reply count
    const replyCountResult = await pool.query(
      'SELECT COUNT(*) FROM comments WHERE parent_comment_id = $1',
      [commentId]
    );
    
    const comment = {
      ...result.rows[0],
      ...userInfo.rows[0],
      reply_count: parseInt(replyCountResult.rows[0].count),
      is_owner: true
    };
    
    res.json(comment);
  } catch (err) {
    next(err);
  }
});

// Delete a comment
router.delete('/comments/:commentId', betterAuthMiddleware, async (req, res, next) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.id;
  
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Check if comment exists and belongs to the user
      const commentCheck = await client.query(
        'SELECT track_id, parent_comment_id FROM comments WHERE id = $1',
        [commentId]
      );
      
      if (commentCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Comment not found' });
      }
      
      const comment = commentCheck.rows[0];
      
      // Verify ownership
      const ownershipCheck = await client.query(
        'SELECT user_id FROM comments WHERE id = $1',
        [commentId]
      );
      
      if (ownershipCheck.rows[0].user_id !== userId) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'You can only delete your own comments' });
      }
      
      // Delete the comment (cascade will handle replies)
      await client.query('DELETE FROM comments WHERE id = $1', [commentId]);
      
      // Only decrement comment_count for top-level comments (not replies)
      if (!comment.parent_comment_id) {
        await client.query(
          'UPDATE tracks SET comment_count = GREATEST(0, comment_count - 1) WHERE id = $1',
          [comment.track_id]
        );
      }
      
      await client.query('COMMIT');
      res.json({ message: 'Comment deleted successfully' });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

// Search tracks by genre or instrument
router.get('/search', async (req, res, next) => {
  try {
    const { genreId, instrumentId } = req.query;
    const userId = req.user?.id;
  
    let query = `
      SELECT DISTINCT
        t.id, t.user_id, t.title, t.audio_url, t.combined_audio_url, t.duration, t.layer, t.parent_track_id, t.play_count,
        u.username, u.verified, u.profile_pic_url,
        t2.title AS original_title,
        t.collab_count,
        EXISTS(SELECT 1 FROM likes WHERE user_id = $1 AND track_id = t.id) AS is_liked,
        t.like_count
      FROM tracks t
      LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
      LEFT JOIN users u ON t.user_id = u.id
    `;
    
    const queryParams = [userId || null];
    let whereClause = 't.processing_status = \'completed\' AND t.team_id IS NULL AND t.camp_id IS NULL';

    if (genreId) {
      whereClause += ' AND EXISTS (SELECT 1 FROM track_genres tg WHERE tg.track_id = t.id AND tg.genre_id = $2)';
      queryParams.push(genreId);
    }

    if (instrumentId) {
      whereClause += ' AND EXISTS (SELECT 1 FROM track_instruments ti WHERE ti.track_id = t.id AND ti.instrument_id = $' + (queryParams.length + 1) + ')';
      queryParams.push(instrumentId);
    }

    query += ' WHERE ' + whereClause;
    
    query += ' ORDER BY t.created_at DESC';
    
    const result = await pool.query(query, queryParams);
    
    // Use the processTrack utility function
    const tracks = await Promise.all(result.rows.map(track => processTrack(track, userId)));
    
    res.json(tracks);
  } catch (err) {
    next(err);
  }
});

// Repost a Track
router.post('/:id/repost', interactionLimiter, betterAuthMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    // Check if track exists and get track privacy info along with creator's account privacy
    const trackCheck = await pool.query(`
      SELECT t.user_id, t.is_private, u.is_private as creator_is_private
      FROM tracks t
      JOIN users u ON t.user_id = u.id
      WHERE t.id = $1
    `, [id]);

    if (trackCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Track not found' });
    }

    const track = trackCheck.rows[0];

    // Don't allow reposting your own track
    if (track.user_id === userId) {
      return res.status(400).json({ error: 'Cannot repost your own track' });
    }

    // Don't allow reposting private tracks
    if (track.is_private) {
      return res.status(403).json({ error: 'Cannot repost private tracks' });
    }

    // Don't allow reposting tracks created by private accounts
    if (track.creator_is_private) {
      return res.status(403).json({ error: 'Cannot repost tracks from private accounts' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Create repost
      const result = await client.query(
        'INSERT INTO reposts (user_id, track_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING id',
        [userId, id]
      );
      
      // Only increment if a new repost was actually inserted
      if (result.rows.length > 0) {
        await client.query(
          'UPDATE tracks SET repost_count = repost_count + 1 WHERE id = $1',
          [id]
        );
        
        // Create notification for track owner
        await client.query(
          'INSERT INTO notifications (user_id, type, related_track_id) VALUES ($1, $2, $3)',
          [track.user_id, 'repost', id]
        );
      }
      
      await client.query('COMMIT');
      res.status(200).json({ message: 'Track reposted successfully' });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

// Unrepost a Track
router.delete('/:id/repost', betterAuthMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const result = await client.query(
        'DELETE FROM reposts WHERE user_id = $1 AND track_id = $2',
        [userId, id]
      );
      
      if (result.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Repost not found' });
      }
      
      // Decrement repost count
      await client.query(
        'UPDATE tracks SET repost_count = GREATEST(0, repost_count - 1) WHERE id = $1',
        [id]
      );
      
      await client.query('COMMIT');
      res.status(200).json({ message: 'Track unreposted successfully' });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

// Record initial play for a track
// This endpoint is called when a user starts listening to a track
router.post('/:id/play', apiEndpointLimiter, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { 
      discovery_method = 'unknown', 
      referrer_url = null,
      listen_duration = null,
      is_complete_play = null,
      skip_time = null,
      play_id = null
    } = req.body;
    const userId = req.user?.id; // Optional - can be null for anonymous plays
    const isUpdate = listen_duration !== null || is_complete_play !== null || skip_time !== null;

    // Check if track exists
    const trackCheck = await pool.query('SELECT id FROM tracks WHERE id = $1', [id]);
    if (trackCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Track not found' });
    }
    
    // Get IP address and geolocation data
    const ipAddress = req.headers['cf-connecting-ip'] || req.ip || socket.connection.remoteAddress || req.headers['x-forwarded-for'];
    
    let recentPlay = null;
    if(play_id){
      recentPlay = await pool.query(
        'SELECT id, listen_duration FROM track_plays WHERE id = $1',
        [play_id]
      );
      if(recentPlay.rows.length === 0){
        return res.status(404).json({ error: 'Play not found' });
      }
    }
    else if (userId) {
      recentPlay = await pool.query(
        'SELECT id, listen_duration FROM track_plays WHERE track_id = $1 AND user_id = $2 AND created_at > NOW() - INTERVAL \'1 hour\'',
        [id, userId]
      );
    }
    else{
      // check if this ip address has played this track recently
      recentPlay = await pool.query(
        'SELECT id, listen_duration FROM track_plays WHERE track_id = $1 AND ip_address = $2 AND created_at > NOW() - INTERVAL \'1 hour\'',
        [id, ipAddress]
      );
    }

    if(recentPlay && recentPlay.rows.length > 0){
      if(isUpdate){
        if(recentPlay.rows[0].listen_duration != null){
          return res.status(200).json({ message: 'Play completion already recorded' });
        }
        // update the play record
        await pool.query(
          'UPDATE track_plays SET listen_duration = $1, is_complete_play = $2, skip_time = $3 WHERE id = $4',
          [listen_duration, is_complete_play, skip_time, recentPlay.rows[0].id]
        );
        return res.status(200).json({ message: 'Play updated successfully' });
      }
      else{
        return res.status(200).json({ message: 'Play already recorded recently' });
      }
    }
    
    let geoData;
    if(req.headers['cf-ipcity'] && req.headers['cf-region-code'] && req.headers['cf-ipcountry']){
      geoData = {
        country_code: req.headers['cf-ipcountry'],
        region: req.headers['cf-region'],
        city: req.headers['cf-ipcity']
      };
    }
    else{
      geoData = await getGeolocationData(ipAddress);
    }
    
    // Record the initial play in a transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Record the initial play with available data
      const playResult = await client.query(
        `INSERT INTO track_plays (
          track_id, user_id, discovery_method, 
          country_code, region, city, referrer_url,
          listen_duration, is_complete_play, skip_time,
          ip_address
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [
          id, userId, discovery_method,
          geoData.country_code, geoData.region, geoData.city,
          referrer_url, listen_duration, is_complete_play, skip_time,
          userId ? null : ipAddress
        ]
      );
      
      // Increment play count directly
      await client.query(
        'UPDATE tracks SET play_count = play_count + 1 WHERE id = $1',
        [id]
      );
      
      // Get updated play count
      const playCountResult = await client.query(
        'SELECT play_count FROM tracks WHERE id = $1',
        [id]
      );
      
      await client.query('COMMIT');
      
      res.status(200).json({ 
        message: 'Play recorded successfully',
        play_id: playResult.rows[0].id,
        play_count: playCountResult.rows[0].play_count
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

// Get full track tree (ancestors and children)
router.get('/:id/tree', async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const { secret } = req.query; // Secret token for private tracks
  
    // Check if the track exists and if user has access
    const accessCheck = await checkTrackAccess(id, userId, secret);
    if (!accessCheck.hasAccess) {
      return res.status(accessCheck.status).json({ error: accessCheck.error });
    }

    const trackId = accessCheck.track.id;

    // Check if track has restricted status
    const statusCheck = await checkTrackStatus(trackId);
    if (statusCheck) {
      return res.status(statusCheck.status).json({ error: statusCheck.error });
    }

    let baseQuery;
    let queryParams;
    if (userId) {
      baseQuery = getBaseTrackSelectQuery(true, 2, false);
      queryParams = [trackId, userId];
    } else {
      baseQuery = getBaseTrackSelectQuery(false, 1, false);
      queryParams = [trackId];
    }
    
    // First, get the current track
    const currentTrackResult = await pool.query(`
      SELECT 
        ${baseQuery}
      FROM tracks t
      LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN users u2 ON t2.user_id = u2.id
      WHERE t.id = $1
    `, queryParams);
    
    if (currentTrackResult.rows.length === 0) {
      return res.status(404).json({ error: 'Track not found' });
    }
    
    const currentTrack = currentTrackResult.rows[0];
    
    // Get all ancestors (tracks up the tree to the root)
    const ancestors = [];
    let parentId = currentTrack.parent_track_id;
    
    while (parentId) {
      if (userId) {
        queryParams = [parentId, userId];
      } else {
        queryParams = [parentId];
      }
      
      const parentResult = await pool.query(`
        SELECT
          ${baseQuery}
        FROM tracks t
        LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
        LEFT JOIN users u ON t.user_id = u.id
        WHERE t.id = $1 AND t.processing_status = 'completed'
      `, queryParams);
      
      if (parentResult.rows.length === 0) {
        break;
      }
      
      const parent = parentResult.rows[0];
      ancestors.unshift(parent); // Add to the beginning of the array
      parentId = parent.parent_track_id;
    }
    
    // Process all tracks using processTrack utility function
    const processedCurrentTrack = await processTrack(currentTrack, userId);
    const processedAncestors = await Promise.all(ancestors.map(track => processTrack(track, userId)));
    
    res.json([...processedAncestors, processedCurrentTrack]);
  } catch (err) {
    next(err);
  }
});

// Poll for new tracks in a tree
router.get('/:id/tree/new-tracks', optionalBetterAuthMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const { secret } = req.query;
    const { since } = req.query; // ISO timestamp string
  
    // Check if the track exists and if user has access
    const accessCheck = await checkTrackAccess(id, userId, secret);
    if (!accessCheck.hasAccess) {
      return res.status(accessCheck.status).json({ error: accessCheck.error });
    }

    const rootId = accessCheck.track.id;
    
    // Default to 1 minute ago if since not provided
    const sinceDate = since 
      ? new Date(since) 
      : new Date(Date.now() - 60 * 1000);
    
    // Validate since date
    if (isNaN(sinceDate.getTime())) {
      return res.status(400).json({ error: 'Invalid since timestamp' });
    }
    
    // Get new tracks in this tree since the given timestamp
    // Include user profile_pic_url and verified for activity feed display
    const result = await pool.query(`
      SELECT 
        t.id,
        t.title,
        u.username,
        u.profile_pic_url,
        u.verified,
        t.created_at,
        t.parent_track_id
      FROM tracks t
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.root_id = $1 
        AND t.created_at > $2::timestamptz
        AND t.processing_status = 'completed'
        AND t.id != $1
      ORDER BY t.created_at DESC
      LIMIT 50
    `, [rootId, sinceDate.toISOString()]);
    
    res.json({ tracks: result.rows });
  } catch (err) {
    next(err);
  }
});

// Toggle track privacy. Only root tracks can control their privacy status.
router.put('/:id/privacy', betterAuthMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { is_private } = req.body;
  
    // Check if subscriptions feature is enabled
    const subscriptionsEnabled = await isFeatureEnabled('subscriptions', false);
    
    // If subscriptions disabled, block making tracks private
    if (!subscriptionsEnabled && is_private) {
      return res.status(400).json({
        error: 'Private tracks are not available at this time.'
      });
    }
    
    // Check if track exists and user is the owner
    const trackCheck = await pool.query(
      'SELECT user_id, is_private, secret_token, parent_track_id FROM tracks WHERE id = $1',
      [id]
    );
    
    if (trackCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Track not found' });
    }
    
    if (trackCheck.rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'You do not have permission to modify this track' });
    }

    if(trackCheck.rows[0].parent_track_id){
      return res.status(400).json({ error: 'Cannot modify privacy status of a collaboration' });
    }

    const currentIsPrivate = trackCheck.rows[0].is_private;
    const secretToken = trackCheck.rows[0].secret_token || generateSecureToken();
    
    // If trying to make the track private, check if it has collaborations
    if (is_private) {
      // Check if track has children (collaborations)
      const childrenCheck = await pool.query(
        'SELECT COUNT(*) FROM tracks WHERE parent_track_id = $1',
        [id]
      );
      
      const hasChildren = parseInt(childrenCheck.rows[0].count) > 0;
      
      if (hasChildren) {
        return res.status(400).json({ 
          error: 'Cannot make track private because it has collaborations'
        });
      }
    }
    
    // If the track is going from private to public, we need to cascade this change to all child tracks
    if (currentIsPrivate && !is_private) {
      // First, find all descendant tracks (direct and indirect children)
      const allDescendants = await findAllDescendantTracks(id);
      
      if (allDescendants.length > 0) {
        // Update all descendants to public
        await pool.query(
          'UPDATE tracks SET is_private = FALSE WHERE id = ANY($1::int[])',
          [allDescendants]
        );
      }
    }
    
    // Update track privacy
    const result = await pool.query(
      'UPDATE tracks SET is_private = $1, secret_token = $2 WHERE id = $3 RETURNING *',
      [is_private, is_private ? secretToken : null, id]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// Delete a track
router.delete('/:id', betterAuthMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
  
    const result = await deleteTrack(id, userId);
    
    if (result.soft_delete) {
      return res.status(200).json({ 
        message: 'Track has been soft-deleted because it has collaborations',
        soft_delete: true
      });
    } else {
      return res.status(200).json({ 
        message: 'Track has been permanently deleted',
        soft_delete: false
      });
    }
  } catch (err) {
    next(err);
  }
});

// Generate a share link with a secret token for a private track
router.post('/:id/share', interactionLimiter, betterAuthMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
  
    // Check if the track exists and belongs to the user
    const trackCheck = await pool.query(
      'SELECT id, user_id, is_private, secret_token FROM tracks WHERE id = $1',
      [id]
    );
    
    if (trackCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Track not found' });
    }
    
    const track = trackCheck.rows[0];
    
    // Only the track owner can generate a share link
    if (track.user_id !== userId) {
      return res.status(403).json({ error: 'You do not have permission to share this track' });
    }
    
    // Track secret token should always be set
    if (track.secret_token) {
      const shareLink = `${process.env.FRONTEND_URL}/track/${id}?secret=${track.secret_token}`;
      return res.json({ 
        shareLink,
        secretToken: track.secret_token
      });
    }
    else{
      throw new Error('Track secret token not found');
    }

  } catch (error) {
    next(error);
  }
});

// Refresh signed URL for a track
// router.get('/:id/refresh-url', optionalBetterAuthMiddleware, async (req, res, next) => {
//   try {
//     const { id } = req.params;
//     const userId = req.user?.id;
//     const { secret } = req.query; // Secret token for private tracks
  
//     // Check if the track exists and if user has access
//     const accessCheck = await checkTrackAccess(id, userId, secret);
//     if (!accessCheck.hasAccess) {
//       return res.status(accessCheck.status).json({ error: accessCheck.error });
//     }
    
//     // Get the track details
//     const result = await pool.query(
//       `SELECT t.*, u.username as username, u.profile_pic_url as user_profile_pic
//        FROM tracks t
//        JOIN users u ON t.user_id = u.id
//        WHERE t.id = $1 AND t.processing_status = 'completed'`,
//       [id]
//     );
    
//     if (result.rows.length === 0) {
//       return res.status(404).json({ error: 'Track not found' });
//     }
    
//     const trackData = result.rows[0];
    
//     // Generate new signed URLs using our utility function
//     const audioUrl = generateSignedUrl(trackData.audio_url);
//     const combinedAudioUrl = generateSignedUrl(trackData.combined_audio_url || trackData.audio_url);
    
//     // Return just the URLs
//     res.json({ 
//       audio_url: audioUrl, 
//       combined_audio_url: combinedAudioUrl,
//       track_id: trackData.id
//     });
//   } catch (err) {
//     next(err);
//   }
// });

// Download a track
router.get('/:id/download', optionalBetterAuthMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const { secret } = req.query; // Secret token for private tracks
  
    // Check if the track exists and if user has access
    const accessCheck = await checkTrackAccess(id, userId, secret);
    if (!accessCheck.hasAccess) {
      return res.status(accessCheck.status).json({ error: accessCheck.error });
    }
    
    // Get the track details
    const result = await pool.query(
      `SELECT t.*, u.username as username
       FROM tracks t
       JOIN users u ON t.user_id = u.id
       WHERE t.id = $1 AND t.processing_status = 'completed'`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Track not found' });
    }
    
    const trackData = result.rows[0];
    
    // Check if downloads are allowed for this track
    if (!trackData.allow_download) {
      return res.status(403).json({ error: 'Downloads are not allowed for this track' });
    }
    
    // Generate signed URL for download (use combined_audio_url for full track)
    const audioKey = trackData.combined_audio_url || trackData.audio_url;
    const downloadUrl = generateSignedUrl(audioKey, 300); // 5 minute expiry for downloads
    
    // Set appropriate headers for download
    const filename = `${trackData.title} - ${trackData.username}.mp3`;
    
    // Return the download URL with proper headers
    res.json({
      download_url: downloadUrl,
      filename: filename,
      track_id: trackData.id
    });
  } catch (err) {
    next(err);
  }
});

// Test endpoint that returns dummy related tracks for development/testing
router.get('/:id/related-test', async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;
  const { lastId, limit = 5, includeParent = true, maxLikes = 1000, maxPlays = 10000, includeChildCount = false, orderBy = 'newest'} = req.query;

  const limitNum = parseInt(limit);
  const maxLikesNum = parseInt(maxLikes);
  const maxPlaysNum = parseInt(maxPlays);
  const includeChildCountBool = includeChildCount === 'true';

  try {
    // Fetch all available instruments from the database
    const instrumentsResult = await pool.query('SELECT * FROM instruments ORDER BY name');
    const allInstruments = instrumentsResult.rows;

    // Helper function to randomly select 0-4 instruments
    const getRandomInstruments = () => {
      if (allInstruments.length === 0) return [];
      const numInstruments = Math.floor(Math.random() * 5); // 0-4 instruments
      if (numInstruments === 0) return [];
      
      // Shuffle and take first N instruments
      const shuffled = [...allInstruments].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, numInstruments);
    };

    // First look up the track with the given id to determine depth
    const trackLookup = await pool.query('SELECT layer FROM tracks WHERE id = $1', [id]);
    let trackDepth;

    if (trackLookup.rows.length > 0) {
      // Use the track's layer property as depth
      trackDepth = trackLookup.rows[0].layer;
    } else {
      // If track not found, determine depth by the first digit from the id
      trackDepth = parseInt(id.toString().charAt(0));
    }

    // Get a template track to use for dummy data
    const templateQuery = `
      SELECT t.audio_url, t.combined_audio_url, t.duration, t.layer, u.profile_pic_url, u.username, u.verified
      FROM tracks t
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.processing_status = 'completed' AND t.is_private = FALSE
      ORDER BY t.created_at DESC
      LIMIT 1
    `;

    const templateResult = await pool.query(templateQuery);
    if (templateResult.rows.length === 0) {
      return res.status(404).json({ error: 'No template track found' });
    }

    const template = templateResult.rows[0];
    const signedAudioUrl = generateSignedUrl(template.audio_url);
    const signedCombinedAudioUrl = template.combined_audio_url ? generateSignedUrl(template.combined_audio_url) : signedAudioUrl;

    let numToGenerate = Math.floor(Math.random() * limit * 2);
    let hasMore = false;
    if (numToGenerate === 0) {
      numToGenerate = 1;
    }
    if (numToGenerate > limitNum) {
      hasMore = true;
      numToGenerate = limitNum;
    }


    // Generate dummy tracks
    const dummyTracks = [];
    let startIndex, endIndex;
    if (orderBy === 'newest') {
      startIndex = parseInt(lastId) || 0 + 1;
      endIndex = startIndex + numToGenerate;
    } else {
      startIndex = parseInt(lastId) || 0 - 1;
      endIndex = startIndex - numToGenerate;
    }

    // Determine loop direction based on start/end indices
    const isAscending = startIndex < endIndex;
    const increment = isAscending ? 1 : -1;
    const condition = isAscending 
      ? (i) => i < endIndex 
      : (i) => i > endIndex;

    for (let i = startIndex; condition(i); i += increment) {
      // Use the determined depth + 1 for returned tracks
      const returnTrackDepth = trackDepth + 1;

      const dummyId = parseInt(`${returnTrackDepth}${i}`);
      const dummyTrack = {
        id: dummyId, // Fake ID to avoid conflicts
        guid: `dummy-${dummyId}`,
        user_id: userId || 1,
        title: `${dummyId}: Depth ${returnTrackDepth} Track ${i}`,
        audio_url: signedAudioUrl,
        combined_audio_url: signedCombinedAudioUrl,
        duration: template.duration,
        layer: returnTrackDepth,
        parent_track_id: parseInt(id),
        created_at: new Date(Date.now() - (numToGenerate - i) * 1000 * 60 * 60), // Spread out creation times
        play_count: Math.floor(Math.random() * maxPlaysNum),
        metronome_bpm: null,
        time_signature: '4/4',
        allow_download: true,
        processing_status: 'completed',
        username: template.username,
        verified: template.verified,
        profile_pic_url: template.profile_pic_url,
        creator_is_private: false,
        original_title: null,
        ...(includeChildCountBool && { collab_count: Math.floor(Math.random() * 5) }),
        like_count: Math.floor(Math.random() * maxLikesNum),
        repost_count: Math.floor(Math.random() * 100),
        comment_count: Math.floor(Math.random() * 50),
        is_liked: userId ? Math.random() > 0.7 : false, // 30% chance of being liked
        is_reposted: userId ? Math.random() > 0.9 : false, // 10% chance of being reposted
        genres: [],
        instruments: getRandomInstruments(), // Randomly assign 0-4 instruments
        elements: [],
        instrument_requests: [],
        element_requests: [],
        has_active_competition: false
      };

      dummyTracks.push(dummyTrack);
    }

    res.json({
      tracks: dummyTracks,
      pagination: {
        hasMore: hasMore
      }
    });
  } catch (err) {
    console.error('Related test endpoint error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;