import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';

let _s3Client = null;

function getS3Client() {
  if (!_s3Client) {
    _s3Client = new S3Client({
      region: 'auto',
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
      endpoint: process.env.R2_ENDPOINT,
    });
  }
  return _s3Client;
}

function isDeletableStorageKey(storageKey) {
  // 'pending' is a DB placeholder, not an R2 object. temp/ keys are real uploads.
  if (!storageKey || storageKey === 'pending') {
    return false;
  }
  return true;
}

/**
 * Delete a single object from R2. No-op for placeholder pending keys.
 *
 * @returns {Promise<{ key: string, deleted: boolean, error?: string }>}
 */
export async function deleteR2Object(storageKey) {
  if (!isDeletableStorageKey(storageKey)) {
    return { key: storageKey, deleted: false };
  }

  try {
    await getS3Client().send(
      new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: storageKey,
      })
    );
    return { key: storageKey, deleted: true };
  } catch (err) {
    console.error('Failed to delete R2 object:', storageKey, err.message);
    return { key: storageKey, deleted: false, error: err.message };
  }
}

/**
 * Delete audio + waveform blobs for a project asset.
 *
 * @returns {Promise<{ storageKey?: string, waveformKey?: string, errors: string[] }>}
 */
export async function deleteProjectAssetBlobs({ storageKey, waveformKey }) {
  const errors = [];
  const results = {};

  if (isDeletableStorageKey(storageKey)) {
    const audioResult = await deleteR2Object(storageKey);
    results.storageKey = storageKey;
    if (audioResult.error) {
      errors.push(`audio:${audioResult.error}`);
    }
  }

  if (isDeletableStorageKey(waveformKey)) {
    const waveformResult = await deleteR2Object(waveformKey);
    results.waveformKey = waveformKey;
    if (waveformResult.error) {
      errors.push(`waveform:${waveformResult.error}`);
    }
  }

  return { ...results, errors };
}
