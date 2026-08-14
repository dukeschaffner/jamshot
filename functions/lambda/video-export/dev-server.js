import '@sterio/dev-env/config';
import { spawn } from 'child_process';
import { createLambdaPool } from '@sterio/db-config';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database connection
const pool = createLambdaPool();

console.log('🎬 Jamshot Video Export Dev Server');
console.log('==================================');
console.log('Monitoring database for video exports needing processing...\n');

// Track processing status to avoid duplicate processing
const processingExports = new Set();

async function checkForExportsToProcess() {
  try {
    const result = await pool.query(
      `SELECT ve.id, ve.track_id, ve.start_time, ve.duration, ve.status,
              t.guid as track_guid, t.title
       FROM video_exports ve
       JOIN tracks t ON ve.track_id = t.id
       WHERE ve.status IN ('pending', 'processing')
       AND ve.id != ALL($1)
       ORDER BY ve.created_at DESC
       LIMIT 5`,
      [Array.from(processingExports)]
    );

    if (result.rows.length > 0) {
      console.log(`🔍 Found ${result.rows.length} video export(s) to process:`);

      for (const exportJob of result.rows) {
        console.log(`  🎥 ${exportJob.title} (Export ID: ${exportJob.id}, Track ID: ${exportJob.track_id})`);

        // Mark as being processed
        processingExports.add(exportJob.id);

        // If status is 'pending', update to 'processing'
        if (exportJob.status === 'pending') {
          try {
            await pool.query(
              'UPDATE video_exports SET status = $1 WHERE id = $2',
              ['processing', exportJob.id]
            );
            exportJob.status = 'processing';
          } catch (updateError) {
            console.error(`Failed to update export ${exportJob.id} status:`, updateError.message);
          }
        }

        // Trigger video export processing
        await processExport(exportJob);
      }
      console.log('');
    }
  } catch (error) {
    console.error('❌ Error checking for exports to process:', error.message);
  }
}

async function processExport(exportJob) {
  return new Promise((resolve, reject) => {
    console.log(`🎬 Processing video export: ${exportJob.title} (Export ID: ${exportJob.id})`);

    // Spawn the video export lambda handler
    const lambdaProcess = spawn('python3', [
      'handler.py'
    ], {
      cwd: __dirname,
      env: {
        ...process.env,
        // Pass export data as environment variables (simulating Lambda event)
        EXPORT_ID: exportJob.id.toString(),
        TRACK_ID: exportJob.track_id.toString(),
        TRACK_GUID: exportJob.track_guid,
        START_TIME: exportJob.start_time?.toString() || '0',
        DURATION: exportJob.duration?.toString() || '',
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
      processingExports.delete(exportJob.id);

      if (code === 0) {
        console.log(`✅ Successfully processed video export: ${exportJob.title}`);
        if (stdout) console.log('Output:', stdout.trim());
      } else {
        console.error(`❌ Failed to process video export: ${exportJob.title}`);
        console.error('Exit code:', code);
        if (stderr) console.error('Error:', stderr.trim());

        // Update export status to failed
        try {
          await pool.query(
            'UPDATE video_exports SET status = $1, error_message = $2 WHERE id = $3',
            ['failed', stderr || 'Video export processing failed', exportJob.id]
          );
        } catch (updateError) {
          console.error('Failed to update export status:', updateError.message);
        }
      }

      console.log('');
      resolve();
    });

    lambdaProcess.on('error', (error) => {
      console.error(`❌ Process error for export ${exportJob.id}:`, error.message);
      processingExports.delete(exportJob.id);
      reject(error);
    });
  });
}

// Start monitoring
console.log('🔄 Starting database monitoring...');
checkForExportsToProcess();

// Check for new exports every 15 seconds
const monitorInterval = setInterval(checkForExportsToProcess, 15000);

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down video export dev server...');
  clearInterval(monitorInterval);
  await pool.end();
  console.log('✅ Database connection closed');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down video export dev server...');
  clearInterval(monitorInterval);
  await pool.end();
  console.log('✅ Database connection closed');
  process.exit(0);
});

