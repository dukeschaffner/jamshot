import fs from 'fs';
import path from 'path';
import { PutObjectCommand } from '@aws-sdk/client-s3';
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

export {
  buildProjectAssetFinalKey,
  buildProjectAssetTempKey,
  uploadLocalFileToR2,
  emitProjectAssetCreatedEvent,
};
