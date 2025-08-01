const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const mm = require('music-metadata');
const ffmpeg = require('fluent-ffmpeg');
const pool = require('../config/db');
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/auth');
const { 
  uploadLimiter, 
  contentCreationLimiter, 
  interactionLimiter, 
  apiEndpointLimiter 
} = require('../middleware/rateLimiting');
const { 
  s3, 
  s3Client, 
  generateSignedUrl,
  processTrack,
  downloadS3File,
  checkTrackAccess,
  combineAudioFiles,
  generateSecureToken,
  getBaseTrackSelectQuery,
  getPopularFeedQuery,
  getFollowingFeedQuery,
  getForYouFeedQuery,
  findAllDescendantTracks
} = require('../utils/trackUtils');
const { getUserPlan } = require('../utils/subscriptionUtils');
const { getGeolocationData } = require('../utils/geolocation');
require('dotenv').config;

// Configure FFMPEG path based on platform
if (process.platform === 'linux') {
  // Use the FFMPEG binary in the bin directory on Linux (Azure)
  const ffmpegPath = path.join(__dirname, '../../bin/ffmpeg');
  ffmpeg.setFfmpegPath(ffmpegPath);
  console.log('Using local FFMPEG binary:', ffmpegPath);
} else {
  // On other platforms (macOS/Windows), rely on system installation
  console.log('Using system-installed FFMPEG');
}

const router = express.Router();

// Multer setup - Memory storage
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

// Apply optional auth middleware to all routes
router.use(optionalAuthMiddleware);

// Add a health check endpoint to verify FFMPEG is working
router.get('/ffmpeg-check', async (req, res) => {
  try {
    ffmpeg.getAvailableFormats((err, formats) => {
      if (err) {
        console.error('FFMPEG check failed:', err);
        return res.status(500).json({ 
          error: 'FFMPEG check failed', 
          message: err.message,
          platform: process.platform
        });
      }
      
      return res.status(200).json({ 
        status: 'FFMPEG is available',
        platform: process.platform,
        formatsAvailable: Object.keys(formats).length > 0
      });
    });
  } catch (err) {
    console.error('FFMPEG check exception:', err);
    return res.status(500).json({ 
      error: 'FFMPEG check exception', 
      message: err.message,
      platform: process.platform
    });
  }
});




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



