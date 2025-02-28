const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const AWS = require('aws-sdk');
const pool = require('../config/db');
const authMiddleware = require('../middleware/auth');
require('dotenv').config();



const router = express.Router();

// Configure multer for local storage
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true }); // Create uploads dir if it doesn't exist
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});
const upload = multer({ storage });

// AWS S3 setup (for production)
AWS.config.update({
  signatureVersion: 'v4', // Force Signature Version 4
});

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

// Upload Track (local in dev, S3 in prod)
router.post('/upload', authMiddleware, upload.single('audio'), async (req, res) => {
  const { title, parent_track_id } = req.body;
  const userId = req.user.id;
  const file = req.file;

  const fileKey = `tracks/${file.filename}`;
  // const params = {
  //   Bucket: process.env.S3_BUCKET,
  //   Key: fileKey,
  //   Body: fs.createReadStream(file.path),
  //   ContentType: file.mimetype,
  // };

  try {
    //await s3.upload(params).promise();
    // fs.unlinkSync(file.path); // Clean up temp file after S3 upload
  } catch (err) {
    return res.status(500).json({ error: `S3 upload failed: ${err.message}` });
  }

  const fn = "tracks/1740718749054-pretty panama.mp3";

  try {
    const result = await pool.query(
      'INSERT INTO tracks (user_id, title, audio_url, parent_track_id, duration) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [userId, title, fn, 8 || null, 36]
    );
    const result1 = await pool.query(
      'INSERT INTO tracks (user_id, title, audio_url, parent_track_id, duration) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [userId, title, fn, 8 || null, 36]
    );
    const result2 = await pool.query(
      'INSERT INTO tracks (user_id, title, audio_url, parent_track_id, duration) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [userId, title, fn, 8 || null, 36]
    );
    const result3 = await pool.query(
      'INSERT INTO tracks (user_id, title, audio_url, parent_track_id, duration) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [userId, title, fn, 9 || null, 36]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: `Database error: ${err.message}` });
  }
});

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        t1.id, 
        t1.user_id, 
        t1.title, 
        t1.audio_url, 
        t1.duration, 
        t1.layer, 
        t1.parent_track_id, 
        t2.title AS original_title,
        (SELECT COUNT(*) FROM tracks t3 WHERE t3.parent_track_id = t1.id) AS collab_count
      FROM tracks t1
      LEFT JOIN tracks t2 ON t1.parent_track_id = t2.id
      ORDER BY t1.created_at DESC
    `);
    const tracks = result.rows.map(track => {
      let audioUrl = track.audio_url; // Default to raw key
      if (process.env.NODE_ENV !== 'production') {
        audioUrl = `http://localhost:5000${track.s3_key}`; // Local dev
      } else if (track.audio_url.startsWith('tracks/')) {
        audioUrl = s3.getSignedUrl('getObject', {
          Bucket: process.env.S3_BUCKET,
          Key: track.audio_url,
          Expires: 3600, // Short-lived for security
        });
      }
      return { ...track, audio_url: audioUrl }; // Return pre-signed URL
    });
    res.json(tracks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Track and Versions
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'SELECT * FROM tracks WHERE id = $1 OR parent_track_id = $1 ORDER BY created_at ASC',
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/related', async (req, res) => {
  const { id } = req.params;
  try {
    // Get original (parent) and collabs (children)
    const result = await pool.query(`
      SELECT 
        t.id, 
        t.title, 
        t.audio_url, 
        t.duration, 
        t.layer,
        t.parent_track_id
      FROM tracks t
      WHERE t.id = $1 
         OR t.parent_track_id = $1 
         OR t.id = (SELECT parent_track_id FROM tracks WHERE id = $1)
      ORDER BY t.created_at ASC
    `, [id]);
    
    const tracks = result.rows.map(track => {
      let audioUrl = track.audio_url;
      if (process.env.NODE_ENV !== 'production') {
        audioUrl = `http://localhost:5000${track.s3_key}`;
      } else if (track.audio_url.startsWith('tracks/')) {
        audioUrl = s3.getSignedUrl('getObject', {
          Bucket: process.env.S3_BUCKET,
          Key: track.audio_url,
          Expires: 3600,
        });
      }
      return { ...track, audio_url: audioUrl };
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