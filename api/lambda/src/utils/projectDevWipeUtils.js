import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import pool from '../config/db.js';

const PROJECT_R2_PREFIXES = ['projects/', 'temp/projects/', 'waveforms/projects/'];

const PROJECT_TABLE_COUNTS = [
  { table: 'projects', label: 'projects' },
  { table: 'project_members', label: 'projectMembers' },
  { table: 'project_tracks', label: 'projectTracks' },
  { table: 'project_assets', label: 'projectAssets' },
  { table: 'project_clips', label: 'projectClips' },
  { table: 'project_snapshots', label: 'projectSnapshots' },
  { table: 'project_snapshot_assets', label: 'projectSnapshotAssets' },
  { table: 'project_invites', label: 'projectInvites' },
  { table: 'project_ws_connections', label: 'projectWsConnections' },
  { table: 'project_track_locks', label: 'projectTrackLocks' },
  { table: 'project_metadata_locks', label: 'projectMetadataLocks' },
  { table: 'project_ws_op_dedup', label: 'projectWsOpDedup' },
];

/**
 * Hard guard — this utility must never run outside local dev.
 */
export function assertLocalDevOnly() {
  if (process.env.NODE_ENV !== 'dev') {
    throw new Error(
      'wipeAllProjectData is only available when NODE_ENV=dev'
    );
  }
}

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

async function countTableRows(client, table) {
  const result = await client.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
  return result.rows[0].count;
}

export async function getProjectDataCounts() {
  const client = await pool.connect();
  try {
    const counts = {};
    for (const { table, label } of PROJECT_TABLE_COUNTS) {
      counts[label] = await countTableRows(client, table);
    }
    return counts;
  } finally {
    client.release();
  }
}

async function listR2PrefixObjectCount(prefix) {
  let continuationToken;
  let count = 0;

  do {
    const listResult = await getS3Client().send(
      new ListObjectsV2Command({
        Bucket: process.env.R2_BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );

    count += (listResult.Contents || []).length;
    continuationToken = listResult.IsTruncated
      ? listResult.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return count;
}

export async function getProjectR2Counts() {
  const counts = {};
  for (const prefix of PROJECT_R2_PREFIXES) {
    counts[prefix] = await listR2PrefixObjectCount(prefix);
  }
  counts.total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  return counts;
}

async function deleteR2Prefix(prefix) {
  let continuationToken;
  let deleted = 0;

  do {
    const listResult = await getS3Client().send(
      new ListObjectsV2Command({
        Bucket: process.env.R2_BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );

    const keys = (listResult.Contents || [])
      .map((object) => object.Key)
      .filter(Boolean)
      .map((key) => ({ Key: key }));

    if (keys.length > 0) {
      const deleteResult = await getS3Client().send(
        new DeleteObjectsCommand({
          Bucket: process.env.R2_BUCKET,
          Delete: { Objects: keys, Quiet: true },
        })
      );

      deleted += keys.length - (deleteResult.Errors?.length ?? 0);

      if (deleteResult.Errors?.length) {
        for (const error of deleteResult.Errors) {
          console.error(`Failed to delete R2 object ${error.Key}:`, error.Message);
        }
      }
    }

    continuationToken = listResult.IsTruncated
      ? listResult.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return deleted;
}

async function wipeProjectDatabase(client) {
  const deleted = {};

  await client.query('BEGIN');

  try {
    const clipsResult = await client.query('DELETE FROM project_clips');
    deleted.projectClips = clipsResult.rowCount ?? 0;

    const snapshotAssetsResult = await client.query(
      'DELETE FROM project_snapshot_assets'
    );
    deleted.projectSnapshotAssets = snapshotAssetsResult.rowCount ?? 0;

    const locksResult = await client.query('DELETE FROM project_track_locks');
    deleted.projectTrackLocks = locksResult.rowCount ?? 0;

    const metadataLocksResult = await client.query(
      'DELETE FROM project_metadata_locks'
    );
    deleted.projectMetadataLocks = metadataLocksResult.rowCount ?? 0;

    const wsConnectionsResult = await client.query(
      'DELETE FROM project_ws_connections'
    );
    deleted.projectWsConnections = wsConnectionsResult.rowCount ?? 0;

    const wsOpDedupResult = await client.query('DELETE FROM project_ws_op_dedup');
    deleted.projectWsOpDedup = wsOpDedupResult.rowCount ?? 0;

    const projectsResult = await client.query('DELETE FROM projects');
    deleted.projects = projectsResult.rowCount ?? 0;

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }

  return deleted;
}

/**
 * Delete all project rows and project-scoped R2 blobs. Local dev only.
 *
 * @param {object} [options]
 * @param {boolean} [options.dryRun=true]
 * @param {boolean} [options.confirm=false]
 */
export async function wipeAllProjectData({ dryRun = true, confirm = false } = {}) {
  assertLocalDevOnly();

  if (!dryRun && !confirm) {
    throw new Error(
      'Refusing to wipe project data without confirm: true (or use --confirm)'
    );
  }

  const dbCountsBefore = await getProjectDataCounts();
  const r2CountsBefore = await getProjectR2Counts();

  if (dryRun) {
    return {
      dryRun: true,
      dbCountsBefore,
      r2CountsBefore,
      deleted: null,
    };
  }

  const client = await pool.connect();
  let dbDeleted;

  try {
    dbDeleted = await wipeProjectDatabase(client);
  } finally {
    client.release();
  }

  const r2Deleted = {};
  for (const prefix of PROJECT_R2_PREFIXES) {
    r2Deleted[prefix] = await deleteR2Prefix(prefix);
  }
  r2Deleted.total = Object.values(r2Deleted).reduce((sum, value) => sum + value, 0);

  const dbCountsAfter = await getProjectDataCounts();
  const r2CountsAfter = await getProjectR2Counts();

  return {
    dryRun: false,
    dbCountsBefore,
    r2CountsBefore,
    dbDeleted,
    r2Deleted,
    dbCountsAfter,
    r2CountsAfter,
  };
}
