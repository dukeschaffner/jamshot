import '@sterio/dev-env/config';
import { spawn } from 'child_process';
import { createLambdaPool } from '@sterio/db-config';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { logProcessFailure } from './utils/devProcessFailure.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database connection
const pool = createLambdaPool();

const useBuilt = process.env.USE_BUILT === 'true';

console.log('🎵 Jamshot Audio Processing Dev Server');
console.log('=====================================');
if (useBuilt) {
  console.log('📦 Running with built code from /dist');
} else {
  console.log('📝 Running with source code');
}
console.log('Monitoring database for tracks and project assets needing processing...\n');

// Track processing status to avoid duplicate processing
const processingTracks = new Set();
const processingAssets = new Set();
let monitorCycleInProgress = false;

async function checkForTracksToProcess() {
  try {
    const result = await pool.query(
      `SELECT id, title, audio_url, combined_audio_url, processing_status, created_at
       FROM tracks
       WHERE processing_status = 'processing'
       AND id != ALL($1)
       ORDER BY created_at DESC
       LIMIT 5`,
      [Array.from(processingTracks)]
    );

    if (result.rows.length > 0) {
      console.log(`🔍 Found ${result.rows.length} track(s) to process:`);

      for (const track of result.rows) {
        console.log(`  📀 ${track.title} (ID: ${track.id}) - Created: ${track.created_at}`);

        processingTracks.add(track.id);
        await processTrack(track);
      }
      console.log('');
    }
  } catch (error) {
    console.error('❌ Error checking for tracks to process:', error.message);
  }
}

async function repairInconsistentProjectAssets() {
  try {
    const result = await pool.query(
      `UPDATE project_assets
       SET processing_status = 'completed',
           processing_error = NULL
       WHERE processing_status IN ('failed', 'processing')
         AND storage_key ~ '^projects/[^/]+\\.wav$'
       RETURNING id`
    );

    if (result.rows.length > 0) {
      const ids = result.rows.map((row) => row.id).join(', ');
      console.log(`🔧 Repaired inconsistent project asset status for: ${ids}`);
    }
  } catch (error) {
    console.error('❌ Error repairing project asset statuses:', error.message);
  }
}

async function checkForProjectAssetsToProcess() {
  try {
    await repairInconsistentProjectAssets();

    const result = await pool.query(
      `SELECT id, project_id, storage_key, name, processing_status, created_at
       FROM project_assets
       WHERE (
         processing_status = 'pending'
         OR (
           processing_status = 'processing'
           AND storage_key LIKE 'temp/%'
           AND updated_at < NOW() - INTERVAL '2 minutes'
         )
       )
       AND (storage_key IS NULL OR storage_key LIKE 'temp/%')
       AND id != ALL($1)
       ORDER BY created_at ASC
       LIMIT 5`,
      [Array.from(processingAssets)]
    );

    if (result.rows.length > 0) {
      console.log(`🔍 Found ${result.rows.length} project asset(s) to process:`);

      for (const asset of result.rows) {
        if (processingAssets.has(asset.id)) {
          continue;
        }

        console.log(
          `  🎚️  Asset ${asset.id} (project ${asset.project_id}) - Created: ${asset.created_at}`
        );

        processingAssets.add(asset.id);
        await processProjectAsset(asset);
      }
      console.log('');
    }
  } catch (error) {
    console.error('❌ Error checking for project assets to process:', error.message);
  }
}

async function processTrack(track) {
  return new Promise((resolve, reject) => {
    console.log(`🎵 Processing track: ${track.title} (ID: ${track.id})`);

    // Determine which lambda file to use based on USE_BUILT flag
    const lambdaFile = useBuilt ? 'dist/index.mjs' : 'index.js';
    const lambdaCwd = __dirname;

    // Spawn the audio processing lambda
    const lambdaProcess = spawn('node', [
      lambdaFile
    ], {
      cwd: lambdaCwd,
      env: {
        ...process.env,
        // Pass track data as environment variables (simulating EventBridge)
        TRACK_ID: track.id,
        S3_KEY: track.audio_url?.replace('tracks/', 'temp/tracks/') || '', // Convert to temp path
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    lambdaProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    lambdaProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    lambdaProcess.on('close', async (code) => {
      processingTracks.delete(track.id);

      if (code === 0) {
        console.log(`✅ Successfully processed track: ${track.title}`);
        if (stdout) console.log('Output:', stdout.trim());
      } else {
        const fallbackError = logProcessFailure({
          label: `track: ${track.title}`,
          code,
          stdout,
          stderr,
        });

        // Lambda usually already wrote processing_error; don't clobber it with a generic message.
        try {
          await pool.query(
            `UPDATE tracks
             SET processing_status = 'failed',
                 processing_error = COALESCE(NULLIF(processing_error, ''), $1)
             WHERE id = $2
               AND processing_status != 'completed'`,
            [fallbackError, track.id]
          );
        } catch (updateError) {
          console.error('Failed to update track status:', updateError.message);
        }
      }

      console.log('');
      resolve();
    });

    lambdaProcess.on('error', (error) => {
      console.error(`❌ Process error for track ${track.id}:`, error.message);
      processingTracks.delete(track.id);
      reject(error);
    });
  });
}

async function processProjectAsset(asset) {
  return new Promise((resolve, reject) => {
    console.log(`🎚️ Processing project asset: ${asset.id} (project ${asset.project_id})`);

    const lambdaFile = useBuilt ? 'dist/index.mjs' : 'index.js';
    const lambdaCwd = __dirname;

    const lambdaProcess = spawn('node', [lambdaFile], {
      cwd: lambdaCwd,
      env: {
        ...process.env,
        ASSET_ID: String(asset.id),
        S3_KEY: asset.storage_key || '',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    lambdaProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    lambdaProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    lambdaProcess.on('close', async (code) => {
      processingAssets.delete(asset.id);

      if (code === 0) {
        console.log(`✅ Successfully processed project asset: ${asset.id}`);
        if (stdout) console.log('Output:', stdout.trim());
      } else {
        const fallbackError = logProcessFailure({
          label: `project asset: ${asset.id}`,
          code,
          stdout,
          stderr,
        });

        try {
          await pool.query(
            `UPDATE project_assets
             SET processing_status = 'failed',
                 processing_error = COALESCE(NULLIF(processing_error, ''), $1)
             WHERE id = $2
               AND processing_status IN ('pending', 'processing')
               AND storage_key LIKE 'temp/%'`,
            [fallbackError, asset.id]
          );
        } catch (updateError) {
          console.error('Failed to update project asset status:', updateError.message);
        }
      }

      console.log('');
      resolve();
    });

    lambdaProcess.on('error', (error) => {
      console.error(`❌ Process error for project asset ${asset.id}:`, error.message);
      processingAssets.delete(asset.id);
      reject(error);
    });
  });
}

async function runMonitorCycle() {
  if (monitorCycleInProgress) {
    return;
  }

  monitorCycleInProgress = true;
  try {
    await checkForTracksToProcess();
    await checkForProjectAssetsToProcess();
  } finally {
    monitorCycleInProgress = false;
  }
}

// Start monitoring
console.log('🔄 Starting database monitoring...');
runMonitorCycle();

const monitorInterval = setInterval(runMonitorCycle, 15000);

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down audio processing dev server...');
  clearInterval(monitorInterval);
  await pool.end();
  console.log('✅ Database connection closed');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down audio processing dev server...');
  clearInterval(monitorInterval);
  await pool.end();
  console.log('✅ Database connection closed');
  process.exit(0);
});
