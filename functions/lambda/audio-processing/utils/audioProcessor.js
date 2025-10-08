const { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const mm = require('music-metadata');
const { Pool } = require('pg');

// Configure FFMPEG path based on platform
if (process.platform === 'linux') {
  // Use the FFMPEG binary in the lambda directory on Linux (Azure)
  const ffmpegPath = path.join(__dirname, '../ffmpeg');
  ffmpeg.setFfmpegPath(ffmpegPath);
  console.log('Using local FFMPEG binary:', ffmpegPath);
} else {
  // On other platforms (macOS/Windows), rely on system installation
  console.log('Using system-installed FFMPEG');
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

// Database connection - Lambda optimized
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test' || process.env.DB_SSL === 'true' ? {
    rejectUnauthorized: false,
    sslmode: 'require'
  } : false,
  // Lambda-specific optimizations
  max: 1, // Limit connections for Lambda
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

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
    const guid = require('crypto').randomBytes(8).toString('hex');
    return `${timestamp}-${guid}`;
  }

  async processAudio(trackId) {
    console.log(`🎵 Starting audio processing for track ${trackId}`);

    try {
      // Get track information from database
      const trackResult = await pool.query(
        'SELECT * FROM tracks WHERE id = $1',
        [trackId]
      );

      if (trackResult.rows.length === 0) {
        throw new Error(`Track ${trackId} not found`);
      }

      const track = trackResult.rows[0];
      const s3Key = track.audio_url;

      // Extract filename base from the temp S3 key stored in audio_url
      const filenameBase = this.extractFilenameBaseFromTempKey(track.audio_url);

      // Derive final URLs using the extracted base
      const finalAudioUrl = `tracks/${this.generateStandardTrackFilename('raw', filenameBase)}`;
      const finalCombinedAudioUrl = `tracks/${this.generateStandardTrackFilename('processed', filenameBase)}`;

      console.log(`📝 Derived final URLs from base "${filenameBase}":`);
      console.log(`  Raw: ${finalAudioUrl}`);
      console.log(`  Processed: ${finalCombinedAudioUrl}`);

      // Update processing status to 'processing'
      await pool.query(
        'UPDATE tracks SET processing_status = $1 WHERE id = $2',
        ['processing', trackId]
      );

      // Download the raw audio file
      // Preserve original file extension from S3 key to avoid format detection issues
      const originalExtension = path.extname(s3Key) || '.mp3'; // fallback to .mp3 if no extension
      const localFilePath = path.join(this.tempDir, `track-${trackId}-raw-${Date.now()}${originalExtension}`);

      if (s3Key) {
        // Download from provided S3 key
        console.log(`📥 Downloading from S3 key: ${s3Key} to ${localFilePath}`);
        await this.downloadS3File(s3Key, localFilePath);
      } else {
        throw new Error(`Could not locate audio file for track ${trackId}`);
      }

      console.log(`📥 Downloaded raw audio file to ${localFilePath}`);

      // Determine if this is a collaboration or regular upload
      if (track.parent_track_id) {
        await this.processCollaboration(track, localFilePath, finalAudioUrl, finalCombinedAudioUrl);
      } else {
        await this.processRegularUpload(track, localFilePath, finalAudioUrl, finalCombinedAudioUrl);
      }

      // Update processing status to 'completed' and set final URLs
      await pool.query(
        'UPDATE tracks SET processing_status = $1, audio_url = $2, combined_audio_url = $3 WHERE id = $4',
        ['completed', finalAudioUrl, finalCombinedAudioUrl, trackId]
      );

      // Clean up temp file
      await fsPromises.unlink(localFilePath).catch(err => console.error('Cleanup error:', err));

      console.log(`✅ Audio processing completed for track ${trackId}`);

      return {
        status: 'success',
        track_id: trackId,
        message: 'Audio processing completed successfully'
      };

    } catch (error) {
      console.error(`❌ Audio processing failed for track ${trackId}:`, error);

      // Update processing status to 'failed'
      await pool.query(
        'UPDATE tracks SET processing_status = $1, processing_error = $2 WHERE id = $3',
        ['failed', error.message, trackId]
      );

      throw error;
    }
  }

  async processCollaboration(track, localFilePath, finalAudioUrl, finalCombinedAudioUrl) {
    console.log(`🎵 Processing collaboration for track ${track.id}`);

    // Get stem chain
    const stemChain = await this.getStemChain(track.id);

    // Download all stems
    const localFiles = [];
    const gainValues = [];

    for (const stem of stemChain) {
      if (stem.track_id === 'recording' || stem.track_id === track.id) {
        continue; // Skip the recording placeholder or the current track
      }

      if (!stem.audio_url) {
        console.warn(`Stem ${stem.track_id} has no audio_url, skipping`);
        continue;
      }

      // Preserve original file extension from S3 key to avoid format detection issues
      const stemExtension = path.extname(stem.audio_url) || '.mp3'; // fallback to .mp3 if no extension
      const stemLocalPath = path.join(this.tempDir, `stem-${stem.track_id}-${Date.now()}${stemExtension}`);

      try {
        await this.downloadS3File(stem.audio_url, stemLocalPath);
        localFiles.push(stemLocalPath);
        gainValues.push(stem.gain);
      } catch (downloadError) {
        console.error(`Failed to download stem ${stem.track_id}:`, downloadError);
        // Clean up already downloaded files
        await Promise.all(localFiles.map(f => fsPromises.unlink(f).catch(() => {})));
        throw new Error(`Failed to download stem audio file for track ${stem.track_id}`);
      }
    }

    if (localFiles.length === 0) {
      throw new Error('No valid stem files found for mixing');
    }

    // Add the new recording
    localFiles.push(localFilePath);

    // Get recording gain from mix_gains
    const mixGains = track.mix_gains?.stems || [];
    const recordingStem = mixGains.find(s => s.track_id === track.id.toString());
    const recordingGain = recordingStem?.gain || 1.0;
    gainValues.push(recordingGain);

    console.log('Local files before combining:', localFiles);
    console.log('Gain values for mixing:', gainValues);

    // Mix the audio files
    const combinedPath = path.join(this.tempDir, `combined-${track.id}-${Date.now()}.mp3`);
    await this.combineAudioFiles(localFiles, combinedPath, gainValues);

    // Upload the combined file to final location
    await this.uploadToS3(combinedPath, finalCombinedAudioUrl);

    // Convert and upload raw file to final location
    const rawPath = path.join(this.tempDir, `raw-${track.id}-${Date.now()}.mp3`);
    await this.convertToMp3(localFilePath, rawPath);

    await this.uploadToS3(rawPath, finalAudioUrl);

    // Clean up temp files
    await Promise.all([
      ...localFiles.map(f => fsPromises.unlink(f).catch(() => {})),
      fsPromises.unlink(combinedPath).catch(() => {}),
      fsPromises.unlink(rawPath).catch(() => {})
    ]);
  }

  async processRegularUpload(track, localFilePath, finalAudioUrl, finalCombinedAudioUrl) {
    console.log(`🎵 Processing regular upload for track ${track.id}`);

    // Normalize the audio
    const normalizedPath = path.join(this.tempDir, `normalized-${track.id}-${Date.now()}.mp3`);
    await this.combineAudioFiles([localFilePath], normalizedPath, [1.0], -16, -1); // LUFS -16, True Peak -1

    // Upload normalized file to final location
    await this.uploadToS3(normalizedPath, finalCombinedAudioUrl);

    // Convert and upload raw file to final location
    const rawPath = path.join(this.tempDir, `raw-${track.id}-${Date.now()}.mp3`);
    await this.convertToMp3(localFilePath, rawPath);

    await this.uploadToS3(rawPath, finalAudioUrl);

    // Clean up temp files
    await Promise.all([
      fsPromises.unlink(normalizedPath).catch(() => {}),
      fsPromises.unlink(rawPath).catch(() => {})
    ]);
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

  async uploadToS3(localPath, s3Key) {
    const fileStream = fs.createReadStream(localPath);

    const uploadParams = {
      Bucket: process.env.R2_BUCKET,
      Key: s3Key,
      Body: fileStream,
      ContentType: 'audio/mpeg'
    };

    await s3Client.send(new PutObjectCommand(uploadParams));
    console.log(`📤 Uploaded ${s3Key} to S3`);
  }

  async combineAudioFiles(inputFiles, outputPath, gainValues, targetLufs = null, truePeak = null) {
    return new Promise((resolve, reject) => {
      const ffmpegCommand = ffmpeg();

      // Add all input files
      inputFiles.forEach((file, index) => {
        ffmpegCommand.input(file);

        // Apply gain if specified
        if (gainValues && gainValues[index] !== undefined && gainValues[index] !== 1.0) {
          ffmpegCommand.inputOptions([`-filter:${index} volume=${gainValues[index]}`]);
        }
      });

      // Set up audio processing
      ffmpegCommand
        .audioCodec('libmp3lame')
        .audioBitrate('320k')
        .audioFrequency(44100)
        .audioChannels(2);

      // Apply loudness normalization if specified
      if (targetLufs !== null) {
        const lra = 11; // Loudness Range (11 LU is typical for modern music)
        ffmpegCommand.audioFilters([
          `loudnorm=I=${targetLufs}:LRA=${lra}:TP=${truePeak || -1}:measured_I=-23.0:measured_LRA=11.0:measured_TP=-1.0:measured_thresh=-30.0:offset=0.0:linear=true`
        ]);
      }

      ffmpegCommand
        .on('end', () => {
          console.log(`✅ Audio mixing completed: ${outputPath}`);
          resolve();
        })
        .on('error', (err) => {
          console.error('❌ Audio mixing failed:', err);
          reject(err);
        })
        .save(outputPath);
    });
  }

  async convertToMp3(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioCodec('libmp3lame')
        .audioBitrate('320k')
        .audioFrequency(44100)
        .audioChannels(2)
        .on('end', () => {
          console.log(`✅ MP3 conversion completed: ${outputPath}`);
          resolve();
        })
        .on('error', (err) => {
          console.error('❌ MP3 conversion failed:', err);
          reject(err);
        })
        .save(outputPath);
    });
  }

  async getStemChain(trackId) {
    const stems = [];

    // Get the mix_gains from the current track
    const trackResult = await pool.query(
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
        const stemTrackResult = await pool.query(
          'SELECT audio_url FROM tracks WHERE id = $1',
          [stem.track_id]
        );
        if (stemTrackResult.rows.length === 0) {
          console.warn(`Stem track ${stem.track_id} not found, skipping`);
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
        order: stem.order
      });
    }

    return stems;
  }
}

module.exports = AudioProcessor;
