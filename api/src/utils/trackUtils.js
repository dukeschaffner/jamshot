const AWS = require('aws-sdk');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const pool = require('../config/db');
const ffmpeg = require('fluent-ffmpeg');
const crypto = require('crypto');

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

// Generate a signed URL for S3
function generateSignedUrl(key, expiresIn = 3600) {
  if (!key || !key.startsWith('tracks/')) {
    return key; // Return the original key if it's not an S3 path
  }
  
  return s3.getSignedUrl('getObject', {
    Bucket: process.env.S3_BUCKET,
    Key: key,
    Expires: expiresIn,
  });
}

// Get genres for a track
async function getTrackGenres(trackId) {
  return await pool.query(
    `SELECT g.* FROM genres g
     JOIN track_genres tg ON g.id = tg.genre_id
     WHERE tg.track_id = $1
     ORDER BY g.name`,
    [trackId]
  );
}

// Get instruments for a track
async function getTrackInstruments(trackId) {
  return await pool.query(
    `SELECT i.* FROM instruments i
     JOIN track_instruments ti ON i.id = ti.instrument_id
     WHERE ti.track_id = $1
     ORDER BY i.name`,
    [trackId]
  );
}

// Process a single track (add signed URLs, fetch genres and instruments)
async function processTrack(track, userId = null) {
  // Convert S3 URLs to signed URLs
  let audioUrl = track.audio_url;
  let combinedAudioUrl = track.combined_audio_url || track.audio_url;
  
  // Generate signed URLs if paths are S3 paths
  if (audioUrl) {
    audioUrl = generateSignedUrl(audioUrl);
  }
  
  if (combinedAudioUrl) {
    combinedAudioUrl = generateSignedUrl(combinedAudioUrl);
  }
  
  // Get genres and instruments
  const [genresResult, instrumentsResult] = await Promise.all([
    getTrackGenres(track.id),
    getTrackInstruments(track.id)
  ]);
  
  return {
    ...track,
    audio_url: audioUrl,
    combined_audio_url: combinedAudioUrl,
    genres: genresResult.rows,
    instruments: instrumentsResult.rows
  };
}

// Download a file from S3 to a local path
async function downloadS3File(key, localPath) {
  const command = new GetObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: key,
  });
  const { Body } = await s3Client.send(command);
  const writer = fs.createWriteStream(localPath);
  Body.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

// Combine audio files using ffmpeg
async function combineAudioFiles(inputFiles, outputPath, gainValues = []) {
  return new Promise((resolve, reject) => {
    console.log('Combining files with ffmpeg:', inputFiles);
    console.log('Using gain values:', gainValues);
    
    const command = ffmpeg();
    
    // Add input files
    inputFiles.forEach((file) => {
      command.input(file);
    });
    
    // Create filter string with volume adjustments for each input
    let filterComplex = inputFiles.map((_, index) => {
      const gainValue = gainValues[index] !== undefined ? gainValues[index] : 1.0;
      // Convert gain (0-1 range) to dB for FFmpeg volume filter
      // 0 dB = no change, -6 dB = half volume, +6 dB = double volume
      // A simple approximation: 0.5 gain = -6dB, 0.8 gain = -2dB
      // Formula: dB = 20 * log10(gain)
      const dB = 20 * Math.log10(gainValue);
      console.log(`Input ${index}: Gain=${gainValue}, dB=${dB}`);
      return `[${index}:a]volume=${dB}dB[a${index}]`;
    }).join(';');
    
    // Add the mixer after the volume adjustments
    const audioInputs = inputFiles.map((_, index) => `[a${index}]`).join('');
    filterComplex += `;${audioInputs}amix=inputs=${inputFiles.length}:duration=longest[out]`;
    
    console.log('FFmpeg filter complex:', filterComplex);
    
    command
      .complexFilter(filterComplex, 'out')
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

// Check if a user has access to a private track
async function checkTrackAccess(trackId, userId = null, secretToken = null) {
  const trackCheck = await pool.query(
    'SELECT id, user_id, is_private, secret_token FROM tracks WHERE id = $1',
    [trackId]
  );
  
  if (trackCheck.rows.length === 0) {
    return { hasAccess: false, error: 'Track not found', status: 404 };
  }
  
  const track = trackCheck.rows[0];
  
  if (track.is_private) {
    const isOwner = userId && track.user_id === userId;
    const hasValidSecret = secretToken && track.secret_token && secretToken === track.secret_token;
    
    if (!isOwner && !hasValidSecret) {
      return { hasAccess: false, error: 'This track is private', status: 403 };
    }
  }
  
  return { hasAccess: true, track };
}

module.exports = {
  s3,
  s3Client,
  generateSignedUrl,
  getTrackGenres,
  getTrackInstruments,
  processTrack,
  downloadS3File,
  checkTrackAccess,
  combineAudioFiles,
  generateSecureToken
}; 