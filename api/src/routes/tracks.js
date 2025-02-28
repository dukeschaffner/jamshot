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

  let audioUrl;
  const isLocal = process.env.NODE_ENV !== 'production'; // Check if running locally

  if (isLocal) {
    // Local storage: Serve from uploads directory
    audioUrl = `/uploads/${file.filename}`; // Relative path for local serving
  } else {
    // Production: Upload to S3

    const fileKey = `tracks/${file.filename}`;
    const params = {
      Bucket: process.env.S3_BUCKET,
      Key: fileKey,
      Body: fs.createReadStream(file.path),
      ContentType: file.mimetype,
    };

    try {
      await s3.upload(params).promise();
      audioUrl = s3.getSignedUrl('getObject', { Bucket: process.env.S3_BUCKET, Key: fileKey, Expires: 3600 });
      fs.unlinkSync(file.path); // Clean up temp file after S3 upload
    } catch (err) {
      return res.status(500).json({ error: `S3 upload failed: ${err.message}` });
    }
  }

  try {
    const result = await pool.query(
      'INSERT INTO tracks (user_id, title, audio_url, parent_track_id, duration) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [userId, title, audioUrl, parent_track_id || null, 36]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: `Database error: ${err.message}` });
  }
});

router.get('/', async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM tracks ORDER BY created_at DESC');
      res.json(result.rows);
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