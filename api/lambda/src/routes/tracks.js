const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const mm = require('music-metadata');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { EventBridgeClient, PutEventsCommand } = require('@aws-sdk/client-eventbridge');
const pool = require('../config/db');
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/auth');
const { 
  uploadLimiter, 
  contentCreationLimiter, 
  interactionLimiter, 
  apiEndpointLimiter 
} = require('../middleware/rateLimiting');
const {
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
  parseTrackUploadBody
} = require('../utils/trackUtils');
const { getUserPlan, checkDailyUploadQuota, checkTotalUploadQuota } = require('../utils/subscriptionUtils');
const { getGeolocationData } = require('../utils/geolocation');
const { validateCompetitionEntry } = require('../utils/competition');
require('dotenv').config;

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
router.use(optionalAuthMiddleware);

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
router.post('/upload/init', uploadLimiter, authMiddleware, async (req, res) => {
  const { filename, fileSize, is_camp_track } = req.body;
  const userId = req.user.id;

  if (!filename || !fileSize) {
    return res.status(400).json({ error: 'filename and fileSize are required' });
  }

  if (fileSize > 100 * 1024 * 1024) { // 100MB limit
    return res.status(400).json({ error: 'File size exceeds maximum limit of 100MB' });
  }

  try {
    // Skip quota validations for camp tracks
    if (!is_camp_track) {
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
    console.error('Upload initialization error:', err);
    res.status(500).json({ error: `Failed to initialize upload: ${err.message}` });
  }
});

// Process upload after S3 upload is complete
router.post('/upload', uploadLimiter, authMiddleware, async (req, res) => {
  const userId = req.user.id;
  let layer = 0;
  let parentIsPrivate = false;
  let parentSecretToken = null;
  let isCompetitionEntry = false;
  let competitionId = null;

  let {
    title,
    parent_track_id,
    enter_competition,
    s3Key,
    parsedGenreIds,
    parsedInstrumentIds,
    parsedMetronomeBpm,
    parsedStems,
    parsedTimeSignature,
    isPrivate,
    allowDownload,
    parsedMetronomeOffset,
    camp_id,
    room_id,
    key
  } = parseTrackUploadBody(req.body);

  if (!s3Key) return res.status(400).json({ error: 's3Key is required' });

  // Validate S3 key format
  if (!s3Key.startsWith('uploads/temp/') || !s3Key.includes(`/${userId}/`)) {
    return res.status(400).json({ error: 'Invalid S3 key format' });
  }

  // Download file from S3 for validation
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const localFilePath = path.join(tempDir, `validation-${Date.now()}-${path.basename(s3Key)}`);

  try {
    await downloadS3File(s3Key, localFilePath);
    console.log('Successfully downloaded file from S3 for validation');
  } catch (downloadError) {
    console.error('Failed to download file from S3:', downloadError);
    return res.status(400).json({ error: 'Failed to access uploaded file. Please try uploading again.' });
  }

  if (!camp_id) { // Only check quotas for non-camp tracks
    try {
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
    } catch (err) {
      console.error('Error checking user subscription limits:', err);
      return res.status(500).json({ error: `Failed to check user subscription limits` });
    }
  }

  let duration;

  try {
    const parser = await getParser();
    const metadata = await parser.parseFile(localFilePath);
    duration = metadata.format.duration;

    // Validate track duration (max 5 minutes = 300 seconds)
    if (duration > 5 * 60) {
      return res.status(400).json({ error: 'Track duration exceeds the maximum limit of 5 minutes' });
    }
  } catch (err) {
    console.error('❌ Audio metadata parsing failed:', {
      error: err.message,
      stack: err.stack,
      filePath: localFilePath,
      fileExists: require('fs').existsSync(localFilePath)
    });
    return res.status(500).json({ error: `Failed to parse audio metadata: ${err.message}` });
  }

  let stemChain = [];
  try {
    // Get the complete stem chain for mixing
    stemChain = parent_track_id ? await getStemChain(parent_track_id) : [];

    // Validate stem chain and parsedStems
    const validation = validateAndUpdateStemChain(stemChain, parsedStems);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Invalid stem chain or stems',
        message: validation.error
      });
    }
  } catch (err) {
    console.error('Error validating stem chain and parsedStems:', err);
    return res.status(500).json({ error: `Failed to validate stem chain and parsedStems: ${err.message}` });
  }


  // Set audio_url to the permanent temp S3 location for audio processing lambda
  // The lambda will extract the base and derive final URLs
  const permanentTempKey = s3Key.replace('uploads/temp/', 'temp/tracks/');
  const audioUrl = permanentTempKey;

  // Validate collaboration logic (but don't do audio processing yet)
  try {
    if (parent_track_id) {
      const parentResult = await pool.query(
        'SELECT duration, is_private, secret_token, layer, metronome_bpm, time_signature, metronome_offset FROM tracks WHERE id = $1',
        [parent_track_id]
      );
      if (parentResult.rows.length === 0) {
        return res.status(400).json({ error: 'Parent track not found' });
      }

      const parentTrack = parentResult.rows[0];
      const parentDuration = parentTrack.duration;

      // Store parent privacy status and secret token
      parentIsPrivate = parentTrack.is_private;
      parentSecretToken = parentTrack.secret_token;

      isPrivate = parentIsPrivate;

      parsedMetronomeBpm = parentTrack.metronome_bpm;
      parsedTimeSignature = parentTrack.time_signature;
      // Use parent's metronome offset for collaborations
      parsedMetronomeOffset = parentTrack.metronome_offset || 0;

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
      // If no parent track, the user specified is_private = true, and their subscription tier does not allow private tracks, and a camp is not specified, return an error
      if (!camp_id) {
        if (isPrivate && !subscription.features.private_tracks) {
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

      if (parent_track_id) {
        // This is a Track (collaboration on a beat) - camp must have started
        if (now < new Date(camp.start_date)) {
          return res.status(400).json({ error: 'Track uploads are not allowed until the camp has started' });
        }

        if (!room_id) {
          return res.status(400).json({ error: 'Room ID is required when uploading tracks to a camp' });
        }

        // Validate room exists and belongs to this camp
        const roomResult = await pool.query(
          'SELECT id FROM rooms WHERE id = $1 AND camp_id = $2',
          [room_id, camp_id]
        );

        if (roomResult.rows.length === 0) {
          return res.status(400).json({ error: 'Room does not exist in this camp' });
        }

        // If parent track has a room_id, descendants must inherit it
        const parentRoomCheck = await pool.query(
          'SELECT room_id FROM tracks WHERE id = $1',
          [parent_track_id]
        );

        if (parentRoomCheck.rows.length > 0 && parentRoomCheck.rows[0].room_id) {
          room_id = parentRoomCheck.rows[0].room_id;
        }
      } else {
        // This is a Beat upload - no room validation needed for beats
        // Room assignment happens when someone starts an idea from a beat
        room_id = null;
      }
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
        'INSERT INTO tracks (user_id, title, audio_url, duration, parent_track_id, metronome_bpm, layer, time_signature, is_private, secret_token, metronome_offset, allow_download, is_competition_entry, competition_id, mix_gains, processing_status, camp_id, room_id, key) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) RETURNING *',
        [userId, title, audioUrl, duration, parent_track_id || null, parsedMetronomeBpm, layer, parsedTimeSignature, isPrivate, parentSecretToken, parsedMetronomeOffset, allowDownload, isCompetitionEntry, competitionId, JSON.stringify(mixGainsToInsert), 'processing', camp_id, room_id, key]
    );

    const trackId = result.rows[0].id;

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
    
    // Create notification for parent track owner if this is a collaboration
    if (parent_track_id) {
      try {
        const parentTrackOwner = await pool.query(
          'SELECT user_id FROM tracks WHERE id = $1',
          [parent_track_id]
        );
        
        if (parentTrackOwner.rows.length > 0 && parentTrackOwner.rows[0].user_id !== userId) {
          await pool.query(
            'INSERT INTO notifications (user_id, type, related_track_id) VALUES ($1, $2, $3)',
            [parentTrackOwner.rows[0].user_id, 'new_version', parent_track_id]
          );
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
    console.error('Upload error:', err);

    // Clean up downloaded file on error
    if (localFilePath) {
      await fsPromises.unlink(localFilePath).catch(cleanupErr => console.error('Upload file cleanup error:', cleanupErr));
    }

    res.status(500).json({ error: `Upload failed: ${err.message}` });
  }
});

// Get "For You" feed (mixed content - followed users + popular)
router.get('/feed/for-you', async (req, res) => {
  const userId = req.user?.id;
  const { page = 1, limit = 5 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const limitNum = parseInt(limit);
  
  try {
    let query;
    let queryParams;
    
    // Mixed feed: combination of followed artists, their reposts, and popular tracks
    if (userId) {
      // Use the standardized For You feed query function
      query = getForYouFeedQuery(2, 3);
      queryParams = [userId, limitNum, offset];
    } else {
      // For non-logged in users, just show popular tracks
      query = getPopularFeedQuery(false, null, 1, 2);
      queryParams = [limitNum, offset];
    }
    
    const result = await pool.query(query, queryParams);
    
    // Use the processTrack utility function
    const tracks = await Promise.all(result.rows.map(track => processTrack(track, userId)));
    
    res.json(tracks);
  } catch (err) {
    console.error('Feed error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get Following feed (just followed artists)
router.get('/feed/following', async (req, res) => {
  const userId = req.user?.id;
  const { page = 1, limit = 5 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const limitNum = parseInt(limit);
  
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  try {
    // Use the standardized following feed query function
    const query = getFollowingFeedQuery(2, 3);
    const queryParams = [userId, limitNum, offset];
    
    const result = await pool.query(query, queryParams);
    
    // Use the processTrack utility function
    const tracks = await Promise.all(result.rows.map(track => processTrack(track, userId)));
    
    res.json(tracks);
  } catch (err) {
    console.error('Following feed error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get Popular feed (globally popular tracks)
router.get('/feed/popular', async (req, res) => {
  const userId = req.user?.id;
  const { page = 1, limit = 5 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const limitNum = parseInt(limit);
  
  try {
    // Use the standardized popular feed query function
    let query;
    let queryParams;
    if (userId) {
      query = getPopularFeedQuery(!!userId, 1, 2, 3, true);
      queryParams = [userId, limitNum, offset];
    } else {
      query = getPopularFeedQuery(false, null, 1, 2);
      queryParams = [limitNum, offset];
    }
    
    const result = await pool.query(query, queryParams);
    
    // Use the processTrack utility function
    const tracks = await Promise.all(result.rows.map(track => processTrack(track, userId)));
    
    res.json(tracks);
  } catch (err) {
    console.error('Popular feed error:', err);
    res.status(500).json({ error: err.message });
  }
});


// Get Track and Versions
router.get('/:id', optionalAuthMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;
  const { secret } = req.query; // Secret token for private tracks
  
  try {
    // Check if the track exists and if user has access
    const accessCheck = await checkTrackAccess(id, userId, secret);
    if (!accessCheck.hasAccess) {
      return res.status(accessCheck.status).json({ error: accessCheck.error });
    }

    let baseQuery;
    let queryParams;
    if (userId) {
      baseQuery = getBaseTrackSelectQuery(true, 2, true);
      queryParams = [id, userId];
    } else {
      baseQuery = getBaseTrackSelectQuery(false, 1, true);
      queryParams = [id];
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
    res.status(500).json({ error: err.message });
  }
});

// Get stem chain for DAW loading
router.get('/:id/stems', optionalAuthMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;

  try {
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
    console.error('Stem chain retrieval error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/related', async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;
  const { page = 1, limit = 5 } = req.query;
  
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const limitNum = parseInt(limit);

  let baseQuery;
  let queryParams;
  if (userId) {
    baseQuery = getBaseTrackSelectQuery(true, 2, false);
    queryParams = [id, userId];
  } else {
    baseQuery = getBaseTrackSelectQuery(false, 1, false);
    queryParams = [id];
  }
  try {
    // Only include the parent track and current track on the first page
    let combinedTracks = [];
    
    if (parseInt(page) === 1) {
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
    res.status(500).json({ error: err.message });
  }
});

// Get track processing status
router.get('/:id/status', optionalAuthMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;

  try {
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

    res.json({
      track_id: id,
      status: status,
      error: track.processing_error,
      estimated_time_remaining: estimatedTimeRemaining
    });

  } catch (err) {
    console.error('Error fetching track status:', err);
    res.status(500).json({ error: err.message });
  }
});

// Like a Track
router.post('/:id/like', interactionLimiter, authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  try {
    // Check if track exists and get track owner
    const trackCheck = await pool.query('SELECT user_id FROM tracks WHERE id = $1', [id]);
    if (trackCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Track not found' });
    }
    
    // Don't create notification if liking your own track
    const trackOwnerId = trackCheck.rows[0].user_id;
    
    await pool.query(
      'INSERT INTO likes (user_id, track_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [userId, id]
    );
    
    // Create notification for track owner (if not liking own track)
    if (trackOwnerId !== userId) {
      await pool.query(
        'INSERT INTO notifications (user_id, type, related_track_id) VALUES ($1, $2, $3)',
        [trackOwnerId, 'like', id]
      );
    }
    
    res.status(200).json({ message: 'Liked' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Unlike a Track
router.delete('/:id/like', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  try {
    await pool.query(
      'DELETE FROM likes WHERE user_id = $1 AND track_id = $2',
      [userId, id]
    );
    res.status(200).json({ message: 'Unliked' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get users who liked a track
router.get('/:id/likes', optionalAuthMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;
  const { page = 1, limit = 20 } = req.query;
  
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const limitNum = parseInt(limit);
  
  try {
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
    console.error('Error fetching track likes:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get comments for a track with pagination
router.get('/:id/comments', optionalAuthMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;
  const { page = 1, limit = 10, parent_id = null } = req.query;
  
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const limitNum = parseInt(limit);
  
  try {
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
    console.error('Error fetching comments:', err);
    res.status(500).json({ error: err.message });
  }
});

// Comment on a Track
router.post('/:id/comment', contentCreationLimiter, authMiddleware, async (req, res) => {
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
  
  try {
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
    
    // Insert the comment
    const result = await pool.query(
      'INSERT INTO comments (user_id, track_id, content, parent_comment_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [userId, id, content, parent_comment_id || null]
    );
    
    // Get user info for the response
    const userInfo = await pool.query(
      'SELECT username, name, verified, profile_pic_url FROM users WHERE id = $1',
      [userId]
    );
    
    // Create notification (if not commenting on own track or replying to own comment)
    if (notifyUserId !== userId) {
      await pool.query(
        'INSERT INTO notifications (user_id, type, related_track_id, related_user_id) VALUES ($1, $2, $3, $4)',
        [notifyUserId, 'comment', id, userId]
      );
    }
    
    const comment = {
      ...result.rows[0],
      ...userInfo.rows[0],
      reply_count: 0,
      is_owner: true
    };
    
    res.status(201).json(comment);
  } catch (err) {
    console.error('Error creating comment:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update a comment
router.put('/comments/:commentId', authMiddleware, async (req, res) => {
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
  
  try {
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
    console.error('Error updating comment:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete a comment
router.delete('/comments/:commentId', authMiddleware, async (req, res) => {
  const { commentId } = req.params;
  const userId = req.user.id;
  
  try {
    // Check if comment exists and belongs to the user
    const commentCheck = await pool.query(
      'SELECT * FROM comments WHERE id = $1',
      [commentId]
    );
    
    if (commentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    
    if (commentCheck.rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'You can only delete your own comments' });
    }
    
    // Delete the comment (cascade will handle replies)
    await pool.query('DELETE FROM comments WHERE id = $1', [commentId]);
    
    res.json({ message: 'Comment deleted successfully' });
  } catch (err) {
    console.error('Error deleting comment:', err);
    res.status(500).json({ error: err.message });
  }
});

// Search tracks by genre or instrument
router.get('/search', async (req, res) => {
  const { genreId, instrumentId } = req.query;
  const userId = req.user?.id;
  
  try {
    let query = `
      SELECT DISTINCT
        t.id, t.user_id, t.title, t.audio_url, t.combined_audio_url, t.duration, t.layer, t.parent_track_id, t.play_count,
        u.username, u.verified, u.profile_pic_url,
        t2.title AS original_title,
        (SELECT COUNT(*) FROM tracks t3 WHERE t3.parent_track_id = t.id) AS collab_count,
        EXISTS(SELECT 1 FROM likes WHERE user_id = $1 AND track_id = t.id) AS is_liked,
        (SELECT COUNT(*) FROM likes WHERE track_id = t.id) AS like_count
      FROM tracks t
      LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
      LEFT JOIN users u ON t.user_id = u.id
    `;
    
    const queryParams = [userId || null];
    let whereClause = 't.processing_status = \'completed\'';

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
    console.error('Search error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Repost a Track
router.post('/:id/repost', interactionLimiter, authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  try {
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

    // Create repost
    await pool.query(
      'INSERT INTO reposts (user_id, track_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [userId, id]
    );

    // Create notification for track owner
    await pool.query(
      'INSERT INTO notifications (user_id, type, related_track_id) VALUES ($1, $2, $3)',
      [track.user_id, 'repost', id]
    );

    res.status(200).json({ message: 'Track reposted successfully' });
  } catch (err) {
    console.error('Repost error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Unrepost a Track
router.delete('/:id/repost', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  try {
    const result = await pool.query(
      'DELETE FROM reposts WHERE user_id = $1 AND track_id = $2',
      [userId, id]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Repost not found' });
    }
    
    res.status(200).json({ message: 'Track unreposted successfully' });
  } catch (err) {
    console.error('Unrepost error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Record initial play for a track
// This endpoint is called when a user starts listening to a track
router.post('/:id/play', apiEndpointLimiter, async (req, res) => {
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
  
  try {
    // Check if track exists
    const trackCheck = await pool.query('SELECT id FROM tracks WHERE id = $1', [id]);
    if (trackCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Track not found' });
    }
    
    // Get IP address and geolocation data
    const ipAddress = req.ip || socket.connection.remoteAddress || req.headers['x-forwarded-for'];
    
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
    
    const geoData = await getGeolocationData(ipAddress);
    
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
    console.error('Error recording play:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get full track tree (ancestors and children)
router.get('/:id/tree', async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;
  const { secret } = req.query; // Secret token for private tracks
  
  try {
    // Check if the track exists and if user has access
    const accessCheck = await checkTrackAccess(id, userId, secret);
    if (!accessCheck.hasAccess) {
      return res.status(accessCheck.status).json({ error: accessCheck.error });
    }

    let baseQuery;
    let queryParams;
    if (userId) {
      baseQuery = getBaseTrackSelectQuery(true, 2, false);
      queryParams = [id, userId];
    } else {
      baseQuery = getBaseTrackSelectQuery(false, 1, false);
      queryParams = [id];
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
    console.error('Error fetching track tree:', err);
    res.status(500).json({ error: err.message });
  }
});

// Toggle track privacy. Only root tracks can control their privacy status.
router.put('/:id/privacy', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { is_private } = req.body;
  
  try {
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
    console.error('Error toggling track privacy:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete a track
router.delete('/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  
  try {
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
    console.error('Error deleting track:', err);
    res.status(500).json({ error: err.message });
  }
});

// Generate a share link with a secret token for a private track
router.post('/:id/share', interactionLimiter, authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  
  try {
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
    console.error('Error generating share link:', error);
    res.status(500).json({ error: 'Failed to generate share link' });
  }
});

// Refresh signed URL for a track
router.get('/:id/refresh-url', optionalAuthMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;
  const { secret } = req.query; // Secret token for private tracks
  
  try {
    // Check if the track exists and if user has access
    const accessCheck = await checkTrackAccess(id, userId, secret);
    if (!accessCheck.hasAccess) {
      return res.status(accessCheck.status).json({ error: accessCheck.error });
    }
    
    // Get the track details
    const result = await pool.query(
      `SELECT t.*, u.username as username, u.profile_pic_url as user_profile_pic
       FROM tracks t
       JOIN users u ON t.user_id = u.id
       WHERE t.id = $1 AND t.processing_status = 'completed'`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Track not found' });
    }
    
    const trackData = result.rows[0];
    
    // Generate new signed URLs using our utility function
    const audioUrl = generateSignedUrl(trackData.audio_url);
    const combinedAudioUrl = generateSignedUrl(trackData.combined_audio_url || trackData.audio_url);
    
    // Return just the URLs
    res.json({ 
      audio_url: audioUrl, 
      combined_audio_url: combinedAudioUrl,
      track_id: trackData.id
    });
  } catch (err) {
    console.error('Error refreshing track URL:', err);
    res.status(500).json({ error: err.message });
  }
});

// Download a track
router.get('/:id/download', optionalAuthMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;
  const { secret } = req.query; // Secret token for private tracks
  
  try {
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
    console.error('Error generating download URL:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;