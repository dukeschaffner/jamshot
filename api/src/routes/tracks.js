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
  const { title, parent_track_id } = req.body;
  const userId = req.user.id;
  const file = req.file;

  if (!file) return res.status(400).json({ error: 'No audio file uploaded' });

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
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: `Upload failed: ${err.message}` });
  }
});

router.get('/:id/related', async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id; // Optional chaining in case user is not authenticated
  try {
    const result = await pool.query(`
      SELECT 
        t.id, t.title, t.audio_url, t.combined_audio_url, t.duration, t.layer, t.parent_track_id,
        u.username, u.verified,
        EXISTS(SELECT 1 FROM likes WHERE user_id = $2 AND track_id = t.id) AS is_liked,
        (SELECT COUNT(*) FROM likes WHERE track_id = t.id) AS like_count
      FROM tracks t
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.id = $1 OR t.parent_track_id = $1 OR t.id = (SELECT parent_track_id FROM tracks WHERE id = $1)
      ORDER BY t.created_at ASC
    `, [id, userId || null]);
    
    const tracks = result.rows.map(track => {
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
      return { ...track, combined_audio_url: combinedAudioUrl };
    });
    res.json(tracks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  const userId = req.user?.id; // Optional chaining in case user is not authenticated
  try {
    const result = await pool.query(`
      SELECT 
        t.id, t.user_id, t.title, t.audio_url, t.combined_audio_url, t.duration, t.layer, t.parent_track_id,
        u.username, u.verified,
        t2.title AS original_title,
        (SELECT COUNT(*) FROM tracks t3 WHERE t3.parent_track_id = t.id) AS collab_count,
        EXISTS(SELECT 1 FROM likes WHERE user_id = $1 AND track_id = t.id) AS is_liked,
        (SELECT COUNT(*) FROM likes WHERE track_id = t.id) AS like_count
      FROM tracks t
      LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
      LEFT JOIN users u ON t.user_id = u.id
      ORDER BY t.created_at DESC
    `, [userId || null]);
    const tracks = result.rows.map(track => {
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
      return { ...track, combined_audio_url: combinedAudioUrl };
    });
    res.json(tracks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Track and Versions
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id; // Optional chaining in case user is not authenticated
  try {
    const result = await pool.query(`
      SELECT 
        t.*,
        EXISTS(SELECT 1 FROM likes WHERE user_id = $2 AND track_id = t.id) AS is_liked,
        (SELECT COUNT(*) FROM likes WHERE track_id = t.id) AS like_count
      FROM tracks t
      WHERE t.id = $1 OR t.parent_track_id = $1 
      ORDER BY t.created_at ASC
    `, [id, userId || null]);
    const tracks = result.rows.map(track => {
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
      return { ...track, audio_url: audioUrl, combined_audio_url: combinedAudioUrl };
    });
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
    await pool.query(
      'INSERT INTO likes (user_id, track_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [userId, id]
    );
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
    const result = await pool.query(
      'INSERT INTO comments (user_id, track_id, content) VALUES ($1, $2, $3) RETURNING *',
      [userId, id, content]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;