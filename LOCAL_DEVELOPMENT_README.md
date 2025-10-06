# Jamshot Audio Processing Local Development

This guide explains how to run the audio processing lambda locally for testing the complete upload and processing pipeline.

## Architecture Overview

The audio processing setup runs one service:

1. **Audio Processing Monitor** - Local service that monitors the database for tracks needing processing and automatically triggers the audio processing lambda

## Prerequisites

1. **Database**: PostgreSQL running locally with Jamshot schema
2. **FFMPEG**: Included in audio-processing lambda directory
3. **Node.js**: Version 18+
4. **Environment Variables**: Create `.env` file in `api/` directory
5. **API & UI**: Already running (you handle these separately)

## Environment Setup

Create `api/.env` with database and R2 credentials (same as your API server):

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=jamshot_dev
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_SSL=false

# Cloudflare R2 Storage
R2_ACCESS_KEY_ID=your_r2_access_key
R2_SECRET_ACCESS_KEY=your_r2_secret_key
R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
R2_BUCKET=your-bucket-name
R2_PUBLIC_URL=https://your-public-url.com

# Other
AWS_REGION=us-east-1
```

## Running the Audio Processing Monitor

```bash
# Install dependencies
cd functions/lambda/audio-processing && npm install

# Start the audio processing monitor
node dev-start.js
# or
npm run dev
```

This starts the monitor that:
- Watches database for tracks with `processing_status = 'processing'`
- Automatically triggers audio processing for new uploads
- Updates track status when processing completes

## Available Scripts

From `functions/lambda/audio-processing/` directory:

- `npm run dev` - Start the database monitor (recommended for development)
- `npm run monitor` - Start just the database monitoring (same as dev)
- `npm run lambda` - Run the lambda function directly (requires TRACK_ID and S3_KEY env vars)
- `node index.js` - Run lambda directly

## Manual Audio Processing Control

### Test Audio Processing Separately

```bash
# Trigger processing for a specific track
cd functions/lambda/audio-processing
TRACK_ID=123 S3_KEY=temp/tracks/123/raw-filename.mp3 npm run lambda
# or directly:
TRACK_ID=123 S3_KEY=temp/tracks/123/raw-filename.mp3 node index.js
```

## Upload Testing Flow

1. **Upload Track**: Use your existing API/UI setup to upload a track
2. **Monitor Processing**: Start the audio processing monitor with `npm run dev`
3. **Watch Logs**: The monitor will automatically detect and process new tracks

The processing flow:
1. Your API creates track record with `processing_status = 'processing'`
2. Audio processing monitor detects new track every 5 seconds
3. Monitor spawns lambda process with track data as environment variables
4. Lambda processes audio (normalization, mixing) and updates track URLs
5. Track status changes to 'completed' or 'failed'

## Troubleshooting

### Common Issues

1. **FFMPEG not found**: Check that the `ffmpeg` binary exists in the lambda directory
2. **Database connection fails**: Check PostgreSQL is running and credentials
3. **S3 access fails**: Verify R2 credentials and permissions
4. **Processing fails**: Check temp directory permissions and ffmpeg binary permissions

### Logs

The audio processing monitor logs with `[Audio Processing]` prefix and shows:
- Track detection
- Processing start/completion
- Success/failure status
- Any processing errors

### Database Monitoring

Check processing status:
```sql
SELECT id, title, processing_status, processing_error, created_at
FROM tracks
WHERE processing_status IN ('processing', 'completed', 'failed')
ORDER BY created_at DESC LIMIT 5;
```

## Development Tips

- **Database Reset**: Drop and recreate database for clean state
- **Audio Files**: Test with small MP3/WAV files (< 10MB)
- **Processing Status**: Monitor track status in database or via API endpoints
- **Environment**: Use the same `.env` file as your API server

## Architecture Details

### Audio Processing

- **Local Mode**: Database polling triggers lambda execution
- **Production**: EventBridge events trigger AWS Lambda
- **Processing**: Normalization, loudness adjustment, collaboration mixing
- **Environment**: Uses same env vars as production lambda
