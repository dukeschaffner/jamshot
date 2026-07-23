import fs from 'fs';
import path from 'path';
import { CopyObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
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

function buildProjectAssetFinalKey(projectId, assetId) {
  return `projects/${projectId}/${assetId}/audio.wav`;
}

function buildProjectAssetWaveformKey(projectId, assetId) {
  return `waveforms/projects/${projectId}/${assetId}.json`;
}

function buildProjectAssetTempKey(projectId, assetId, originalFilename) {
  const ext = path.extname(originalFilename || '') || '.wav';
  return `temp/projects/${projectId}/${assetId}/source${ext}`;
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
async function copyProjectAssetWaveformFromSource(sourceWaveformKey, projectId, assetId) {
  if (!sourceWaveformKey || !sourceWaveformKey.startsWith('waveforms/')) {
    return null;
  }

  const destKey = buildProjectAssetWaveformKey(projectId, assetId);

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
 * Copy a social-track audio object into a project asset storage key.
 * @param {string} sourceAudioKey - R2 key (e.g. tracks/...)
 * @param {number|string} projectId
 * @param {number|string} assetId
 * @returns {Promise<string>} destination key
 */
async function copyProjectAssetAudioFromSource(sourceAudioKey, projectId, assetId) {
  if (!sourceAudioKey || typeof sourceAudioKey !== 'string') {
    throw new Error('Source audio key is required');
  }

  // Allow keys that are already tracks/... or full public URLs by stripping the public prefix
  let sourceKey = sourceAudioKey;
  const publicPrefix = process.env.R2_PUBLIC_URL
    ? `${process.env.R2_PUBLIC_URL.replace(/\/$/, '')}/`
    : null;
  if (publicPrefix && sourceKey.startsWith(publicPrefix)) {
    sourceKey = sourceKey.slice(publicPrefix.length);
  }
  if (sourceKey.startsWith('http://') || sourceKey.startsWith('https://')) {
    throw new Error('Cannot copy audio from an external URL');
  }

  const destKey = buildProjectAssetFinalKey(projectId, assetId);

  await s3Client.send(
    new CopyObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: destKey,
      CopySource: `${process.env.R2_BUCKET}/${encodeURIComponent(sourceKey)}`,
    })
  );

  return destKey;
}

export {
  buildProjectAssetFinalKey,
  buildProjectAssetWaveformKey,
  buildProjectAssetTempKey,
  uploadLocalFileToR2,
  emitProjectAssetCreatedEvent,
  copyProjectAssetWaveformFromSource,
  copyProjectAssetAudioFromSource,
};
