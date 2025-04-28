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

// Generate a standardized base query for track selection
function getBaseTrackSelectQuery(isAuthenticated = true, userIdParamIndex = 1) {
  const baseQuery = `
    t.id, t.user_id, t.title, t.audio_url, t.combined_audio_url, t.duration, 
    t.layer, t.parent_track_id, t.created_at, t.play_count, t.metronome_bpm, t.time_signature,
    u.username, u.verified, u.profile_pic_url,
    t2.title AS original_title,
    (SELECT COUNT(*) FROM tracks t3 WHERE t3.parent_track_id = t.id) AS collab_count,
    (SELECT COUNT(*) FROM likes WHERE track_id = t.id) AS like_count,
    (SELECT COUNT(*) FROM reposts WHERE track_id = t.id) AS repost_count,
    (SELECT COUNT(*) FROM comments WHERE track_id = t.id) AS comment_count
  `;
  
  // Only include user-specific fields if authenticated
  if (isAuthenticated) {
    return `
      ${baseQuery},
      EXISTS(SELECT 1 FROM likes WHERE user_id = $${userIdParamIndex} AND track_id = t.id) AS is_liked,
      EXISTS(SELECT 1 FROM reposts WHERE user_id = $${userIdParamIndex} AND track_id = t.id) AS is_reposted
    `;
  }
  
  return `
    ${baseQuery},
    FALSE AS is_liked,
    FALSE AS is_reposted
  `;
}

// Get the privacy clause for a track
// If the user is authenticated, we need to check if the track is private or if the user is the owner
// If the user is not authenticated, we only need to check if the track is not private
// Also check if the track owner account is private
// If the track owner account is private, we need to check if the user is following the track owner
function getTrackPrivacyClause(isAuthenticated = true, userIdParamIndex = 1) {
  if (isAuthenticated) {
    return `
      (
        (t.is_private = FALSE AND u.is_private = FALSE) OR
        (t.user_id = $${userIdParamIndex}) OR
        (t.is_private = FALSE AND u.is_private = TRUE AND EXISTS(
          SELECT 1 FROM follows WHERE follower_id = $${userIdParamIndex} AND following_id = t.user_id
        ))
      )
    `;
  } else {
    return `
      (t.is_private = FALSE AND u.is_private = FALSE)
    `;
  }

}

/**
 * Generate a standardized popular feed query
 * @param {boolean} isAuthenticated - Whether the user is authenticated
 * @param {number} limitParamIndex - The parameter index for the limit value in the query
 * @param {number} offsetParamIndex - The parameter index for the offset value in the query
 * @param {boolean} includeRepostMetadata - Whether to include repost metadata fields
 * @returns {string} The SQL query string
 */
function getPopularFeedQuery(isAuthenticated = true, userIdParamIndex = 1, limitParamIndex = 2, offsetParamIndex = 3, includeRepostMetadata = false) {
  let query = `
    SELECT 
      ${getBaseTrackSelectQuery(isAuthenticated, userIdParamIndex)}
  `;
  
  // Add repost metadata if requested
  if (includeRepostMetadata) {
    query += `,
      NULL::integer AS reposted_by_id,
      NULL::text AS reposted_by_username,
      NULL::timestamp AS reposted_at,
      FALSE AS is_repost
    `;
  }

  const privacyClause = getTrackPrivacyClause(isAuthenticated, userIdParamIndex);
  
  query += `
    FROM tracks t
    LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
    LEFT JOIN users u ON t.user_id = u.id
    WHERE ${privacyClause}
    ORDER BY like_count DESC, t.created_at DESC
    LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}
  `;
  
  return query;
}

/**
 * Generate a standardized following feed query
 * @param {number} limitParamIndex - The parameter index for the limit value in the query
 * @param {number} offsetParamIndex - The parameter index for the offset value in the query
 * @returns {string} The SQL query string
 */
function getFollowingFeedQuery(limitParamIndex = 2, offsetParamIndex = 3) {
  return `
    WITH followed_users AS (
      SELECT following_id FROM follows WHERE follower_id = $1
    ),
    followed_tracks AS (
      SELECT 
        ${getBaseTrackSelectQuery(true)},
        NULL::integer AS reposted_by_id,
        NULL::text AS reposted_by_username,
        NULL::timestamp AS reposted_at,
        FALSE AS is_repost
      FROM tracks t
      LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.user_id IN (SELECT following_id FROM followed_users)
      AND (t.is_private = FALSE OR t.user_id = $1)
    ),
    reposted_tracks AS (
      SELECT 
        ${getBaseTrackSelectQuery(true)},
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
      AND (t.is_private = FALSE OR t.user_id = $1)
    )
    SELECT * FROM (
      SELECT * FROM followed_tracks
      UNION ALL
      SELECT * FROM reposted_tracks
    ) combined
    ORDER BY created_at DESC
    LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}
  `;
}

