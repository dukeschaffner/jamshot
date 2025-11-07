const { S3Client, GetObjectCommand, PutObjectCommand, CopyObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');
const crypto = require('crypto');

// Cloudflare R2 setup
const s3Client = new S3Client({
  region: 'auto', // R2 uses 'auto' region
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  endpoint: process.env.R2_ENDPOINT,
});

// Generate a public URL for R2 (no signing needed for public access)
function generateSignedUrl(key, expiresIn = 3600) {
  if (!key || !key.startsWith('tracks/')) {
    return key; // Return the original key if it's not an R2 path
  }

  // Return public R2 URL for tracks
  return `${process.env.R2_PUBLIC_URL}/${key}`;
}

// Generate a pre-signed URL for direct S3 uploads
async function generateUploadUrl(userId, filename, fileSize, filenameBase = null) {
  // Use provided filenameBase or generate one
  const base = filenameBase || generateTrackFilenameBase();

  // Extract file extension from filename
  const ext = filename.split('.').pop();
  const tempFilename = `${base}-temp.${ext}`;

  const key = `uploads/temp/${userId}/${tempFilename}`;

  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
    ContentType: 'audio/*', // Allow any audio type
    ContentLength: fileSize,
    Metadata: {
      userId: userId.toString(),
      originalFilename: filename,
      uploadTimestamp: Date.now().toString(),
      filenameBase: base
    }
  });

  const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 }); // 15 minutes

  return {
    uploadUrl: signedUrl,
    key: key,
    filenameBase: base,
    expiresAt: new Date(Date.now() + 900 * 1000).toISOString()
  };
}

