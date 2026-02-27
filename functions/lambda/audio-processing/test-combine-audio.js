/**
 * Test script for combineAudioFiles.
 *
 * Copies files from test_tracks into a temp dir so originals are never modified or cleaned up.
 * Edit TRACKS below to specify which files to mix and the gain for each.
 * Inputs can be any format FFmpeg decodes (MP3, WAV, FLAC, M4A, etc.); output is always MP3.
 *
 * Run: node test-combine-audio.js
 * (from functions/lambda/audio-processing)
 */

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import AudioProcessor from './utils/audioProcessor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_TRACKS_DIR = path.join(__dirname, 'test_tracks');
const TEST_TEMP_DIR = path.join(__dirname, 'temp-combine-test');

/**
 * Tracks to combine. Each entry:
 *   - track: filename in test_tracks (e.g. 'drums.mp3' or 'loop.wav') or absolute path to a file
 *   - gain: gain multiplier (1.0 = unchanged, 0.5 = half, 2.0 = double)
 */
const TRACKS = [
  { track: 'b.wav', gain: 0.07 },
  { track: 'd.wav', gain: 0.07 },
  // Add more: { track: 'other.mp3', gain: 1.2 },
];

/** Target LUFS for output (-16 common for streaming). Set to null to skip loudness normalization. */
const TARGET_LUFS = -16;

/** True peak in dB. Used only when TARGET_LUFS is set. */
const TRUE_PEAK = -1;

async function ensureDir(dir) {
  await fsPromises.mkdir(dir, { recursive: true });
}

function resolveTrackPath(trackSpec) {
  const t = path.isAbsolute(trackSpec) ? trackSpec : path.join(TEST_TRACKS_DIR, trackSpec);
  return path.normalize(t);
}

async function main() {
  await ensureDir(TEST_TEMP_DIR);

  const processor = new AudioProcessor();
  processor.tempDir = TEST_TEMP_DIR;

  const gainValues = TRACKS.map((t) => t.gain);
  const sourcePaths = TRACKS.map((t) => resolveTrackPath(t.track));

  for (const p of sourcePaths) {
    if (!fs.existsSync(p)) {
      console.error(`Missing file: ${p}`);
      console.error('Add audio files to test_tracks/ or fix TRACKS in this script.');
      process.exit(1);
    }
  }

  const tempCopyPaths = [];
  for (let i = 0; i < sourcePaths.length; i++) {
    const base = path.basename(sourcePaths[i], path.extname(sourcePaths[i]));
    const ext = path.extname(sourcePaths[i]);
    const dest = path.join(TEST_TEMP_DIR, `copy-${i}-${base}${ext}`);
    await fsPromises.copyFile(sourcePaths[i], dest);
    tempCopyPaths.push(dest);
  }

  const outputPath = path.join(TEST_TEMP_DIR, `combined-${Date.now()}.mp3`);

  console.log('Input copies (in temp):', tempCopyPaths);
  console.log('Gains:', gainValues);
  console.log('Output:', outputPath);
  if (TARGET_LUFS != null) console.log('Target LUFS:', TARGET_LUFS);

  await processor.combineAudioFiles(
    tempCopyPaths,
    outputPath,
    gainValues,
    TARGET_LUFS,
    TRUE_PEAK
  );

  console.log('Done. Output written to:', outputPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
