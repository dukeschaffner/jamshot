import { spawn } from 'child_process';
import { createLambdaPool } from '@sterio/db-config';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

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
console.log('Monitoring database for tracks needing processing...\n');

// Track processing status to avoid duplicate processing
const processingTracks = new Set();

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

        // Mark as being processed
        processingTracks.add(track.id);

        // Trigger audio processing
        await processTrack(track);
      }
      console.log('');
    }
  } catch (error) {
    console.error('❌ Error checking for tracks to process:', error.message);
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
        console.error(`❌ Failed to process track: ${track.title}`);
        console.error('Exit code:', code);
        if (stderr) console.error('Error:', stderr.trim());

        // Update track status to failed
        try {
          await pool.query(
            'UPDATE tracks SET processing_status = $1, processing_error = $2 WHERE id = $3',
            ['failed', stderr || 'Processing failed', track.id]
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

// Start monitoring
console.log('🔄 Starting database monitoring...');
checkForTracksToProcess();

// Check for new tracks every 5 seconds
const monitorInterval = setInterval(checkForTracksToProcess, 15000);

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