// Move a file from one S3 key to another
async function moveS3File(sourceKey, destinationKey) {
  try {
    // Validate environment variables
    if (!process.env.R2_BUCKET || typeof process.env.R2_BUCKET !== 'string') {
      throw new Error('R2_BUCKET environment variable is not set or is not a string');
    }

    // Copy the object to the new location
    await s3Client.send(new CopyObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: destinationKey,
      CopySource: `${process.env.R2_BUCKET}/${encodeURIComponent(sourceKey)}`
    }));

    // Delete the original object
    await s3Client.send(new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: sourceKey
    }));

    console.log(`Successfully moved S3 file from ${sourceKey} to ${destinationKey}`);
  } catch (error) {
    console.error('Error moving S3 file:', error);
    throw error;
  }
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
function getBaseTrackSelectQuery(isAuthenticated = true, userIdParamIndex = 1, includeDetails = true) {
  const baseQuery = `
    t.id, t.user_id, t.title, t.audio_url, t.combined_audio_url, t.duration,
    t.layer, t.parent_track_id, t.created_at, t.play_count, t.metronome_bpm, t.time_signature, t.allow_download,
    t.competition_id, t.is_competition_entry,
    u.username, u.verified, u.profile_pic_url, u.is_private AS creator_is_private,
    t2.title AS original_title,
    ${includeDetails ? 'u2.username AS original_username,' : ''}
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
    LEFT JOIN users u2 ON t2.user_id = u2.id
    WHERE ${privacyClause}
    AND t.processing_status = 'completed'
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
      LEFT JOIN users u2 ON t2.user_id = u2.id
      WHERE t.user_id IN (SELECT following_id FROM followed_users)
      AND (t.is_private = FALSE OR t.user_id = $1)
      AND t.processing_status = 'completed'
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
      LEFT JOIN users u2 ON t2.user_id = u2.id
      WHERE r.user_id IN (SELECT following_id FROM followed_users)
      AND (t.is_private = FALSE OR t.user_id = $1)
      AND t.processing_status = 'completed'
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
    LEFT JOIN users u2 ON t2.user_id = u2.id
    WHERE t.id NOT IN (
      SELECT id FROM followed_tracks
      UNION
      SELECT id FROM reposted_tracks
    )
    AND ${privacyClause}
    AND t.processing_status = 'completed'
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
      LEFT JOIN users u2 ON t2.user_id = u2.id
      WHERE t.user_id IN (SELECT following_id FROM followed_users)
      AND (t.is_private = FALSE OR t.user_id = $1)
      AND t.processing_status = 'completed'
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
      LEFT JOIN users u2 ON t2.user_id = u2.id
      WHERE r.user_id IN (SELECT following_id FROM followed_users)
      AND (t.is_private = FALSE OR t.user_id = $1)
      AND t.processing_status = 'completed'
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

  // Check if track has an active competition
  // Only query competition table for host tracks (competition_id exists but is_competition_entry is false)
  let has_active_competition = false;
  try {
    // If track has competition_id but is not an entry, it's a host track - query competition details
    if (track.competition_id && track.is_competition_entry === false) {
      const competitionQuery = `
        SELECT c.startdate, c.enddate
        FROM competitions c
        WHERE c.id = $1
      `;
      const competitionResult = await pool.query(competitionQuery, [track.competition_id]);

      if (competitionResult.rows.length > 0) {
        const competition = competitionResult.rows[0];
        const now = new Date();
        const startDate = new Date(competition.startdate);
        const endDate = new Date(competition.enddate);

        // Competition is active if current time is between start and end dates
        has_active_competition = now >= startDate && now <= endDate;
      }
    }
    // If track is an entry (is_competition_entry = true), has_active_competition remains false
    // If track has no competition_id, has_active_competition remains false
  } catch (error) {
    console.error('Error checking competition status:', error);
    // Don't fail the whole request if competition check fails
  }

  return {
    ...track,
    audio_url: audioUrl,
    combined_audio_url: combinedAudioUrl,
    genres: genresResult.rows,
    instruments: instrumentsResult.rows,
    has_active_competition
  };
}

// Download a file from R2 to a local path
async function downloadS3File(key, localPath) {
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET,
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

// Map UI gain (0–1) → dB value
function uiToDb(value) {
  if (value <= 0) return -100; // effectively mute
  return 20 * Math.log10(value);
}

// Audio processing functions moved to dedicated audio-processing lambda

// Audio conversion functions moved to dedicated audio-processing lambda

// Generate a secure random token
function generateSecureToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

// Generate a standardized track filename base (timestamp-guid)
function generateTrackFilenameBase() {
  const timestamp = Date.now();
  const guid = generateSecureToken(8); // 16 character hex string (8 bytes * 2 chars per byte)
  return `${timestamp}-${guid}`;
}

// Generate a standardized track filename with format: {timestamp}-{guid}-{type}.mp3
function generateStandardTrackFilename(type = 'raw', base = null) {
  const filenameBase = base || generateTrackFilenameBase();
  return `${filenameBase}-${type}.mp3`;
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

/**
 * Delete a track with proper S3 cleanup and soft/hard delete logic
 * @param {number} trackId - The track ID to delete
 * @param {number} userId - The user ID requesting deletion
 * @param {Object} options - Configuration options
 * @param {boolean} options.skipOwnershipCheck - Skip ownership verification (for user deletion)
 * @param {boolean} options.skipChildrenCheck - Skip children check and force hard delete
 * @param {boolean} options.returnResult - Return result object instead of throwing errors
 * @returns {Object} Deletion result with success status and details
 */
async function deleteTrack(trackId, userId, options = {}) {
  const { 
    skipOwnershipCheck = false,
    skipChildrenCheck = false,
    returnResult = false
  } = options;

  try {
    // Get track details
    const trackCheck = await pool.query(
      'SELECT user_id, audio_url, combined_audio_url FROM tracks WHERE id = $1',
      [trackId]
    );
    
    if (trackCheck.rows.length === 0) {
      if (returnResult) return { success: false, error: 'Track not found' };
      throw new Error('Track not found');
    }
    
    // Ownership check (skip for user deletion)
    if (!skipOwnershipCheck && trackCheck.rows[0].user_id !== userId) {
      if (returnResult) return { success: false, error: 'Permission denied' };
      throw new Error('You do not have permission to delete this track');
    }
    
    // Children check (can be skipped for user deletion)
    let hasChildren = false;
    if (!skipChildrenCheck) {
      const childrenCheck = await pool.query(
        'SELECT COUNT(*) FROM tracks WHERE parent_track_id = $1',
        [trackId]
      );
      hasChildren = parseInt(childrenCheck.rows[0].count) > 0;
    }
    
    if (hasChildren) {
      // Soft delete - clear user_id and make track public
      await pool.query(
        'UPDATE tracks SET user_id = NULL, is_private = FALSE WHERE id = $1',
        [trackId]
      );
      return { success: true, soft_delete: true, message: 'Track soft-deleted because it has collaborations' };
    } else {
      // Hard delete - remove track and delete files from S3
      const audioUrl = trackCheck.rows[0].audio_url;
      const combinedAudioUrl = trackCheck.rows[0].combined_audio_url;
      
      // Delete from database first
      await pool.query('DELETE FROM tracks WHERE id = $1', [trackId]);
      
      // Delete files from S3
      await deleteTrackS3Files(audioUrl, combinedAudioUrl);
      
      return { success: true, soft_delete: false, message: 'Track permanently deleted' };
    }
  } catch (error) {
    if (returnResult) {
      return { success: false, error: error.message };
    }
    throw error;
  }
}

/**
 * Delete track audio files from R2
 * @param {string} audioUrl - The original audio file R2 key
 * @param {string} combinedAudioUrl - The combined/processed audio file R2 key
 */
async function deleteTrackS3Files(audioUrl, combinedAudioUrl) {
  const deletePromises = [];

  if (audioUrl && audioUrl.startsWith('tracks/')) {
    deletePromises.push(
      s3Client.send(new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: audioUrl
      }))
    );
  }

  if (combinedAudioUrl && combinedAudioUrl !== audioUrl && combinedAudioUrl.startsWith('tracks/')) {
    deletePromises.push(
      s3Client.send(new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: combinedAudioUrl
      }))
    );
  }

  if (deletePromises.length > 0) {
    try {
      await Promise.all(deletePromises);
    } catch (r2Error) {
      console.error('Error deleting track files from R2:', r2Error);
      // Don't throw - R2 cleanup failures shouldn't block deletion
    }
  }
}

// Get complete stem chain for a track (used by DAW)
async function getStemChain(trackId) {
  // Get the track with its complete stem information
  const trackResult = await pool.query(
    'SELECT id, audio_url, combined_audio_url, mix_gains FROM tracks WHERE id = $1',
    [trackId]
  );

  if (!trackResult.rows[0]) {
    throw new Error('Track not found');
  }

  const track = trackResult.rows[0];
  const mixGains = track.mix_gains;



  // Get audio URLs and titles for all stems in the chain
  const stemIds = mixGains.stems.map(stem => stem.track_id);
  const stemsQuery = await pool.query(
    'SELECT id, audio_url, title FROM tracks WHERE id = ANY($1)',
    [stemIds]
  );

  // Create lookup maps for audio URLs and titles
  const audioUrlMap = {};
  const titleMap = {};
  stemsQuery.rows.forEach(row => {
    audioUrlMap[row.id] = row.audio_url;
    titleMap[row.id] = row.title;
  });

  // Build complete stem information
  const stems = mixGains.stems.map(stem => ({
    track_id: stem.track_id,
    audio_url: audioUrlMap[stem.track_id],
    title: titleMap[stem.track_id],
    gain: stem.gain,
    order: stem.order
  }));

  // Sort by order to maintain proper sequence
  return stems.sort((a, b) => a.order - b.order);
}

// Validate mix_gains structure
function validateMixGains(mixGains) {
  if (!mixGains || typeof mixGains !== 'object') {
    return false;
  }

  if (!Array.isArray(mixGains.stems)) {
    return false;
  }

  // Validate each stem has required fields
  for (const stem of mixGains.stems) {
    if (typeof stem.track_id !== 'number' ||
        typeof stem.gain !== 'number' ||
        typeof stem.order !== 'number') {
      return false;
    }

    if (stem.gain < 0 || stem.gain > 2) {
      return false; // Reasonable gain limits
    }
  }

  return true;
}

// Calculate effective gain for a stem in the final mix
function calculateEffectiveGain(trackId, mixGains) {
  if (!mixGains?.stems) return 1.0;

  const stem = mixGains.stems.find(s => s.track_id === trackId);
  return stem ? stem.gain : 1.0;
}

// Validate a stem chain for mixing and validate/update against provided stem gains
function validateAndUpdateStemChain(stemChain, parsedStemGains, maxStems = 10) {
  if (!stemChain || !parsedStemGains) {
    return { valid: false, error: 'Stem chain and parsedStemGains are required' };
  }

  if (!Array.isArray(stemChain)) {
    return { valid: false, error: 'Stem chain must be a non-empty array' };
  }

  if (!Array.isArray(parsedStemGains) || parsedStemGains.length === 0) {
    return { valid: false, error: 'parsedStemGains must be a non-empty array' };
  }

  if (stemChain.length > maxStems) {
    return {
      valid: false,
      error: `Stem chain too long (${stemChain.length}). Maximum: ${maxStems}`
    };
  }

  if(parsedStemGains.length !== stemChain.length + 1) {
    return { valid: false, error: 'parsedStemGains must have the same length as the stem chain plus one' };
  }

  for (let i = 0; i < stemChain.length; i++) {
    const stem = stemChain[i];

    if (!stem.track_id || typeof stem.track_id !== 'number') {
      return { valid: false, error: `Invalid track_id at index ${i}` };
    }

    if (!stem.audio_url || typeof stem.audio_url !== 'string') {
      return { valid: false, error: `Invalid audio_url at index ${i}` };
    }

    if (typeof stem.gain !== 'number' || stem.gain < 0 || stem.gain > 2) {
      return { valid: false, error: `Invalid gain at index ${i}: ${stem.gain}` };
    }

    if (typeof stem.order !== 'number' || stem.order < 0) {
      return { valid: false, error: `Invalid order at index ${i}: ${stem.order}` };
    }
  }

  // Check for duplicate track_ids
  const trackIds = stemChain.map(s => s.track_id);
  const uniqueTrackIds = [...new Set(trackIds)];
  if (trackIds.length !== uniqueTrackIds.length) {
    return { valid: false, error: 'Duplicate track_ids found in stem chain' };
  }

  // Check that all stem chain track_ids exist in parsedStemGains (except recording)
  const stemChainTrackIds = stemChain.map(s => s.track_id);
  const parsedStemGainsTrackIds = parsedStemGains.map(g => g.track_id);

  // Check that all stem chain track_ids are present in parsedStemGains
  for (const trackId of stemChainTrackIds) {
    if (!parsedStemGainsTrackIds.includes(trackId)) {
      return { valid: false, error: `parsedStemGains is missing gain for track_id: ${trackId}` };
    }
  }

  // Check that parsedStemGains has the 'recording' entry
  if (!parsedStemGainsTrackIds.includes('recording')) {
    return { valid: false, error: 'parsedStemGains must include an entry with track_id: "recording"' };
  }

  // Validate that all entries in parsedStemGains have valid gain values
  for (const gainEntry of parsedStemGains) {
    if (!gainEntry.track_id) {
      return { valid: false, error: 'parsedStemGains entry missing track_id' };
    }
    if (typeof gainEntry.gain !== 'number' || gainEntry.gain < 0 || gainEntry.gain > 2) {
      return { valid: false, error: `Invalid gain value for track_id ${gainEntry.track_id}: ${gainEntry.gain}` };
    }
  }

  // Update gain values in stemChain with values from parsedStemGains
  for (let i = 0; i < stemChain.length; i++) {
    const stem = stemChain[i];
    const matchingGainEntry = parsedStemGains.find(g => g.track_id === stem.track_id);
    if (matchingGainEntry) {
      stemChain[i].gain = matchingGainEntry.gain;
    }
  }

  // Add recording gain to the end of the stemChain
  stemChain.push({
    track_id: 'recording',
    audio_url: '',
    gain: parsedStemGains.find(g => g.track_id === 'recording').gain,
    order: stemChain.length
  });

  return { valid: true };
}

/**
 * Parse and validate track upload body parameters
 * @param {Object} body - The request body object
 * @returns {Object} Parsed and validated track upload parameters
 */
function parseTrackUploadBody(body) {
  // Parse initial body fields
  const { title, parent_track_id, enter_competition = false, s3Key, camp_id, room_id, key } = body;

  const {
    genreIds,
    instrumentIds,
    metronome_bpm,
    stem_gains,
    time_signature,
    is_private,
    allow_download,
    metronome_offset
  } = body;

  // Parse genre and instrument IDs if they're provided as strings
  const parsedGenreIds = genreIds ? (typeof genreIds === 'string' ? JSON.parse(genreIds) : genreIds) : [];
  const parsedInstrumentIds = instrumentIds ? (typeof instrumentIds === 'string' ? JSON.parse(instrumentIds) : instrumentIds) : [];
  
  // Parse metronome_bpm if provided
  let parsedMetronomeBpm = metronome_bpm ? parseInt(metronome_bpm, 10) : null;

  // Parse stem gains array if provided
  let parsedStemGains = null;
  if (stem_gains) {
    try {
      parsedStemGains = typeof stem_gains === 'string' ? JSON.parse(stem_gains) : stem_gains;
      if (!Array.isArray(parsedStemGains)) {
        console.warn('stem_gains is not an array, ignoring');
        parsedStemGains = null;
      } else {
        console.log('Parsed stem gains:', parsedStemGains);
      }
    } catch (error) {
      console.warn('Failed to parse stem_gains:', error);
      parsedStemGains = null;
    }
  }

  // Use the provided time signature or default to 4/4
  let parsedTimeSignature = time_signature || '4/4';
  
  // Parse the private flag (convert string 'true'/'false' to boolean if needed)
  let isPrivate = is_private === 'true' || is_private === true;
  
  // Parse the allow_download flag (default to true if not provided)
  let allowDownload = allow_download !== 'false' && allow_download !== false;

  // Parse metronome offset (clamp between 0 and 1)
  let parsedMetronomeOffset = metronome_offset ? Math.min(Math.max(parseFloat(metronome_offset), 0), 1) : 0;

  // Log the parsed upload parameters
  console.log('Upload processing request received:');
  console.log('- Title:', title);
  console.log('- Parent track ID:', parent_track_id || 'None (original track)');
  console.log('- S3 Key:', s3Key);
  console.log('- Stem gains:', parsedStemGains || 'Not provided');
  console.log('- Time signature:', parsedTimeSignature);
  console.log('- Metronome offset:', parsedMetronomeOffset);
  console.log('- Private:', isPrivate ? 'Yes' : 'No');
  console.log('- Allow download:', allowDownload ? 'Yes' : 'No');

  return {
    title,
    parent_track_id,
    enter_competition,
    s3Key,
    parsedGenreIds,
    parsedInstrumentIds,
    parsedMetronomeBpm,
    parsedStemGains,
    parsedTimeSignature,
    isPrivate,
    allowDownload,
    parsedMetronomeOffset,
    camp_id: camp_id ? parseInt(camp_id, 10) : null,
    room_id: room_id ? parseInt(room_id, 10) : null,
    key
  };
}

module.exports = {
  s3Client,
  generateSignedUrl,
  generateUploadUrl,
  moveS3File,
  getTrackGenres,
  getTrackInstruments,
  getTrackPrivacyClause,
  processTrack,
  downloadS3File,
  checkTrackAccess,
  generateSecureToken,
  generateTrackFilenameBase,
  generateStandardTrackFilename,
  getBaseTrackSelectQuery,
  getPopularFeedQuery,
  getFollowingFeedQuery,
  getForYouFeedQuery,
  findAllDescendantTracks,
  deleteTrack,
  deleteTrackS3Files,
  getStemChain,
  validateMixGains,
  calculateEffectiveGain,
  validateAndUpdateStemChain,
  parseTrackUploadBody
}; 