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
require('dotenv').config;

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

// Apply optional auth middleware to all routes
router.use(optionalAuthMiddleware);

router.post('/upload', authMiddleware, upload.single('audio'), async (req, res) => {
  const { title, parent_track_id, genreIds, instrumentIds } = req.body;
  const userId = req.user.id;
  const file = req.file;

  if (!file) return res.status(400).json({ error: 'No audio file uploaded' });

  // Parse genre and instrument IDs if they're provided as strings
  const parsedGenreIds = genreIds ? (typeof genreIds === 'string' ? JSON.parse(genreIds) : genreIds) : [];
  const parsedInstrumentIds = instrumentIds ? (typeof instrumentIds === 'string' ? JSON.parse(instrumentIds) : instrumentIds) : [];

  let audioUrl, combinedAudioUrl, duration;
  const isLocal = process.env.NODE_ENV !== 'production';
  const tempDir = path.join(__dirname, '../../temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  try {
    const metadata = await mm.parseBuffer(file.buffer, file.mimetype);
    duration = Math.round(metadata.format.duration);
  } catch (err) {
    return res.status(500).json({ error: `Failed to parse audio metadata: ${err.message}` });
  }

  try {
    if (isLocal) {
      const localPath = path.join(uploadDir, `${Date.now()}-${file.originalname}`);
      await fsPromises.writeFile(localPath, file.buffer);
      audioUrl = `/uploads/${path.basename(localPath)}`;
      combinedAudioUrl = audioUrl;
    } else {
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

        duration = parentResult.rows[0].duration;

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
    }

    const result = await pool.query(
      'INSERT INTO tracks (user_id, title, audio_url, combined_audio_url, duration, parent_track_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [userId, title, audioUrl, combinedAudioUrl, duration, parent_track_id || null]
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
      if (process.env.NODE_ENV !== 'production') {
        combinedAudioUrl = `http://localhost:5000${combinedAudioUrl}`;
      } else if (combinedAudioUrl.startsWith('tracks/')) {
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
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;
  try {
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
      
      if (process.env.NODE_ENV !== 'production') {
        audioUrl = `http://localhost:5000${audioUrl}`;
        combinedAudioUrl = `http://localhost:5000${combinedAudioUrl}`;
      } else {
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
      if (process.env.NODE_ENV !== 'production') {
        combinedAudioUrl = `http://localhost:5000${combinedAudioUrl}`;
      } else if (combinedAudioUrl.startsWith('tracks/')) {
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
      if (process.env.NODE_ENV !== 'production') {
        combinedAudioUrl = `http://localhost:5000${combinedAudioUrl}`;
      } else if (combinedAudioUrl.startsWith('tracks/')) {
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

// Comment on a Track
router.post('/:id/comment', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;
  const userId = req.user.id;
  try {
    // Check if track exists and get track owner
    const trackCheck = await pool.query('SELECT user_id FROM tracks WHERE id = $1', [id]);
    if (trackCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Track not found' });
    }
    
    // Don't create notification if commenting on your own track
    const trackOwnerId = trackCheck.rows[0].user_id;
    
    const result = await pool.query(
      'INSERT INTO comments (user_id, track_id, content) VALUES ($1, $2, $3) RETURNING *',
      [userId, id, content]
    );
    
    // Create notification for track owner (if not commenting on own track)
    if (trackOwnerId !== userId) {
      await pool.query(
        'INSERT INTO notifications (user_id, type, related_track_id) VALUES ($1, $2, $3)',
        [trackOwnerId, 'comment', id]
      );
    }
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
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
      if (process.env.NODE_ENV !== 'production') {
        combinedAudioUrl = `http://localhost:5000${combinedAudioUrl}`;
      } else if (combinedAudioUrl.startsWith('tracks/')) {
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

module.exports = router;