/**
 * Generate a standardized query for the "For You" feed that combines followed content and popular tracks
 * @param {number} limitParamIndex - The parameter index for the limit value in the query
 * @param {number} offsetParamIndex - The parameter index for the offset value in the query
 * @returns {string} The SQL query string
 */
function getForYouFeedQuery(limitParamIndex = 2, offsetParamIndex = 3) {
  const privacyClause = getTrackPrivacyClause(true, 1);
  const popularWithExclusions = `
    SELECT 
      ${getBaseTrackSelectQuery(true)},
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
    AND ${privacyClause}
    ORDER BY like_count DESC
    LIMIT $${limitParamIndex}
  `;

  return `
    WITH followed_users AS (
      SELECT following_id FROM follows WHERE follower_id = $1
    ),
    followed_tracks AS (
      SELECT 
        ${getBaseTrackSelectQuery(true)},
        NULL::integer AS reposted_by_id,
        NULL::text AS reposted_by_username,
        NULL::timestamp AS reposted_at,
        FALSE AS is_repost,
        1 AS priority
      FROM tracks t
      LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.user_id IN (SELECT following_id FROM followed_users)
      AND (t.is_private = FALSE OR t.user_id = $1)
    ),
    reposted_tracks AS (
      SELECT 
        ${getBaseTrackSelectQuery(true)},
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
      AND (t.is_private = FALSE OR t.user_id = $1)
    ),
    popular_tracks AS (
      ${popularWithExclusions}
    )
    SELECT * FROM (
      SELECT * FROM followed_tracks
      UNION ALL
      SELECT * FROM reposted_tracks
      UNION ALL
      SELECT * FROM popular_tracks
    ) combined
    ORDER BY priority, created_at DESC
    LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}
  `;
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
    `SELECT t.id, t.user_id, t.is_private, t.secret_token, t.parent_track_id, 
            p.is_private as parent_is_private, p.secret_token as parent_secret_token
     FROM tracks t
     LEFT JOIN tracks p ON t.parent_track_id = p.id
     WHERE t.id = $1`,
    [trackId]
  );
  
  if (trackCheck.rows.length === 0) {
    return { hasAccess: false, error: 'Track not found', status: 404 };
  }
  
  const track = trackCheck.rows[0];
  
  if (track.is_private) {
    const isOwner = userId && track.user_id === userId;
    
    // Check if the provided secret token matches any in the track lineage
    let hasValidSecret = secretToken && (
      (track.secret_token && secretToken === track.secret_token) || 
      (track.parent_secret_token && secretToken === track.parent_secret_token)
    );
    
    // If secret doesn't match directly, check the entire track ancestry for a matching token
    if (!hasValidSecret && secretToken && track.parent_track_id) {
      const ancestryCheck = await pool.query(
        `WITH RECURSIVE track_ancestry AS (
          SELECT id, parent_track_id, secret_token
          FROM tracks
          WHERE id = $1
          
          UNION
          
          SELECT t.id, t.parent_track_id, t.secret_token
          FROM tracks t
          JOIN track_ancestry ta ON t.id = ta.parent_track_id
        )
        SELECT secret_token FROM track_ancestry WHERE secret_token = $2 LIMIT 1`,
        [trackId, secretToken]
      );
      
      hasValidSecret = ancestryCheck.rows.length > 0;
    }
    
    if (!isOwner && !hasValidSecret) {
      return { hasAccess: false, error: 'This track is private', status: 403 };
    }
  }
  
  return { hasAccess: true, track };
}

// Helper function to find all descendant tracks (direct and indirect children)
async function findAllDescendantTracks(trackId) {
    const descendants = [];
    const queue = [trackId];
    
    while (queue.length > 0) {
      const currentId = queue.shift();
      
      // Find direct children of the current track
      const childrenResult = await pool.query(
        'SELECT id FROM tracks WHERE parent_track_id = $1',
        [currentId]
      );
      
      for (const child of childrenResult.rows) {
        descendants.push(child.id);
        queue.push(child.id);
      }
    }
    
    return descendants;
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
  generateSecureToken,
  getBaseTrackSelectQuery,
  getPopularFeedQuery,
  getFollowingFeedQuery,
  getForYouFeedQuery,
  findAllDescendantTracks
}; 