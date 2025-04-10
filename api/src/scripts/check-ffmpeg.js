/**
 * FFMPEG Configuration Check Script
 * 
 * This script runs before the application starts to:
 * 1. Verify FFMPEG is installed and configured correctly
 * 2. Set proper permissions for the local FFMPEG binary on Linux
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const ffmpeg = require('fluent-ffmpeg');

console.log('Running FFMPEG configuration check...');
console.log(`Current platform: ${process.platform}`);

// Path to the local FFMPEG binary
const localFfmpegPath = path.join(__dirname, '../../bin/ffmpeg');

try {
  if (process.platform === 'linux') {
    console.log(`Checking Linux FFMPEG binary at: ${localFfmpegPath}`);
    
    // Check if the file exists
    if (fs.existsSync(localFfmpegPath)) {
      console.log('Local FFMPEG binary found.');
      
      // Set executable permissions
      try {
        fs.chmodSync(localFfmpegPath, '755');
        console.log('Set executable permissions (755) for FFMPEG binary.');
      } catch (err) {
        console.error('Failed to set executable permissions:', err.message);
      }
      
      // Configure fluent-ffmpeg to use the local binary
      ffmpeg.setFfmpegPath(localFfmpegPath);
      console.log('Configured fluent-ffmpeg to use local binary.');
      
      // Try to execute the binary to ensure it works
      try {
        const output = execSync(`${localFfmpegPath} -version`).toString();
        console.log('FFMPEG version check successful:');
        console.log(output.split('\n')[0]); // Just log the first line of version info
      } catch (err) {
        console.error('Failed to execute FFMPEG binary:', err.message);
      }
    } else {
      console.error('Local FFMPEG binary not found! Audio processing will fail.');
      console.error('Please ensure the FFMPEG binary is placed at:', localFfmpegPath);
    }
  } else {
    console.log('Using system-installed FFMPEG on non-Linux platform.');
    
    // Check if FFMPEG is available on the system
    try {
      const output = execSync('ffmpeg -version').toString();
      console.log('System FFMPEG version check successful:');
      console.log(output.split('\n')[0]); // Just log the first line of version info
    } catch (err) {
      console.error('System FFMPEG check failed:', err.message);
      console.error('Please install FFMPEG on your system.');
    }
  }
  
  console.log('FFMPEG configuration check completed.');
} catch (err) {
  console.error('Unexpected error during FFMPEG check:', err);
} 