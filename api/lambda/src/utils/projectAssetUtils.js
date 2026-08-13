import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { CopyObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { s3Client } from './trackUtils.js';

const eventBridgeClient = new EventBridgeClient({
  region: process.env.AWS_REGION || 'us-east-2',
});

function getEventBusName() {
  const env = process.env.NODE_ENV;
  if (env === 'production') return 'sterio-prod-events';
  if (env === 'test') return 'sterio-test-events';
  return 'sterio-test-events';
}

/** Random {timestamp}-{16hex} base, same pattern as track audio filenames. */
function generateProjectAssetFilenameBase() {
  const timestamp = Date.now();
  const guid = crypto.randomBytes(8).toString('hex');
  return `${timestamp}-${guid}`;
}

/**
 * Final project asset object key. Uploads/recordings use .wav (default).
 * Collab imports may pass the source extension (e.g. .mp3) so key matches bytes.
 */
function buildProjectAssetFinalKey(filenameBase, extension = '.wav') {
  const raw = extension || '.wav';
  const ext = raw.startsWith('.') ? raw.toLowerCase() : `.${raw.toLowerCase()}`;
  return `projects/${filenameBase}${ext}`;
}

function buildProjectAssetWaveformKey(filenameBase) {
  return `waveforms/projects/${filenameBase}.json`;
}

function buildProjectAssetTempKey(filenameBase, originalFilename) {
  const ext = path.extname(originalFilename || '') || '.wav';
  return `temp/projects/${filenameBase}/source${ext}`;
}

async function uploadLocalFileToR2(localPath, key, contentType = 'audio/*') {
  const fileStream = fs.createReadStream(localPath);
  await s3Client.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: fileStream,
      ContentType: contentType,
    })
  );
}

async function emitProjectAssetCreatedEvent({
  assetId,
  projectId,
  s3Key,
  correlationId,
}) {
  if (process.env.NODE_ENV === 'dev') {
    console.log(
      `Skipping EventBridge event emission (dev mode) - asset ${assetId} will be processed by local monitor`
    );
    return;
  }

  const eventParams = {
    Entries: [
      {
        Source: 'sterio.projects',
        DetailType: 'project_asset_created',
        Detail: JSON.stringify({
          asset_id: assetId,
          project_id: projectId,
          s3_key: s3Key,
          correlation_id: correlationId,
          created_at: new Date().toISOString(),
        }),
        EventBusName: getEventBusName(),
      },
    ],
  };

  const eventCommand = new PutEventsCommand(eventParams);
  await eventBridgeClient.send(eventCommand);
  console.log(`EventBridge project_asset_created emitted for asset ${assetId}`);
}

/**
 * Copy existing stem waveform peaks into a project asset (e.g. import-track).
 * Returns the destination R2 key, or null if copy failed or source missing.
 */
async function copyProjectAssetWaveformFromSource(sourceWaveformKey, filenameBase) {
  if (!sourceWaveformKey || !sourceWaveformKey.startsWith('waveforms/')) {
    return null;
  }

  const destKey = buildProjectAssetWaveformKey(filenameBase);

  try {
    await s3Client.send(
      new CopyObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: destKey,
        CopySource: `${process.env.R2_BUCKET}/${encodeURIComponent(sourceWaveformKey)}`,
      })
    );
    return destKey;
  } catch (err) {
    console.warn(
      `Failed to copy waveform peaks from ${sourceWaveformKey} to ${destKey}:`,
      err.message
    );
    return null;
  }
}

/**
 * Normalize a storage key or public R2 URL to a bucket-relative key.
 * @param {string} keyOrUrl
 * @returns {string|null}
 */
function normalizeR2ObjectKey(keyOrUrl) {
  if (!keyOrUrl || typeof keyOrUrl !== 'string') return null;

  let key = keyOrUrl;
  const publicPrefix = process.env.R2_PUBLIC_URL
    ? `${process.env.R2_PUBLIC_URL.replace(/\/$/, '')}/`
    : null;
  if (publicPrefix && key.startsWith(publicPrefix)) {
    key = key.slice(publicPrefix.length);
  }
  if (key.startsWith('http://') || key.startsWith('https://')) {
    return null;
  }
  return key;
}

/**
 * Read ContentLength for an R2 object.
 * @param {string} keyOrUrl
 * @returns {Promise<number|null>}
 */
async function getR2ObjectByteSize(keyOrUrl) {
  const key = normalizeR2ObjectKey(keyOrUrl);
  if (!key) return null;

  try {
    const head = await s3Client.send(
      new HeadObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
      })
    );
    return head.ContentLength != null ? Number(head.ContentLength) : null;
  } catch (err) {
    console.warn(`Failed to read R2 object size for ${key}:`, err.message);
    return null;
  }
}

function mimeTypeForAudioExtension(extension) {
  const ext = (extension || '').toLowerCase();
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.ogg') return 'audio/ogg';
  if (ext === '.flac') return 'audio/flac';
  if (ext === '.m4a' || ext === '.mp4') return 'audio/mp4';
  return 'audio/*';
}

/**
 * Copy a social-track audio object into a project asset key using the source
 * extension (usually .mp3). Key + Content-Type + returned mime must match bytes —
 * never write MPEG under a .wav key.
 *
 * @param {string} sourceAudioKey - R2 key (e.g. tracks/...)
 * @param {string} filenameBase - random {timestamp}-{16hex} base
 * @returns {Promise<{ storageKey: string, fileSizeBytes: number|null, mimeType: string }>}
 */
async function copyProjectAssetAudioFromSource(sourceAudioKey, filenameBase) {
  if (!sourceAudioKey || typeof sourceAudioKey !== 'string') {
    throw new Error('Source audio key is required');
  }

  const sourceKey = normalizeR2ObjectKey(sourceAudioKey);
  if (!sourceKey) {
    throw new Error('Cannot copy audio from an external URL');
  }

  const sourceExtension = path.extname(sourceKey) || '.mp3';
  const mimeType = mimeTypeForAudioExtension(sourceExtension);
  const destKey = buildProjectAssetFinalKey(filenameBase, sourceExtension);

  await s3Client.send(
    new CopyObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: destKey,
      CopySource: `${process.env.R2_BUCKET}/${encodeURIComponent(sourceKey)}`,
      ContentType: mimeType,
      MetadataDirective: 'REPLACE',
    })
  );

  const fileSizeBytes = await getR2ObjectByteSize(destKey);
  return { storageKey: destKey, fileSizeBytes, mimeType };
}

export {
  generateProjectAssetFilenameBase,
  buildProjectAssetFinalKey,
  buildProjectAssetWaveformKey,
  buildProjectAssetTempKey,
  uploadLocalFileToR2,
  emitProjectAssetCreatedEvent,
  copyProjectAssetWaveformFromSource,
  copyProjectAssetAudioFromSource,
  normalizeR2ObjectKey,
  getR2ObjectByteSize,
};