router.post('/upload', uploadLimiter, authMiddleware, upload.single('audio'), async (req, res) => {
  let { title, parent_track_id, genreIds, instrumentIds, metronome_bpm, original_gain, recording_gain, time_signature, is_private, metronome_offset, allow_download } = req.body;
  const userId = req.user.id;
  const file = req.file;
  let layer = 0;
  let parentIsPrivate = false;
  let parentSecretToken = null;
  let parsedMetronomeOffset = metronome_offset ? Math.min(Math.max(parseFloat(metronome_offset), 0), 1) : 0;

  if (!file) return res.status(400).json({ error: 'No audio file uploaded' });
  
  console.log('Upload request received:');
  console.log('- Title:', title);
  console.log('- Parent track ID:', parent_track_id || 'None (original track)');
  console.log('- Original gain:', original_gain || 'Not provided');
  console.log('- Recording gain:', recording_gain || 'Not provided');
  console.log('- Time signature:', time_signature || '4/4 (default)');
  console.log('- Metronome offset:', parsedMetronomeOffset);
  console.log('- Private:', is_private ? 'Yes' : 'No');
  console.log('- Allow download:', allow_download !== 'false' ? 'Yes' : 'No');

  let subscription = null;
  // Check if user has reached their daily upload limit (3 uploads per day)
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of the day

    const userResult = await pool.query(
      'SELECT subscription_tier, subscription_expires_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    subscription = getUserPlan(user);
    
    const uploadCountResult = await pool.query(
      'SELECT COUNT(*) FROM tracks WHERE user_id = $1 AND created_at >= $2',
      [userId, today]
    );
    
    const dailyUploadCount = parseInt(uploadCountResult.rows[0].count);
    
    if (subscription.limits.daily_uploads !== -1 && dailyUploadCount >= subscription.limits.daily_uploads) {
      return res.status(429).json({ 
        error: 'Daily upload limit reached',
        message: `You can only upload ${subscription.limits.daily_uploads} tracks per day. Upgrade your plan to increase your upload limit.`,
        daily_count: dailyUploadCount,
        upgrade_link: `${process.env.FRONTEND_URL || ''}/subscribe`
      });
    }
  } catch (err) {
    console.error('Error checking upload limit:', err);
    return res.status(500).json({ error: `Failed to check upload limit: ${err.message}` });
  }

  // Check if user has reached their total track limit (50 tracks maximum)
  try {
    const totalTrackCountResult = await pool.query(
      'SELECT COUNT(*) FROM tracks WHERE user_id = $1',
      [userId]
    );
    
    const totalTrackCount = parseInt(totalTrackCountResult.rows[0].count);
    
    if (subscription.limits.max_total_uploads !== -1 && totalTrackCount >= subscription.limits.max_total_uploads) {
      return res.status(429).json({ 
        error: 'Total track limit reached',
        message: `You can only have ${subscription.limits.max_total_uploads} tracks maximum. Upgrade your plan to increase your track limit.`,
        total_count: totalTrackCount,
        upgrade_link: `${process.env.FRONTEND_URL || ''}/subscribe`
      });
    }
  } catch (err) {
    console.error('Error checking total track limit:', err);
    return res.status(500).json({ error: `Failed to check total track limit: ${err.message}` });
  }

  // Parse genre and instrument IDs if they're provided as strings
  const parsedGenreIds = genreIds ? (typeof genreIds === 'string' ? JSON.parse(genreIds) : genreIds) : [];
  const parsedInstrumentIds = instrumentIds ? (typeof instrumentIds === 'string' ? JSON.parse(instrumentIds) : instrumentIds) : [];
  
  // Parse metronome_bpm if provided
  let parsedMetronomeBpm = metronome_bpm ? parseInt(metronome_bpm, 10) : null;
  
  // Parse gain values with fallbacks to default values (1.0 = full volume)
  const parsedOriginalGain = original_gain ? parseFloat(original_gain) : 0.8;
  const parsedRecordingGain = recording_gain ? parseFloat(recording_gain) : 0.8;

  // Use the provided time signature or default to 4/4
  let parsedTimeSignature = time_signature || '4/4';
  
  // Parse the private flag (convert string 'true'/'false' to boolean if needed)
  let isPrivate = is_private === 'true' || is_private === true;
  
  // Parse the allow_download flag (default to true if not provided)
  let allowDownload = allow_download !== 'false' && allow_download !== false;

  let audioUrl, combinedAudioUrl, duration;
  const tempDir = path.join(__dirname, '../../temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  try {
    const metadata = await mm.parseBuffer(file.buffer, file.mimetype);
    duration = metadata.format.duration;
    
    // Validate track duration (max 10 minutes = 600 seconds)
    if (duration > 5 * 60) {
      return res.status(400).json({ error: 'Track duration exceeds the maximum limit of 5 minutes' });
    }
  } catch (err) {
    return res.status(500).json({ error: `Failed to parse audio metadata: ${err.message}` });
  }

  try {
    // 1. Upload raw file to S3
    audioUrl = `tracks/${Date.now()}-${file.originalname}`;
    const uploadParams = {
      Bucket: process.env.S3_BUCKET,
      Key: audioUrl,
      Body: file.buffer,
      ContentType: file.mimetype,
    };
    await s3.upload(uploadParams).promise();

    if (parent_track_id) {
      const parentResult = await pool.query(
        'SELECT combined_audio_url, audio_url, duration, is_private, secret_token, layer, metronome_bpm, time_signature, metronome_offset FROM tracks WHERE id = $1',
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
      if (duration > parentDuration) {
        return res.status(400).json({ error: 'Collaboration track cannot be longer than the original track' });
      }
      
      layer = (parentTrack.layer ?? 0) + 1;
      if (layer > 4) {
        return res.status(400).json({ error: 'Layer limit reached' });
      }
      
      const parentCombinedKey = parentTrack.combined_audio_url || parentTrack.audio_url;
      const localFiles = [];

      const uploadedLocalPath = path.join(tempDir, `${Date.now()}-${file.originalname}`);
      await fsPromises.writeFile(uploadedLocalPath, file.buffer);
      localFiles.push(uploadedLocalPath);

      if (parentCombinedKey) {
        const parentLocalPath = path.join(tempDir, `parent-${Date.now()}-${path.basename(parentCombinedKey)}`);
        console.log('Downloading parent:', parentCombinedKey, 'to:', parentLocalPath);
        await downloadS3File(parentCombinedKey, parentLocalPath);
        localFiles.push(parentLocalPath);
      }

      console.log('Local files before combining:', localFiles);
      combinedAudioUrl = `tracks/combined-${Date.now()}-${title}.mp3`;
      const combinedPath = path.join(tempDir, path.basename(combinedAudioUrl));
      
      // Prepare gain values
      // localFiles order is: [uploaded recording, parent track]
      // First element (index 0) is the new recording, second element (index 1) is the parent
      const gainValues = [];
      
      // Recording gain first - index 0
      gainValues[0] = parsedRecordingGain;
      
      // Original gain second - index 1
      if (localFiles.length > 1) {
        gainValues[1] = parsedOriginalGain;
      }
      
      await combineAudioFiles(localFiles, combinedPath, gainValues);

      const combinedParams = {
        Bucket: process.env.S3_BUCKET,
        Key: combinedAudioUrl,
        Body: fs.createReadStream(combinedPath),
        ContentType: 'audio/mpeg',
      };
      await s3.upload(combinedParams).promise();

      await Promise.all(localFiles.map(f => fsPromises.unlink(f).catch(err => console.error('Cleanup error:', err))));
      await fsPromises.unlink(combinedPath).catch(err => console.error('Cleanup error:', err));
    } else {
      // If no parent track, the user specified is_private = true, and their subscription tier does not allow private tracks, return an error
      if (isPrivate && !subscription.features.private_tracks) {
        return res.status(400).json({ 
          error: 'Private tracks are not allowed for your subscription tier. Upgrade your plan to enable private tracks.',
          upgrade_link: `${process.env.FRONTEND_URL || ''}/subscribe`
        });
      }
      
      // Apply normalization to regular uploads for consistent audio quality
      const uploadedLocalPath = path.join(tempDir, `${Date.now()}-${file.originalname}`);
      await fsPromises.writeFile(uploadedLocalPath, file.buffer);
      
      combinedAudioUrl = `tracks/normalized-${Date.now()}-${title}.mp3`;
      const normalizedPath = path.join(tempDir, path.basename(combinedAudioUrl));
      
      // Use default normalization settings for regular uploads
      // Target LUFS: -16 (good for general use), True Peak: -1 dB (prevents clipping)
      await combineAudioFiles([uploadedLocalPath], normalizedPath, [1.0], -16, -1);
      
      const normalizedParams = {
        Bucket: process.env.S3_BUCKET,
        Key: combinedAudioUrl,
        Body: fs.createReadStream(normalizedPath),
        ContentType: 'audio/mpeg',
      };
      await s3.upload(normalizedParams).promise();
      
      // Clean up local files
      await fsPromises.unlink(uploadedLocalPath).catch(err => console.error('Cleanup error:', err));
      await fsPromises.unlink(normalizedPath).catch(err => console.error('Cleanup error:', err));
    }

    const result = await pool.query(
        'INSERT INTO tracks (user_id, title, audio_url, combined_audio_url, duration, parent_track_id, metronome_bpm, layer, time_signature, is_private, secret_token, metronome_offset, allow_download) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *',
        [userId, title, audioUrl, combinedAudioUrl, duration, parent_track_id || null, parsedMetronomeBpm, layer, parsedTimeSignature, isPrivate, parentSecretToken, parsedMetronomeOffset, allowDownload]
    );
    
    const trackId = result.rows[0].id;
    
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
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Upload error:', err);
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
      baseQuery = getBaseTrackSelectQuery(true, 2, false);
      queryParams = [id, userId];
    } else {
      baseQuery = getBaseTrackSelectQuery(false, 1, false);
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
        WHERE (t.id = (SELECT parent_track_id FROM tracks WHERE id = $1))
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
      WHERE t.parent_track_id = $1
      ORDER BY t.created_at DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;
    
    // Get the total count for pagination info
    let countQuery = `
      SELECT COUNT(*) 
      FROM tracks
      WHERE parent_track_id = $1
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
    let whereClause = '';
    
    if (genreId) {
      whereClause += 'EXISTS (SELECT 1 FROM track_genres tg WHERE tg.track_id = t.id AND tg.genre_id = $2)';
      queryParams.push(genreId);
    }
    
    if (instrumentId) {
      if (whereClause) {
        whereClause += ' AND ';
      }
      whereClause += 'EXISTS (SELECT 1 FROM track_instruments ti WHERE ti.track_id = t.id AND ti.instrument_id = $' + (queryParams.length + 1) + ')';
      queryParams.push(instrumentId);
    }
    
    if (whereClause) {
      query += ' WHERE ' + whereClause;
    }
    
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
    // Check if track exists
    const trackCheck = await pool.query('SELECT user_id FROM tracks WHERE id = $1', [id]);
    if (trackCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Track not found' });
    }
    
    // Don't allow reposting your own track
    if (trackCheck.rows[0].user_id === userId) {
      return res.status(400).json({ error: 'Cannot repost your own track' });
    }
    
    // Create repost
    await pool.query(
      'INSERT INTO reposts (user_id, track_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [userId, id]
    );
    
    // Create notification for track owner
    await pool.query(
      'INSERT INTO notifications (user_id, type, related_track_id) VALUES ($1, $2, $3)',
      [trackCheck.rows[0].user_id, 'repost', id]
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
    is_complete_play = false,
    skip_time = null
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
    if (userId) {
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
      await client.query(
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
        WHERE t.id = $1
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
    // Check if track exists and user is the owner
    const trackCheck = await pool.query(
      'SELECT user_id, audio_url, combined_audio_url FROM tracks WHERE id = $1',
      [id]
    );
    
    if (trackCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Track not found' });
    }
    
    if (trackCheck.rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'You do not have permission to delete this track' });
    }
    
    // Check if track has children
    const childrenCheck = await pool.query(
      'SELECT COUNT(*) FROM tracks WHERE parent_track_id = $1',
      [id]
    );
    
    const hasChildren = parseInt(childrenCheck.rows[0].count) > 0;
    
    if (hasChildren) {
      // Soft delete - clear user_id and make track public
      await pool.query(
        'UPDATE tracks SET user_id = NULL, is_private = FALSE WHERE id = $1 RETURNING id',
        [id]
      );
      
      return res.status(200).json({ 
        message: 'Track has been soft-deleted because it has collaborations',
        soft_delete: true
      });
    } else {
      // Hard delete - remove track and delete files from S3
      const audioUrl = trackCheck.rows[0].audio_url;
      const combinedAudioUrl = trackCheck.rows[0].combined_audio_url;
      
      // Delete from database first
      await pool.query('DELETE FROM tracks WHERE id = $1', [id]);
      
      // Delete files from S3
      const deletePromises = [];
      
      if (audioUrl && audioUrl.startsWith('tracks/')) {
        deletePromises.push(
          s3.deleteObject({
            Bucket: process.env.S3_BUCKET,
            Key: audioUrl
          }).promise()
        );
      }
      
      if (combinedAudioUrl && combinedAudioUrl !== audioUrl && combinedAudioUrl.startsWith('tracks/')) {
        deletePromises.push(
          s3.deleteObject({
            Bucket: process.env.S3_BUCKET,
            Key: combinedAudioUrl
          }).promise()
        );
      }
      
      // Wait for all S3 deletions to complete
      if (deletePromises.length > 0) {
        try {
          await Promise.all(deletePromises);
        } catch (s3Error) {
          console.error('Error deleting files from S3:', s3Error);
          // Continue with response even if S3 deletion fails
        }
      }
      
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
       WHERE t.id = $1`,
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
       WHERE t.id = $1`,
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