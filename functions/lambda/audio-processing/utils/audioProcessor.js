import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import ffmpeg from 'fluent-ffmpeg';
import mm from 'music-metadata';
import { createLambdaPool } from '@sterio/db-config';
import crypto from 'crypto';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure FFMPEG path based on platform
if (process.platform === 'linux') {
  // Use the FFMPEG binary in the lambda directory on Linux (Azure)
  // In bundled dist, ffmpeg is in the root of dist folder (same as index.mjs)
  // In development, it's one level up from utils/
  let ffmpegPath = path.join(__dirname, '../ffmpeg');  // Try development path first
  if (!fs.existsSync(ffmpegPath)) {
    ffmpegPath = path.join(__dirname, './ffmpeg');  // Try bundled path
  }
  if (fs.existsSync(ffmpegPath)) {
    ffmpeg.setFfmpegPath(ffmpegPath);
  } else {
  }
}

// Cloudflare R2 setup
const s3Client = new S3Client({
  region: 'auto', // R2 uses 'auto' region
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  endpoint: process.env.R2_ENDPOINT,
});

// Database connection - Lambda optimized (lazy so tests can use combineAudioFiles without DB)
let _pool = null;
function getPool() {
  if (!_pool) _pool = createLambdaPool();
  return _pool;
}

// When true, use two-pass loudnorm (measure then encode); when false, use single-pass with fallback values.
const USE_MEASUREMENT_PASS = process.env.USE_MEASUREMENT_PASS === 'true';

class AudioProcessor {
  constructor() {
    if (process.env.NODE_ENV === 'development') {
      this.tempDir = path.join(__dirname, '../temp');
    } else {
      this.tempDir = '/tmp'; // Lambda's temporary directory
    }
  }

  // Extract filename base from temp S3 key (format: temp/tracks/{userId}/{base}-temp.{ext})
  extractFilenameBaseFromTempKey(tempKey) {
    const tempFilename = tempKey.split('/').pop(); // e.g., "1234567890-abcdef-temp.mp3"
    return tempFilename.replace('-temp.', '.').split('.')[0]; // Extract base before "-temp"
  }

  // Generate standard track filename (same as trackUtils.js)
  generateStandardTrackFilename(type = 'raw', base = null) {
    const filenameBase = base || this.generateTrackFilenameBase();
    return `${filenameBase}-${type}.mp3`;
  }

  // Generate track filename base (timestamp-guid format)
  generateTrackFilenameBase() {
    const timestamp = Date.now();
    const guid = crypto.randomBytes(8).toString('hex');
    return `${timestamp}-${guid}`;
  }

