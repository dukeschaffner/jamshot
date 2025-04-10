const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const AWS = require('aws-sdk');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const mm = require('music-metadata');
const ffmpeg = require('fluent-ffmpeg');
const pool = require('../config/db');
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/auth');
const crypto = require('crypto');
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

// AWS S3 setup
AWS.config.update({ signatureVersion: 'v4' });
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function downloadS3File(key, localPath) {
  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: key,
  });
  const { Body } = await s3Client.send(command);
  const writer = require('fs').createWriteStream(localPath);
  Body.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

async function combineAudioFiles(inputFiles, outputPath) {
  return new Promise((resolve, reject) => {
    console.log('Combining files with ffmpeg:', inputFiles);
    const command = ffmpeg();
    inputFiles.forEach(file => command.input(file));
    command
      .complexFilter(`amix=inputs=${inputFiles.length}`) // e.g., "amix=inputs=2"
      .outputOptions('-c:a mp3')
      .output(outputPath)
      .on('end', () => {
        console.log('Combine complete:', outputPath);
        resolve();
      })
      .on('error', (err) => {
        console.error('FFmpeg error:', err);
        reject(err);
      })
      .run();
  });
}

// Generate a secure random token
function generateSecureToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

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

router.post('/upload', authMiddleware, upload.single('audio'), async (req, res) => {
  const { title, parent_track_id, genreIds, instrumentIds, metronome_bpm } = req.body;
  const userId = req.user.id;
  const file = req.file;
  let layer = 0;

  if (!file) return res.status(400).json({ error: 'No audio file uploaded' });

  // Parse genre and instrument IDs if they're provided as strings
  const parsedGenreIds = genreIds ? (typeof genreIds === 'string' ? JSON.parse(genreIds) : genreIds) : [];
  const parsedInstrumentIds = instrumentIds ? (typeof instrumentIds === 'string' ? JSON.parse(instrumentIds) : instrumentIds) : [];
  
  // Parse metronome_bpm if provided
  const parsedMetronomeBpm = metronome_bpm ? parseInt(metronome_bpm, 10) : null;

  let audioUrl, combinedAudioUrl, duration;
  const tempDir = path.join(__dirname, '../../temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  try {
    const metadata = await mm.parseBuffer(file.buffer, file.mimetype);
    duration = metadata.format.duration;
    
    // Validate track duration (max 10 minutes = 600 seconds)
    if (duration > 600) {
      return res.status(400).json({ error: 'Track duration exceeds the maximum limit of 10 minutes' });
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
        'SELECT combined_audio_url, audio_url, duration FROM tracks WHERE id = $1',
        [parent_track_id]
      );
      if (parentResult.rows.length === 0) {
        return res.status(400).json({ error: 'Parent track not found' });
      }

      const parentDuration = parentResult.rows[0].duration;
      // Validate that collaboration isn't longer than parent track
      if (duration > parentDuration) {
        return res.status(400).json({ error: 'Collaboration track cannot be longer than the original track' });
      }
      
      layer = (parentResult.rows[0].layer ?? 0) + 1;
      if (layer > 4) {
        return res.status(400).json({ error: 'Layer limit reached' });
      }
      
      const parentCombinedKey = parentResult.rows[0].combined_audio_url || parentResult.rows[0].audio_url;
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
      await combineAudioFiles(localFiles, combinedPath);

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
      combinedAudioUrl = audioUrl;
    }

    const result = await pool.query(
      'INSERT INTO tracks (user_id, title, audio_url, combined_audio_url, duration, parent_track_id, metronome_bpm, layer) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [userId, title, audioUrl, combinedAudioUrl, duration, parent_track_id || null, parsedMetronomeBpm, layer]
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

// Get feed tracks (followed artists + popular)
router.get('/feed', async (req, res) => {
  const userId = req.user?.id;
  const { page = 1, limit = 5, feedType = 'mixed' } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const limitNum = parseInt(limit);
  
  try {
    let query;
    let queryParams = [];
    
    if (feedType === 'following' && userId) {
      query = `
        WITH followed_users AS (
          SELECT following_id FROM follows WHERE follower_id = $1
        ),
        followed_tracks AS (
          SELECT 
            t.id, t.user_id, t.title, t.audio_url, t.combined_audio_url, t.duration, t.layer, t.parent_track_id,
            t.created_at, t.play_count,
            u.username, u.verified, u.profile_pic_url,
            t2.title AS original_title,
            (SELECT COUNT(*) FROM tracks t3 WHERE t3.parent_track_id = t.id) AS collab_count,
            EXISTS(SELECT 1 FROM likes WHERE user_id = $1 AND track_id = t.id) AS is_liked,
            (SELECT COUNT(*) FROM likes WHERE track_id = t.id) AS like_count,
            EXISTS(SELECT 1 FROM reposts WHERE user_id = $1 AND track_id = t.id) AS is_reposted,
            NULL::integer AS reposted_by_id,
            NULL::text AS reposted_by_username,
            NULL::timestamp AS reposted_at,
            FALSE AS is_repost
          FROM tracks t
          LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
          LEFT JOIN users u ON t.user_id = u.id
          WHERE t.user_id IN (SELECT following_id FROM followed_users)
        ),
        reposted_tracks AS (
          SELECT 
            t.id, t.user_id, t.title, t.audio_url, t.combined_audio_url, t.duration, t.layer, t.parent_track_id, t.play_count,
            r.created_at,
            u.username, u.verified, u.profile_pic_url,
            t2.title AS original_title,
            (SELECT COUNT(*) FROM tracks t3 WHERE t3.parent_track_id = t.id) AS collab_count,
            EXISTS(SELECT 1 FROM likes WHERE user_id = $1 AND track_id = t.id) AS is_liked,
            (SELECT COUNT(*) FROM likes WHERE track_id = t.id) AS like_count,
            EXISTS(SELECT 1 FROM reposts WHERE user_id = $1 AND track_id = t.id) AS is_reposted,
            r.user_id AS reposted_by_id,
            ru.username AS reposted_by_username,
            r.created_at AS reposted_at,
            TRUE AS is_repost
          FROM reposts r
          JOIN tracks t ON r.track_id = t.id
          JOIN users ru ON r.user_id = ru.id
          LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
          LEFT JOIN users u ON t.user_id = u.id
          WHERE r.user_id IN (SELECT following_id FROM followed_users)
        )
        SELECT * FROM (
          SELECT * FROM followed_tracks
          UNION ALL
          SELECT * FROM reposted_tracks
        ) combined
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
      `;
      queryParams = [userId, limitNum, offset];
    } else if (feedType === 'popular') {
      query = `
        SELECT 
          t.id, t.user_id, t.title, t.audio_url, t.combined_audio_url, t.duration, t.layer, t.parent_track_id,
          t.created_at, t.play_count,
          u.username, u.verified, u.profile_pic_url,
          t2.title AS original_title,
          (SELECT COUNT(*) FROM tracks t3 WHERE t3.parent_track_id = t.id) AS collab_count,
          EXISTS(SELECT 1 FROM likes WHERE user_id = $1 AND track_id = t.id) AS is_liked,
          (SELECT COUNT(*) FROM likes WHERE track_id = t.id) AS like_count,
          EXISTS(SELECT 1 FROM reposts WHERE user_id = $1 AND track_id = t.id) AS is_reposted,
          NULL::integer AS reposted_by_id,
          NULL::text AS reposted_by_username,
          NULL::timestamp AS reposted_at,
          FALSE AS is_repost
        FROM tracks t
        LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
        LEFT JOIN users u ON t.user_id = u.id
        ORDER BY like_count DESC, t.created_at DESC
        LIMIT $2 OFFSET $3
      `;
      queryParams = [userId || null, limitNum, offset];
    } else {
      // Mixed feed: combination of followed artists, their reposts, and popular tracks
      if (userId) {
        query = `
          WITH followed_users AS (
            SELECT following_id FROM follows WHERE follower_id = $1
          ),
          followed_tracks AS (
            SELECT 
              t.id, t.user_id, t.title, t.audio_url, t.combined_audio_url, t.duration, t.layer, t.parent_track_id,
              t.created_at, t.play_count,
              u.username, u.verified, u.profile_pic_url,
              t2.title AS original_title,
              (SELECT COUNT(*) FROM tracks t3 WHERE t3.parent_track_id = t.id) AS collab_count,
              EXISTS(SELECT 1 FROM likes WHERE user_id = $1 AND track_id = t.id) AS is_liked,
              (SELECT COUNT(*) FROM likes WHERE track_id = t.id) AS like_count,
              EXISTS(SELECT 1 FROM reposts WHERE user_id = $1 AND track_id = t.id) AS is_reposted,
              NULL::integer AS reposted_by_id,
              NULL::text AS reposted_by_username,
              NULL::timestamp AS reposted_at,
              FALSE AS is_repost,
              1 AS priority
            FROM tracks t
            LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
            LEFT JOIN users u ON t.user_id = u.id
            WHERE t.user_id IN (SELECT following_id FROM followed_users)
          ),
          reposted_tracks AS (
            SELECT 
              t.id, t.user_id, t.title, t.audio_url, t.combined_audio_url, t.duration, t.layer, t.parent_track_id,
              r.created_at, t.play_count,
              u.username, u.verified, u.profile_pic_url,
              t2.title AS original_title,
              (SELECT COUNT(*) FROM tracks t3 WHERE t3.parent_track_id = t.id) AS collab_count,
              EXISTS(SELECT 1 FROM likes WHERE user_id = $1 AND track_id = t.id) AS is_liked,
              (SELECT COUNT(*) FROM likes WHERE track_id = t.id) AS like_count,
              EXISTS(SELECT 1 FROM reposts WHERE user_id = $1 AND track_id = t.id) AS is_reposted,
              r.user_id AS reposted_by_id,
              ru.username AS reposted_by_username,
              r.created_at AS reposted_at,
              TRUE AS is_repost,
              1 AS priority
            FROM reposts r
            JOIN tracks t ON r.track_id = t.id
            JOIN users ru ON r.user_id = ru.id
            LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
            LEFT JOIN users u ON t.user_id = u.id
            WHERE r.user_id IN (SELECT following_id FROM followed_users)
          ),
          popular_tracks AS (
            SELECT 
              t.id, t.user_id, t.title, t.audio_url, t.combined_audio_url, t.duration, t.layer, t.parent_track_id,
              t.created_at, t.play_count,
              u.username, u.verified, u.profile_pic_url,
              t2.title AS original_title,
              (SELECT COUNT(*) FROM tracks t3 WHERE t3.parent_track_id = t.id) AS collab_count,
              EXISTS(SELECT 1 FROM likes WHERE user_id = $1 AND track_id = t.id) AS is_liked,
              (SELECT COUNT(*) FROM likes WHERE track_id = t.id) AS like_count,
              EXISTS(SELECT 1 FROM reposts WHERE user_id = $1 AND track_id = t.id) AS is_reposted,
              NULL::integer AS reposted_by_id,
              NULL::text AS reposted_by_username,
              NULL::timestamp AS reposted_at,
              FALSE AS is_repost,
              2 AS priority
            FROM tracks t
            LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
            LEFT JOIN users u ON t.user_id = u.id
            WHERE t.id NOT IN (
              SELECT id FROM followed_tracks
              UNION
              SELECT id FROM reposted_tracks
            )
            ORDER BY like_count DESC
            LIMIT $2
          )
          SELECT * FROM (
            SELECT * FROM followed_tracks
            UNION ALL
            SELECT * FROM reposted_tracks
            UNION ALL
            SELECT * FROM popular_tracks
          ) combined
          ORDER BY priority, created_at DESC
          LIMIT $2 OFFSET $3
        `;
        queryParams = [userId, limitNum, offset];
      } else {
        // For non-logged in users, just show popular tracks
        query = `
          SELECT 
            t.id, t.user_id, t.title, t.audio_url, t.combined_audio_url, t.duration, t.layer, t.parent_track_id,
            t.created_at, t.play_count,
            u.username, u.verified, u.profile_pic_url,
            t2.title AS original_title,
            (SELECT COUNT(*) FROM tracks t3 WHERE t3.parent_track_id = t.id) AS collab_count,
            EXISTS(SELECT 1 FROM likes WHERE user_id = $1 AND track_id = t.id) AS is_liked,
            (SELECT COUNT(*) FROM likes WHERE track_id = t.id) AS like_count
          FROM tracks t
          LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
          LEFT JOIN users u ON t.user_id = u.id
          ORDER BY like_count DESC, t.created_at DESC
          LIMIT $2 OFFSET $3
        `;
        queryParams = [null, limitNum, offset];
      }
    }
    
    const result = await pool.query(query, queryParams);
    
    const tracks = await Promise.all(result.rows.map(async track => {
      let combinedAudioUrl = track.combined_audio_url || track.audio_url;
      if (combinedAudioUrl.startsWith('tracks/')) {
        combinedAudioUrl = s3.getSignedUrl('getObject', {
          Bucket: process.env.S3_BUCKET,
          Key: track.combined_audio_url || track.audio_url,
          Expires: 3600,
        });
      }
      
      // Get genres for this track
      const genresResult = await pool.query(
        `SELECT g.* FROM genres g
         JOIN track_genres tg ON g.id = tg.genre_id
         WHERE tg.track_id = $1
         ORDER BY g.name`,
        [track.id]
      );
      
      // Get instruments for this track
      const instrumentsResult = await pool.query(
        `SELECT i.* FROM instruments i
         JOIN track_instruments ti ON i.id = ti.instrument_id
         WHERE ti.track_id = $1
         ORDER BY i.name`,
        [track.id]
      );
      
      return { 
        ...track, 
        combined_audio_url: combinedAudioUrl,
        genres: genresResult.rows,
        instruments: instrumentsResult.rows
      };
    }));
    
    res.json(tracks);
  } catch (err) {
    console.error('Feed error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get Track and Versions
router.get('/:id', optionalAuthMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;
  const { secret } = req.query; // Secret token for private tracks
  
  try {
    // First check if the track exists and if it's private
    const trackCheck = await pool.query(
      'SELECT id, user_id, is_private, secret_token FROM tracks WHERE id = $1',
      [id]
    );
    
    if (trackCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Track not found' });
    }
    
    const track = trackCheck.rows[0];
    
    // If track is private, check if user is authorized to view it
    if (track.is_private) {
      // Allow access if user is the owner
      const isOwner = userId && track.user_id === userId;
      
      // Check if a valid secret token is provided
      const hasValidSecret = secret && track.secret_token && secret === track.secret_token;
      
      if (!isOwner && !hasValidSecret) {
        return res.status(403).json({ error: 'This track is private' });
      }
    }
    
    const result = await pool.query(`
      SELECT 
        t.*,
        u.username,
        u.verified,
        u.profile_pic_url,
        EXISTS(SELECT 1 FROM likes WHERE user_id = $2 AND track_id = t.id) AS is_liked,
        (SELECT COUNT(*) FROM likes WHERE track_id = t.id) AS like_count
      FROM tracks t
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.id = $1 OR t.parent_track_id = $1 
      ORDER BY t.created_at ASC
    `, [id, userId || null]);
    
    const tracks = await Promise.all(result.rows.map(async track => {
      let audioUrl = track.audio_url;
      let combinedAudioUrl = track.combined_audio_url || track.audio_url; // Fallback to audio_url if no combined
      
      if (audioUrl.startsWith('tracks/')) {
        audioUrl = s3.getSignedUrl('getObject', {
          Bucket: process.env.S3_BUCKET,
          Key: track.audio_url,
          Expires: 3600,
        });
      }
      if (combinedAudioUrl.startsWith('tracks/')) {
        combinedAudioUrl = s3.getSignedUrl('getObject', {
          Bucket: process.env.S3_BUCKET,
          Key: track.combined_audio_url || track.audio_url,
          Expires: 3600,
        });
      }
      
      // Get genres for this track
      const genresResult = await pool.query(
        `SELECT g.* FROM genres g
         JOIN track_genres tg ON g.id = tg.genre_id
         WHERE tg.track_id = $1
         ORDER BY g.name`,
        [track.id]
      );
      
      // Get instruments for this track
      const instrumentsResult = await pool.query(
        `SELECT i.* FROM instruments i
         JOIN track_instruments ti ON i.id = ti.instrument_id
         WHERE ti.track_id = $1
         ORDER BY i.name`,
        [track.id]
      );
      
      return { 
        ...track, 
        audio_url: audioUrl, 
        combined_audio_url: combinedAudioUrl,
        genres: genresResult.rows,
        instruments: instrumentsResult.rows
      };
    }));
    
    res.json(tracks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/related', async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;
  try {
    const result = await pool.query(`
      SELECT 
        t.id, t.title, t.audio_url, t.combined_audio_url, t.duration, t.layer, t.parent_track_id, t.play_count,
        u.username, u.verified, u.profile_pic_url,
        EXISTS(SELECT 1 FROM likes WHERE user_id = $2 AND track_id = t.id) AS is_liked,
        (SELECT COUNT(*) FROM likes WHERE track_id = t.id) AS like_count
      FROM tracks t
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.id = $1 OR t.parent_track_id = $1 OR t.id = (SELECT parent_track_id FROM tracks WHERE id = $1)
      ORDER BY t.created_at ASC
    `, [id, userId || null]);
    
    const tracks = await Promise.all(result.rows.map(async track => {
      let combinedAudioUrl = track.combined_audio_url || track.audio_url;
      if (combinedAudioUrl.startsWith('tracks/')) {
        combinedAudioUrl = s3.getSignedUrl('getObject', {
          Bucket: process.env.S3_BUCKET,
          Key: track.combined_audio_url || track.audio_url,
          Expires: 3600,
        });
      }
      
      // Get genres for this track
      const genresResult = await pool.query(
        `SELECT g.* FROM genres g
         JOIN track_genres tg ON g.id = tg.genre_id
         WHERE tg.track_id = $1
         ORDER BY g.name`,
        [track.id]
      );
      
      // Get instruments for this track
      const instrumentsResult = await pool.query(
        `SELECT i.* FROM instruments i
         JOIN track_instruments ti ON i.id = ti.instrument_id
         WHERE ti.track_id = $1
         ORDER BY i.name`,
        [track.id]
      );
      
      return { 
        ...track, 
        combined_audio_url: combinedAudioUrl,
        genres: genresResult.rows,
        instruments: instrumentsResult.rows
      };
    }));
    
    res.json(tracks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  const userId = req.user?.id;
  try {
    const result = await pool.query(`
      SELECT 
        t.id, t.user_id, t.title, t.audio_url, t.combined_audio_url, t.duration, t.layer, t.parent_track_id, t.play_count,
        u.username, u.verified, u.profile_pic_url,
        t2.title AS original_title,
        (SELECT COUNT(*) FROM tracks t3 WHERE t3.parent_track_id = t.id) AS collab_count,
        EXISTS(SELECT 1 FROM likes WHERE user_id = $1 AND track_id = t.id) AS is_liked,
        (SELECT COUNT(*) FROM likes WHERE track_id = t.id) AS like_count
      FROM tracks t
      LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
      LEFT JOIN users u ON t.user_id = u.id
      ORDER BY t.created_at DESC
    `, [userId || null]);
    
    const tracks = await Promise.all(result.rows.map(async track => {
      let combinedAudioUrl = track.combined_audio_url || track.audio_url;
      if (combinedAudioUrl.startsWith('tracks/')) {
        combinedAudioUrl = s3.getSignedUrl('getObject', {
          Bucket: process.env.S3_BUCKET,
          Key: track.combined_audio_url || track.audio_url,
          Expires: 3600,
        });
      }
      
      // Get genres for this track
      const genresResult = await pool.query(
        `SELECT g.* FROM genres g
         JOIN track_genres tg ON g.id = tg.genre_id
         WHERE tg.track_id = $1
         ORDER BY g.name`,
        [track.id]
      );
      
      // Get instruments for this track
      const instrumentsResult = await pool.query(
        `SELECT i.* FROM instruments i
         JOIN track_instruments ti ON i.id = ti.instrument_id
         WHERE ti.track_id = $1
         ORDER BY i.name`,
        [track.id]
      );
      
      return { 
        ...track, 
        combined_audio_url: combinedAudioUrl,
        genres: genresResult.rows,
        instruments: instrumentsResult.rows
      };
    }));
    
    res.json(tracks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Like a Track
router.post('/:id/like', authMiddleware, async (req, res) => {
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
router.post('/:id/comment', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { content, parent_comment_id } = req.body;
  const userId = req.user.id;
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
    
    const tracks = await Promise.all(result.rows.map(async track => {
      let combinedAudioUrl = track.combined_audio_url || track.audio_url;
      if (combinedAudioUrl.startsWith('tracks/')) {
        combinedAudioUrl = s3.getSignedUrl('getObject', {
          Bucket: process.env.S3_BUCKET,
          Key: track.combined_audio_url || track.audio_url,
          Expires: 3600,
        });
      }
      
      // Get genres for this track
      const genresResult = await pool.query(
        `SELECT g.* FROM genres g
         JOIN track_genres tg ON g.id = tg.genre_id
         WHERE tg.track_id = $1
         ORDER BY g.name`,
        [track.id]
      );
      
      // Get instruments for this track
      const instrumentsResult = await pool.query(
        `SELECT i.* FROM instruments i
         JOIN track_instruments ti ON i.id = ti.instrument_id
         WHERE ti.track_id = $1
         ORDER BY i.name`,
        [track.id]
      );
      
      return { 
        ...track, 
        combined_audio_url: combinedAudioUrl,
        genres: genresResult.rows,
        instruments: instrumentsResult.rows
      };
    }));
    
    res.json(tracks);
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Repost a Track
router.post('/:id/repost', authMiddleware, async (req, res) => {
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

// Record a play for a track
// This endpoint is called when a user listens to:
// - At least 30 seconds of a track that's 30+ seconds long
// - At least 90% of a track that's less than 30 seconds long
router.post('/:id/play', async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id; // Optional - can be null for anonymous plays
  
  try {
    // Check if track exists
    const trackCheck = await pool.query('SELECT id FROM tracks WHERE id = $1', [id]);
    if (trackCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Track not found' });
    }
    
    // For logged-in users, check if they've played this track recently (within the last hour)
    // This prevents abuse while still allowing legitimate repeat plays
    if (userId) {
      const recentPlay = await pool.query(
        'SELECT id FROM track_plays WHERE track_id = $1 AND user_id = $2 AND created_at > NOW() - INTERVAL \'1 hour\'',
        [id, userId]
      );
      
      if (recentPlay.rows.length > 0) {
        // User has played this track recently, don't count it again yet
        return res.status(200).json({ message: 'Play already recorded recently' });
      }
    }
    
    // Record the play
    await pool.query(
      'INSERT INTO track_plays (track_id, user_id) VALUES ($1, $2)',
      [id, userId]
    );
    
    // Get updated play count
    const playCountResult = await pool.query(
      'SELECT play_count FROM tracks WHERE id = $1',
      [id]
    );
    
    res.status(200).json({ 
      message: 'Play recorded successfully',
      play_count: playCountResult.rows[0].play_count
    });
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
    // First check if the track exists and if it's private
    const trackCheck = await pool.query(
      'SELECT id, user_id, is_private, secret_token FROM tracks WHERE id = $1',
      [id]
    );
    
    if (trackCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Track not found' });
    }
    
    const track = trackCheck.rows[0];
    
    // If track is private, check if user is authorized to view it
    if (track.is_private) {
      // Allow access if user is the owner
      const isOwner = userId && track.user_id === userId;
      
      // Check if a valid secret token is provided
      const hasValidSecret = secret && track.secret_token && secret === track.secret_token;
      
      if (!isOwner && !hasValidSecret) {
        return res.status(403).json({ error: 'This track is private' });
      }
    }
    
    // First, get the current track
    const currentTrackResult = await pool.query(`
      SELECT 
        t.*,
        u.username,
        u.verified,
        u.profile_pic_url,
        (SELECT COUNT(*) FROM tracks t2 WHERE t2.parent_track_id = t.id) AS collab_count,
        EXISTS(SELECT 1 FROM likes WHERE user_id = $2 AND track_id = t.id) AS is_liked,
        (SELECT COUNT(*) FROM likes WHERE track_id = t.id) AS like_count,
        (SELECT COUNT(*) FROM tracks WHERE parent_track_id = t.id) AS child_count
      FROM tracks t
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.id = $1
    `, [id, userId || null]);
    
    if (currentTrackResult.rows.length === 0) {
      return res.status(404).json({ error: 'Track not found' });
    }
    
    const currentTrack = currentTrackResult.rows[0];
    
    // Get all ancestors (tracks up the tree to the root)
    const ancestors = [];
    let parentId = currentTrack.parent_track_id;
    
    while (parentId) {
      const parentResult = await pool.query(`
        SELECT 
          t.*,
          u.username,
          u.verified,
          u.profile_pic_url,
          (SELECT COUNT(*) FROM tracks t2 WHERE t2.parent_track_id = t.id) AS collab_count,
          EXISTS(SELECT 1 FROM likes WHERE user_id = $2 AND track_id = t.id) AS is_liked,
          (SELECT COUNT(*) FROM likes WHERE track_id = t.id) AS like_count,
          (SELECT COUNT(*) FROM tracks WHERE parent_track_id = t.id) AS child_count
        FROM tracks t
        LEFT JOIN users u ON t.user_id = u.id
        WHERE t.id = $1
      `, [parentId, userId || null]);
      
      if (parentResult.rows.length === 0) {
        break;
      }
      
      const parent = parentResult.rows[0];
      ancestors.unshift(parent); // Add to the beginning of the array
      parentId = parent.parent_track_id;
    }
    
    // Process all tracks to add signed URLs and tags
    const processTrack = async (track) => {
      let audioUrl = track.audio_url;
      let combinedAudioUrl = track.combined_audio_url || track.audio_url;
      
      if (audioUrl.startsWith('tracks/')) {
        audioUrl = s3.getSignedUrl('getObject', {
          Bucket: process.env.S3_BUCKET,
          Key: track.audio_url,
          Expires: 3600,
        });
      }
      if (combinedAudioUrl.startsWith('tracks/')) {
        combinedAudioUrl = s3.getSignedUrl('getObject', {
          Bucket: process.env.S3_BUCKET,
          Key: track.combined_audio_url || track.audio_url,
          Expires: 3600,
        });
      }
      
      // Get genres for this track
      const genresResult = await pool.query(
        `SELECT g.* FROM genres g
         JOIN track_genres tg ON g.id = tg.genre_id
         WHERE tg.track_id = $1
         ORDER BY g.name`,
        [track.id]
      );
      
      // Get instruments for this track
      const instrumentsResult = await pool.query(
        `SELECT i.* FROM instruments i
         JOIN track_instruments ti ON i.id = ti.instrument_id
         WHERE ti.track_id = $1
         ORDER BY i.name`,
        [track.id]
      );
      
      return { 
        ...track, 
        audio_url: audioUrl, 
        combined_audio_url: combinedAudioUrl,
        genres: genresResult.rows,
        instruments: instrumentsResult.rows
      };
    };
    
    // Process all tracks
    const processedCurrentTrack = await processTrack(currentTrack);
    const processedAncestors = await Promise.all(ancestors.map(processTrack));
    
    res.json([...processedAncestors, processedCurrentTrack]);
  } catch (err) {
    console.error('Error fetching track tree:', err);
    res.status(500).json({ error: err.message });
  }
});

// Toggle track privacy
router.put('/:id/privacy', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { is_private } = req.body;
  
  try {
    // Check if track exists and user is the owner
    const trackCheck = await pool.query(
      'SELECT user_id FROM tracks WHERE id = $1',
      [id]
    );
    
    if (trackCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Track not found' });
    }
    
    if (trackCheck.rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'You do not have permission to modify this track' });
    }
    
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
    
    // Update track privacy
    const result = await pool.query(
      'UPDATE tracks SET is_private = $1 WHERE id = $2 RETURNING *',
      [is_private, id]
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
router.post('/:id/share', authMiddleware, async (req, res) => {
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
    
    // If a secret token already exists, return it
    if (track.secret_token) {
      const shareLink = `${process.env.FRONTEND_URL}/track/${id}?secret=${track.secret_token}`;
      return res.json({ 
        shareLink,
        secretToken: track.secret_token
      });
    }
    
    // Generate a secure random token
    const secretToken = generateSecureToken();
    
    // Store the token in the tracks table
    await pool.query(
      'UPDATE tracks SET secret_token = $1 WHERE id = $2',
      [secretToken, id]
    );
    
    // Return the share link
    const shareLink = `${process.env.FRONTEND_URL}/track/${id}?secret=${secretToken}`;
    
    res.json({ 
      shareLink,
      secretToken
    });
  } catch (error) {
    console.error('Error generating share link:', error);
    res.status(500).json({ error: 'Failed to generate share link' });
  }
});

module.exports = router;