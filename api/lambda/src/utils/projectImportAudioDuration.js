import { GetObjectCommand } from '@aws-sdk/client-s3';
import * as mm from 'music-metadata';
import { s3Client } from './trackUtils.js';
import { normalizeR2ObjectKey } from './projectAssetUtils.js';

async function getAudioMetadataParser() {
  if (typeof mm.parseBuffer === 'function') {
    return mm;
  }
  if (typeof mm.loadMusicMetadata === 'function') {
    return await mm.loadMusicMetadata();
  }
  throw new Error('No parseBuffer or loadMusicMetadata found in music-metadata');
}

async function streamBodyToBuffer(body) {
  if (!body) return null;
  if (typeof body.transformToByteArray === 'function') {
    return Buffer.from(await body.transformToByteArray());
  }
  const chunks = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Read the true duration of an audio object in R2 (stem file length).
 * Do not use tracks.duration for collab stems — that is combined-mix length.
 *
 * @param {string} keyOrUrl - R2 key or public R2 URL
 * @returns {Promise<number|null>} duration in seconds, or null if unavailable
 */
export async function getR2AudioDurationSeconds(keyOrUrl) {
  const key = normalizeR2ObjectKey(keyOrUrl);
  if (!key) return null;

  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
      })
    );
    const buffer = await streamBodyToBuffer(response.Body);
    if (!buffer?.length) return null;

    const parser = await getAudioMetadataParser();
    const metadata = await parser.parseBuffer(buffer);
    const duration = metadata?.format?.duration;
    if (duration == null || !Number.isFinite(duration) || duration <= 0) {
      return null;
    }
    return Number(duration);
  } catch (err) {
    console.warn(`Failed to probe R2 audio duration for ${key}:`, err.message);
    return null;
  }
}