  async processAudio(trackId) {

    // Declare variables at function scope for cleanup in catch block
    let localFilePath = null;
    let tempFilesToCleanup = [];
    let s3Key = null;

    try {
      // Get track information from database
      const trackResult = await getPool().query(
        'SELECT * FROM tracks WHERE id = $1',
        [trackId]
      );

      if (trackResult.rows.length === 0) {
        throw new Error(`Track ${trackId} not found`);
      }

      const track = trackResult.rows[0];
      s3Key = track.audio_url;
      const trackGuid = track.guid;

      // Extract filename base from the temp S3 key stored in audio_url
      const filenameBase = this.extractFilenameBaseFromTempKey(track.audio_url);

      // Derive final URLs using the extracted base
      const finalAudioUrl = `tracks/${this.generateStandardTrackFilename('raw', filenameBase)}`;
      const finalCombinedAudioUrl = `tracks/${this.generateStandardTrackFilename('processed', filenameBase)}`;


      // Update processing status to 'processing'
      await getPool().query(
        'UPDATE tracks SET processing_status = $1 WHERE id = $2',
        ['processing', trackId]
      );

      // Download the raw audio file
      // Preserve original file extension from S3 key to avoid format detection issues
      const originalExtension = path.extname(s3Key) || '.mp3'; // fallback to .mp3 if no extension
      localFilePath = path.join(this.tempDir, `track-${trackId}-raw-${Date.now()}${originalExtension}`);

      if (s3Key) {
        // Download from provided S3 key
        await this.downloadS3File(s3Key, localFilePath);
      } else {
        throw new Error(`Could not locate audio file for track ${trackId}`);
      }


      // Determine if this is a collaboration or regular upload and get duration
      let duration = 0;
      let stemAudioPath = null;
      let combinedAudioPath = null;
      
      try {
        if (track.parent_track_id) {
          const result = await this.processCollaboration(track, localFilePath, finalAudioUrl, finalCombinedAudioUrl);
          duration = result.duration;
          stemAudioPath = result.stemAudioPath;
          combinedAudioPath = result.combinedAudioPath;
          tempFilesToCleanup = result.tempFiles || [];
        } else {
          const result = await this.processRegularUpload(track, localFilePath, finalAudioUrl, finalCombinedAudioUrl);
          duration = result.duration;
          stemAudioPath = result.stemAudioPath;
          combinedAudioPath = result.combinedAudioPath;
          tempFilesToCleanup = result.tempFiles || [];
        }
      } catch (processingError) {
        // Clean up any temp files that were created before the error
        await Promise.all(
          tempFilesToCleanup.map(f => fsPromises.unlink(f).catch(() => {}))
        );
        // Also clean up the local file if it exists
        await fsPromises.unlink(localFilePath).catch(() => {});
        throw processingError;
      }

      // Generate and save waveform peaks
      let waveformUrl = null;
      let combinedWaveformUrl = null;
      
      try {
        
        // Generate peaks for stem audio
        if (stemAudioPath && fs.existsSync(stemAudioPath)) {
          const stemPeaks = await this.generateWaveformPeaks(stemAudioPath, 256);
          const stemWaveformKey = `waveforms/tracks/${trackGuid}/stem.json`;
          await this.saveWaveformPeaks(stemPeaks, stemWaveformKey, 256);
          waveformUrl = stemWaveformKey;
        }
        
        // Generate peaks for combined audio
        if (combinedAudioPath && fs.existsSync(combinedAudioPath)) {
          const combinedPeaks = await this.generateWaveformPeaks(combinedAudioPath, 256);
          const combinedWaveformKey = `waveforms/tracks/${trackGuid}/combined.json`;
          await this.saveWaveformPeaks(combinedPeaks, combinedWaveformKey, 256);
          combinedWaveformUrl = combinedWaveformKey;
        }
      } catch (waveformError) {
        logger.error({ message: 'Failed to generate waveform peaks', error: waveformError?.message, stack: waveformError?.stack });
        // Don't fail the entire processing if waveform generation fails
      }

      // Clean up temp files after waveform generation
      await Promise.all(
        tempFilesToCleanup.map(f => fsPromises.unlink(f).catch(() => {}))
      );

      // Determine final processing status based on moderation settings
      let finalStatus = 'completed';

      // Check if moderation is enabled and this is a loop track
      if (track.is_loop) {
        try {
          const moderationEnabled = await getPool().query(
            "SELECT flag_value FROM feature_flags WHERE flag_key = 'moderation'"
          );
          if (moderationEnabled.rows.length > 0 && moderationEnabled.rows[0].flag_value) {
            finalStatus = 'waiting_for_approval';
          }
        } catch (moderationError) {
          logger.error({ message: 'Error checking moderation feature flag', error: moderationError?.message });
          // Default to completed if moderation check fails
        }
      }

      // Update processing status to final status and set final URLs and duration
      await getPool().query(
        'UPDATE tracks SET processing_status = $1, audio_url = $2, combined_audio_url = $3, duration = $4, waveform_url = $5, combined_waveform_url = $6 WHERE id = $7',
        [finalStatus, finalAudioUrl, finalCombinedAudioUrl, duration, waveformUrl, combinedWaveformUrl, trackId]
      );

      // Clean up original temp file (other temp files cleaned up after waveform generation)
      await fsPromises.unlink(localFilePath).catch(err => logger.error({ message: 'Cleanup error', error: err?.message }));


      return {
        status: 'success',
        track_id: trackId,
        message: 'Audio processing completed successfully'
      };

    } catch (error) {

      // Clean up local temporary files
      const cleanupPromises = [];
      
      // Clean up the downloaded local file if it exists
      if (localFilePath) {
        cleanupPromises.push(
          fsPromises.unlink(localFilePath).catch(err => 
            logger.error({ message: 'Failed to cleanup local file', localFilePath, error: err?.message })
          )
        );
      }

      // Clean up any temp files that might have been created
      if (tempFilesToCleanup && tempFilesToCleanup.length > 0) {
        cleanupPromises.push(
          ...tempFilesToCleanup.map(f => 
            fsPromises.unlink(f).catch(err => 
              logger.error({ message: 'Failed to cleanup temp file', file: f, error: err?.message })
            )
          )
        );
      }

      // Wait for cleanup to complete (don't block on errors)
      await Promise.all(cleanupPromises).catch(() => {});

      // Delete temporary S3 file if it exists (from temp/tracks/)
      if (s3Key && s3Key.startsWith('temp/tracks/')) {
        try {
          await s3Client.send(new DeleteObjectCommand({
            Bucket: process.env.R2_BUCKET,
            Key: s3Key
          }));
          logger.info({ message: 'Deleted temporary S3 file', s3Key });
        } catch (s3Error) {
          logger.error({ message: 'Failed to delete temporary S3 file', s3Key, error: s3Error?.message });
          // Don't throw - cleanup failures shouldn't block error reporting
        }
      }

      // Update processing status to 'failed'
      await getPool().query(
        'UPDATE tracks SET processing_status = $1, processing_error = $2 WHERE id = $3',
        ['failed', error.message, trackId]
      ).catch(dbError => {
        logger.error({ message: 'Failed to update track status to failed', error: dbError?.message });
        // Don't throw - we've already logged the original error
      });

      throw error;
    }
  }

  buildProjectAssetFinalKey(projectId, assetId) {
    return `projects/${projectId}/${assetId}/audio.wav`;
  }

  buildProjectAssetWaveformKey(projectId, assetId) {
    return `waveforms/projects/${projectId}/${assetId}.json`;
  }

  async processProjectAsset(assetId, s3KeyOverride = null) {
    let localFilePath = null;
    let tempS3Key = null;

    try {
      const assetResult = await getPool().query(
        `SELECT id, project_id, storage_key, name, mime_type
         FROM project_assets
         WHERE id = $1`,
        [assetId]
      );

      if (assetResult.rows.length === 0) {
        throw new Error(`Project asset ${assetId} not found`);
      }

      const asset = assetResult.rows[0];
      const projectId = asset.project_id;
      tempS3Key = s3KeyOverride || asset.storage_key;
      const finalStorageKey = this.buildProjectAssetFinalKey(projectId, assetId);

      if (!tempS3Key) {
        throw new Error(`Could not locate source audio for project asset ${assetId}`);
      }

      await getPool().query(
        'UPDATE project_assets SET processing_status = $1 WHERE id = $2',
        ['processing', assetId]
      );

      const originalExtension = path.extname(tempS3Key) || '.wav';
      localFilePath = path.join(
        this.tempDir,
        `project-asset-${assetId}-raw-${Date.now()}${originalExtension}`
      );

      await this.downloadS3File(tempS3Key, localFilePath);

      const wavPath = path.join(this.tempDir, `project-asset-${assetId}-${Date.now()}.wav`);
      await this.convertToProjectWav(localFilePath, wavPath);

      const duration = await this.getAudioDuration(wavPath);
      const fileStats = await fsPromises.stat(wavPath);

      await this.uploadToS3(wavPath, finalStorageKey, 'audio/wav');

      let waveformUrl = null;
      try {
        const peaks = await this.generateWaveformPeaks(wavPath, 256);
        const waveformKey = this.buildProjectAssetWaveformKey(projectId, assetId);
        await this.saveWaveformPeaks(peaks, waveformKey, 256);
        waveformUrl = waveformKey;
      } catch (waveformError) {
        logger.error({
          message: 'Failed to generate project asset waveform peaks',
          assetId,
          error: waveformError?.message,
          stack: waveformError?.stack,
        });
      }

      await getPool().query(
        `UPDATE project_assets
         SET processing_status = $1,
             storage_key = $2,
             audio_url = $2,
             duration_seconds = $3,
             file_size_bytes = $4,
             mime_type = $5,
             waveform_url = $6,
             processing_error = NULL
         WHERE id = $7`,
        ['completed', finalStorageKey, duration, fileStats.size, 'audio/wav', waveformUrl, assetId]
      );

      if (tempS3Key.startsWith('temp/projects/')) {
        try {
          await s3Client.send(
            new DeleteObjectCommand({
              Bucket: process.env.R2_BUCKET,
              Key: tempS3Key,
            })
          );
        } catch (deleteError) {
          logger.error({
            message: 'Failed to delete temporary project asset S3 file',
            s3Key: tempS3Key,
            error: deleteError?.message,
          });
        }
      }

      await fsPromises.unlink(localFilePath).catch(() => {});
      await fsPromises.unlink(wavPath).catch(() => {});

      return {
        status: 'success',
        asset_id: assetId,
        message: 'Project asset processing completed successfully',
      };
    } catch (error) {
      if (localFilePath) {
        await fsPromises.unlink(localFilePath).catch(() => {});
      }

      if (tempS3Key && tempS3Key.startsWith('temp/projects/')) {
        try {
          await s3Client.send(
            new DeleteObjectCommand({
              Bucket: process.env.R2_BUCKET,
              Key: tempS3Key,
            })
          );
        } catch (deleteError) {
          logger.error({
            message: 'Failed to delete temporary project asset S3 file after error',
            s3Key: tempS3Key,
            error: deleteError?.message,
          });
        }
      }

      await getPool()
        .query(
          'UPDATE project_assets SET processing_status = $1, processing_error = $2 WHERE id = $3',
          ['failed', error.message, assetId]
        )
        .catch((dbError) => {
          logger.error({
            message: 'Failed to update project asset status to failed',
            error: dbError?.message,
          });
        });

      throw error;
    }
  }

  async convertToProjectWav(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioCodec('pcm_s16le')
        .audioFrequency(44100)
        .audioChannels(1)
        .on('end', () => {
          logger.info({ message: 'Project WAV conversion completed', outputPath });
          resolve();
        })
        .on('error', (err) => {
          logger.error({
            message: 'Project WAV conversion failed',
            error: err?.message,
            stack: err?.stack,
          });
          reject(err);
        })
        .save(outputPath);
    });
  }

  async processCollaboration(track, localFilePath, finalAudioUrl, finalCombinedAudioUrl) {

    // Get stem chain
    const stemChain = await this.getStemChain(track.id);

    // Download and render all stems
    const localFiles = [];
    const gainValues = [];
    const renderedFiles = []; // Track rendered files for cleanup
    const downloadedStemFiles = []; // Track original downloaded stem files for cleanup

    for (const stem of stemChain) {
      if (stem.track_id === 'recording' || stem.track_id === track.id) {
        continue; // Skip the recording placeholder or the current track
      }

      if (!stem.audio_url) {
        logger.warn({ message: 'Stem has no audio_url, skipping', stem_track_id: stem.track_id });
        continue;
      }

      // Preserve original file extension from S3 key to avoid format detection issues
      const stemExtension = path.extname(stem.audio_url) || '.mp3'; // fallback to .mp3 if no extension
      const stemLocalPath = path.join(this.tempDir, `stem-${stem.track_id}-${Date.now()}${stemExtension}`);

      try {
        await this.downloadS3File(stem.audio_url, stemLocalPath);
        downloadedStemFiles.push(stemLocalPath); // Track for cleanup
        
        // Render the stem with regions if present
        let renderedPath = stemLocalPath;
        if (stem.regions && stem.regions.length > 0) {
          logger.info({ message: 'Rendering stem', stem_track_id: stem.track_id, regionCount: stem.regions.length });
          renderedPath = path.join(this.tempDir, `rendered-stem-${stem.track_id}-${Date.now()}.wav`);
          await this.renderStemWithRegions(stemLocalPath, renderedPath, stem.regions);
          renderedFiles.push(renderedPath); // Track for cleanup
        }
        
        localFiles.push(renderedPath);
        gainValues.push(stem.gain);
      } catch (downloadError) {
        // Clean up already downloaded files
        await Promise.all(localFiles.map(f => fsPromises.unlink(f).catch(() => {})));
        await Promise.all(renderedFiles.map(f => fsPromises.unlink(f).catch(() => {})));
        await Promise.all(downloadedStemFiles.map(f => fsPromises.unlink(f).catch(() => {})));
        throw downloadError;
      }
    }

    if (localFiles.length === 0) {
      throw new Error('No valid stem files found for mixing');
    }

    // Add the new recording
    localFiles.push(localFilePath);

    // Get recording gain from mix_gains (track_id may be number or string from JSON)
    const mixGains = track.mix_gains?.stems || [];
    const recordingStem = mixGains.find(s => String(s.track_id) === String(track.id));
    const recordingGain = recordingStem?.gain ?? 1.0;
    gainValues.push(recordingGain);


    // Mix the audio files (normalize to same loudness as regular upload: -16 LUFS, -1 dBTP)
    const combinedPath = path.join(this.tempDir, `combined-${track.id}-${Date.now()}.mp3`);
    await this.combineAudioFiles(localFiles, combinedPath, gainValues, -16, -1);

    // Extract duration from the combined audio file
    const duration = await this.getAudioDuration(combinedPath);

    // Upload the combined file to final location
    await this.uploadToS3(combinedPath, finalCombinedAudioUrl);

    // Convert and upload raw file to final location
    const rawPath = path.join(this.tempDir, `raw-${track.id}-${Date.now()}.mp3`);
    await this.convertToMp3(localFilePath, rawPath);

    await this.uploadToS3(rawPath, finalAudioUrl);

    // Return paths before cleanup so waveform peaks can be generated
    // Note: Caller is responsible for cleanup after waveform generation
    return { 
      duration,
      stemAudioPath: rawPath,
      combinedAudioPath: combinedPath,
      tempFiles: [
        ...localFiles,
        ...renderedFiles,
        ...downloadedStemFiles,
        combinedPath,
        rawPath
      ]
    };
  }

  /**
   * Render a stem audio file with regions
   * Creates a new audio file by extracting segments from the source file
   * and placing them at their specified startTime positions
   * 
   * @param {string} inputPath - Path to the source audio file
   * @param {string} outputPath - Path where the rendered file will be saved
   * @param {Array} regions - Array of region objects with {startTime, endTime, offset}
   * @returns {Promise<void>}
   */
  async renderStemWithRegions(inputPath, outputPath, regions) {
    return new Promise((resolve, reject) => {
      // Sort regions by startTime
      const sortedRegions = [...regions].sort((a, b) => a.startTime - b.startTime);
      
      // Find the maximum endTime to determine output duration
      const maxEndTime = Math.max(...sortedRegions.map(r => r.endTime));
      
      // Build FFmpeg command
      const ffmpegCommand = ffmpeg();
      
      // Create filter complex to extract and place each region
      const filterParts = [];
      const inputLabels = [];
      
      // For each region, extract the segment and delay it to the correct position
      sortedRegions.forEach((region, index) => {
        // Extract segment: start at offset, duration is (endTime - startTime)
        const segmentDuration = region.endTime - region.startTime;
        const delayMs = Math.round(region.startTime * 1000); // Convert to milliseconds for adelay
        
        // Input the file with specific start time and duration
        // Use inputOptions to seek and limit duration for this specific input
        const input = ffmpegCommand.input(inputPath);
        input.inputOptions([
          `-ss`, region.offset.toString(),
          `-t`, segmentDuration.toString()
        ]);
        
        // Apply delay to place segment at correct position
        // adelay expects delay in milliseconds, format: adelay=delay1|delay2 (for stereo)
        const inputLabel = `[${index}:a]`;
        const delayedLabel = `[delayed${index}]`;
        filterParts.push(`${inputLabel}adelay=${delayMs}|${delayMs}${delayedLabel}`);
        inputLabels.push(delayedLabel);
      });
      
      // Mix all delayed segments together
      const mixInputs = inputLabels.join('');
      filterParts.push(`${mixInputs}amix=inputs=${inputLabels.length}:duration=longest:normalize=0[aout]`);
      
      // Trim to maxEndTime duration
      filterParts.push(`[aout]atrim=0:${maxEndTime}[trimmed]`);
      
      // Set up audio processing (WAV intermediate to avoid extra MP3 encode and generational loss)
      ffmpegCommand
        .audioCodec('pcm_s16le')
        .audioFrequency(44100)
        .audioChannels(2)
        .complexFilter(filterParts)
        .outputOptions(['-map', '[trimmed]'])
        .on('end', () => {
          logger.info({ message: 'Stem rendering completed', outputPath });
          resolve();
        })
        .on('error', (err) => {
          logger.error({ message: 'Stem rendering failed', error: err?.message, stack: err?.stack });
          reject(err);
        })
        .save(outputPath);
    });
  }

  async processRegularUpload(track, localFilePath, finalAudioUrl, finalCombinedAudioUrl) {

    // Normalize the audio
    const normalizedPath = path.join(this.tempDir, `normalized-${track.id}-${Date.now()}.mp3`);
    await this.combineAudioFiles([localFilePath], normalizedPath, [1.0], -16, -1); // LUFS -16, True Peak -1

    // Extract duration from the normalized audio file
    const duration = await this.getAudioDuration(normalizedPath);

    // Upload normalized file to final location
    await this.uploadToS3(normalizedPath, finalCombinedAudioUrl);

    // Convert and upload raw file to final location
    const rawPath = path.join(this.tempDir, `raw-${track.id}-${Date.now()}.mp3`);
    await this.convertToMp3(localFilePath, rawPath);

    await this.uploadToS3(rawPath, finalAudioUrl);

    // Return paths before cleanup so waveform peaks can be generated
    // Note: Caller is responsible for cleanup after waveform generation
    return { 
      duration,
      stemAudioPath: rawPath,
      combinedAudioPath: normalizedPath,
      tempFiles: [normalizedPath, rawPath]
    };
  }

  async downloadS3File(s3Key, localPath) {
    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: s3Key
    });

    const response = await s3Client.send(command);
    const byteArray = await response.Body.transformToByteArray();

    // Ensure the directory exists before writing the file
    const dirPath = path.dirname(localPath);
    await fsPromises.mkdir(dirPath, { recursive: true });

    await fsPromises.writeFile(localPath, byteArray);
  }

  async uploadToS3(localPath, s3Key, contentType = 'audio/mpeg') {
    const fileStream = fs.createReadStream(localPath);

    const uploadParams = {
      Bucket: process.env.R2_BUCKET,
      Key: s3Key,
      Body: fileStream,
      ContentType: contentType,
    };

    await s3Client.send(new PutObjectCommand(uploadParams));
  }

  /**
   * Parse loudnorm JSON from FFmpeg stderr (pass 1 with print_format=json).
   * Returns { measured_I, measured_LRA, measured_TP, measured_thresh, offset } or null if unparseable.
   */
  parseLoudnormStderr(stderrText) {
    if (!stderrText || typeof stderrText !== 'string') return null;
    // FFmpeg prints JSON to stderr, often multiline with prefix (e.g. [Parsed_loudnorm_3 @ 0x...])
    const idx = stderrText.indexOf('"input_i"');
    if (idx === -1) return null;
    const start = stderrText.lastIndexOf('{', idx);
    if (start === -1) return null;
    const end = stderrText.indexOf('}', idx);
    if (end === -1) return null;
    const jsonStr = stderrText.slice(start, end + 1);
    try {
      const obj = JSON.parse(jsonStr);
      const measured_I = obj.input_i != null ? String(obj.input_i) : null;
      const measured_LRA = obj.input_lra != null ? String(obj.input_lra) : null;
      const measured_TP = obj.input_tp != null ? String(obj.input_tp) : null;
      const measured_thresh = obj.input_thresh != null ? String(obj.input_thresh) : null;
      const offset = obj.target_offset != null ? String(obj.target_offset) : null;
      if (measured_I == null || offset == null) return null;
      return { measured_I, measured_LRA: measured_LRA ?? '11.0', measured_TP: measured_TP ?? '-1.0', measured_thresh: measured_thresh ?? '-30.0', offset };
    } catch {
      return null;
    }
  }

  async combineAudioFiles(inputFiles, outputPath, gainValues, targetLufs = null, truePeak = null) {
    const lra = 11;
    const tp = truePeak ?? -1;

    // Build base filter: per-input gain + amix (used for both passes when normalizing)
    const baseFilterParts = [];
    const inputs = [];
    inputFiles.forEach((file, index) => {
      inputs.push(`[${index}:a]`);
      if (gainValues && gainValues[index] !== undefined && gainValues[index] !== 1.0) {
        baseFilterParts.push(`${inputs[index]}volume=${gainValues[index]}[a${index}]`);
        inputs[index] = `[a${index}]`;
      }
    });
    const mixInputs = inputs.join('');
    baseFilterParts.push(`${mixInputs}amix=inputs=${inputFiles.length}:normalize=0[aout]`);

    // Two-pass loudness normalization when enabled; otherwise single-pass with fallback values
    if (targetLufs !== null) {
      let measured = null;
      if (USE_MEASUREMENT_PASS) {
        try {
          measured = await this.runLoudnormMeasurementPass(inputFiles, baseFilterParts, targetLufs, lra, tp);
        } catch (err) {
          logger.warn({ message: 'Loudnorm measurement pass failed, using fallback', error: err?.message });
        }
      }
      const useMeasured = measured?.measured_I != null && measured?.offset != null;
      if (useMeasured) {
        logger.info({
          message: 'Loudnorm two-pass: using measured values',
          measured_I: measured.measured_I,
          measured_LRA: measured.measured_LRA,
          measured_TP: measured.measured_TP,
          measured_thresh: measured.measured_thresh,
          offset: measured.offset
        });
      }
      // With real measured values: linear two-pass style. Without: dynamic single-pass (no fake measured_*).
      const loudnormParams = useMeasured
        ? `[aout]loudnorm=I=${targetLufs}:LRA=${lra}:TP=${tp}:measured_I=${measured.measured_I}:measured_LRA=${measured.measured_LRA}:measured_TP=${measured.measured_TP}:measured_thresh=${measured.measured_thresh}:offset=${measured.offset}:linear=true[out]`
        : `[aout]loudnorm=I=${targetLufs}:LRA=${lra}:TP=${tp}[out]`;

      await this.runFfmpegCombine(inputFiles, [...baseFilterParts, loudnormParams], outputPath, '[out]');
      return;
    }

    // No normalization: single pass, map mixed output
    await this.runFfmpegCombine(inputFiles, baseFilterParts, outputPath, '[aout]');
  }

  runLoudnormMeasurementPass(inputFiles, baseFilterParts, targetLufs, lra, tp) {
    return new Promise((resolve, reject) => {
      const filterParts = [...baseFilterParts, `[aout]loudnorm=I=${targetLufs}:LRA=${lra}:TP=${tp}:print_format=json[measured]`];
      const nullPath = path.join(this.tempDir, `loudnorm-measure-${Date.now()}`);
      const ffmpegCommand = ffmpeg();
      inputFiles.forEach(f => ffmpegCommand.input(f));
      let stderr = '';
      ffmpegCommand
        .complexFilter(filterParts)
        .outputOptions(['-map', '[measured]', '-f', 'null'])
        .on('stderr', (line) => { stderr += line + '\n'; })
        .on('end', () => {
          fsPromises.unlink(nullPath).catch(() => {});
          const parsed = this.parseLoudnormStderr(stderr);
          resolve(parsed && parsed.measured_I != null && parsed.offset != null ? parsed : {});
        })
        .on('error', (err) => {
          fsPromises.unlink(nullPath).catch(() => {});
          reject(err);
        })
        .save(nullPath);
    });
  }

  runFfmpegCombine(inputFiles, filterParts, outputPath, mapLabel) {
    return new Promise((resolve, reject) => {
      const ffmpegCommand = ffmpeg();
      inputFiles.forEach(f => ffmpegCommand.input(f));
      ffmpegCommand
        .audioCodec('libmp3lame')
        .audioBitrate('192k')
        .audioFrequency(44100)
        .audioChannels(2)
        .complexFilter(filterParts)
        .outputOptions(['-map', mapLabel])
        .on('start', commandLine => {
          console.log(commandLine);
        })
        .on('end', () => {
          logger.info({ message: 'Audio mixing completed', outputPath });
          resolve();
        })
        .on('error', (err) => {
          logger.error({ message: 'Audio mixing failed', error: err?.message, stack: err?.stack });
          reject(err);
        })
        .save(outputPath);
    });
  }

  async convertToMp3(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioCodec('libmp3lame')
        .audioBitrate('192k')
        .audioFrequency(44100)
        .audioChannels(2)
        .on('end', () => {
          logger.info({ message: 'MP3 conversion completed', outputPath });
          resolve();
        })
        .on('error', (err) => {
          logger.error({ message: 'MP3 conversion failed', error: err?.message, stack: err?.stack });
          reject(err);
        })
        .save(outputPath);
    });
  }

  // Extract duration from audio file using music-metadata
  async getAudioDuration(filePath) {
    try {
      const metadata = await mm.parseFile(filePath);
      return metadata.format.duration || 0;
    } catch (error) {
      logger.error({ message: 'Error extracting audio duration', error: error?.message });
      return 0;
    }
  }

  async getStemChain(trackId) {
    const stems = [];

    // Get the mix_gains from the current track
    const trackResult = await getPool().query(
      'SELECT mix_gains, audio_url FROM tracks WHERE id = $1',
      [trackId]
    );

    if (trackResult.rows.length === 0) {
      throw new Error(`Track ${trackId} not found`);
    }

    const mixGains = trackResult.rows[0].mix_gains?.stems || [];

    // For each track_id in mix_gains, get the audio_url
    for (const stem of mixGains) {
      let audioUrl = null;
      if (stem.track_id === trackId) {
        audioUrl = trackResult.rows[0].audio_url;
      }
      else {
        const stemTrackResult = await getPool().query(
          'SELECT audio_url FROM tracks WHERE id = $1',
          [stem.track_id]
        );
        if (stemTrackResult.rows.length === 0) {
          logger.warn({ message: 'Stem track not found, skipping', stem_track_id: stem.track_id });
          continue;
        }
        else {
          audioUrl = stemTrackResult.rows[0].audio_url;
        }
      }

      stems.push({
        track_id: stem.track_id,
        gain: stem.gain,
        audio_url: audioUrl,
        order: stem.order,
        // Include regions if present
        ...(stem.regions && { regions: stem.regions })
      });
    }

    return stems;
  }

  /**
   * Generate waveform peaks from an audio file
   * @param {string} audioFilePath - Path to the audio file
   * @param {number} resolution - Number of peaks to generate (default: 256)
   * @returns {Promise<Array>} Array of [min, max] peak pairs
   */
  async generateWaveformPeaks(audioFilePath, resolution = 256) {
    return new Promise((resolve, reject) => {
      const tempPcmPath = path.join(this.tempDir, `peaks-${Date.now()}-${Math.random().toString(36).substring(7)}.raw`);

      // Use ffmpeg to extract raw PCM data (16-bit signed integers, mono, 44.1kHz)
      ffmpeg(audioFilePath)
        .audioFrequency(44100)
        .audioChannels(1) // Convert to mono for peak calculation
        .format('s16le') // 16-bit signed little-endian PCM
        .on('error', (err) => {
          logger.error({ message: 'Failed to extract PCM data', error: err?.message });
          fsPromises.unlink(tempPcmPath).catch(() => {});
          reject(err);
        })
        .on('end', async () => {
          try {
            const pcmData = await fsPromises.readFile(tempPcmPath);
            const peaks = this.processPcmToPeaks(pcmData, resolution);
            await fsPromises.unlink(tempPcmPath).catch(() => {});
            resolve(peaks);
          } catch (error) {
            await fsPromises.unlink(tempPcmPath).catch(() => {});
            reject(error);
          }
        })
        .save(tempPcmPath);
    });
  }

  /**
   * Process raw PCM data into waveform peaks
   * @param {Buffer} pcmData - Raw PCM data (16-bit signed integers)
   * @param {number} resolution - Number of peaks to generate
   * @returns {Array} Array of [min, max] peak pairs normalized to [-1, 1]
   */
  processPcmToPeaks(pcmData, resolution) {
    const peaks = [];
    const sampleCount = pcmData.length / 2; // 16-bit = 2 bytes per sample
    const samplesPerPeak = Math.floor(sampleCount / resolution);

    for (let i = 0; i < resolution; i++) {
      const startIdx = i * samplesPerPeak * 2; // *2 because each sample is 2 bytes
      const endIdx = Math.min(startIdx + (samplesPerPeak * 2), pcmData.length);
      
      let min = 1;
      let max = -1;

      // Process samples in this segment
      for (let j = startIdx; j < endIdx; j += 2) {
        // Read 16-bit signed little-endian integer
        const sample = pcmData.readInt16LE(j);
        // Normalize to [-1, 1] range
        const normalized = sample / 32768;
        
        min = Math.min(min, normalized);
        max = Math.max(max, normalized);
      }

      // If no samples found, use zero
      if (min === 1 && max === -1) {
        min = 0;
        max = 0;
      }

      peaks.push([min, max]);
    }

    return peaks;
  }

  /**
   * Save waveform peaks as JSON to R2
   * @param {Array} peaks - Array of [min, max] peak pairs
   * @param {string} r2Key - R2 key where peaks will be stored
   * @param {number} resolution - Resolution of the peaks (e.g., 256, 512)
   * @returns {Promise<string>} R2 key where peaks were saved
   */
  async saveWaveformPeaks(peaks, r2Key, resolution = 256) {
    let peaksData = { peaks: {} };

    // Try to read existing peaks file if it exists
    try {
      const getCommand = new GetObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: r2Key
      });
      const response = await s3Client.send(getCommand);
      const existingData = await response.Body.transformToString();
      peaksData = JSON.parse(existingData);
      
      // Ensure peaks object exists
      if (!peaksData.peaks || typeof peaksData.peaks !== 'object') {
        peaksData.peaks = {};
      }
    } catch (error) {
      // File doesn't exist yet, start with empty structure
      if (error.name !== 'NoSuchKey' && error.name !== 'NotFound') {
        logger.warn({ message: 'Could not read existing peaks file', r2Key, error: error.message });
      }
    }

    // Add or update peaks for this resolution
    peaksData.peaks[resolution.toString()] = peaks;

    // Convert to JSON string
    const peaksJson = JSON.stringify(peaksData);
    const tempJsonPath = path.join(this.tempDir, `peaks-${Date.now()}.json`);

    try {
      // Write JSON to temp file
      await fsPromises.writeFile(tempJsonPath, peaksJson, 'utf8');

      // Upload to R2
      const fileStream = fs.createReadStream(tempJsonPath);
      const uploadParams = {
        Bucket: process.env.R2_BUCKET,
        Key: r2Key,
        Body: fileStream,
        ContentType: 'application/json'
      };

      await s3Client.send(new PutObjectCommand(uploadParams));

      // Clean up temp file
      await fsPromises.unlink(tempJsonPath).catch(() => {});

      return r2Key;
    } catch (error) {
      await fsPromises.unlink(tempJsonPath).catch(() => {});
      throw error;
    }
  }
}

export default AudioProcessor;
