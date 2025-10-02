# Jamshot Audio Processing Lambda

This AWS Lambda function handles asynchronous audio processing for Jamshot tracks, including normalization, mixing for collaborations, and format conversion.

## Setup

1. **Create the Lambda function** in AWS Console:
   - Runtime: Node.js 18.x
   - Architecture: x86_64 (for FFMPEG compatibility)
   - Memory: 2048 MB (recommended for audio processing)
   - Timeout: 15 minutes

2. **Environment Variables**:
   ```
   DB_HOST=your-db-host
   DB_PORT=5432
   DB_NAME=your-db-name
   DB_USER=your-db-user
   DB_PASSWORD=your-db-password
   DB_SSL=true

   R2_ACCESS_KEY_ID=your-r2-access-key
   R2_SECRET_ACCESS_KEY=your-r2-secret-key
   R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
   R2_BUCKET=your-bucket-name
   R2_PUBLIC_URL=https://your-public-url.com
   ```

3. **Required Layers/Packages**:
   - FFMPEG binary (included in the lambda directory as `ffmpeg` for Linux deployments)
   - Node.js dependencies (installed via npm)
   - Note: On macOS/Windows development, system-installed FFMPEG is used

4. **S3 Lifecycle Configuration**:
   Apply the lifecycle rules in `s3-lifecycle-config.json` to your R2 bucket:

   ```bash
   # Using AWS CLI
   aws s3api put-bucket-lifecycle-configuration \
     --bucket your-bucket-name \
     --lifecycle-configuration file://s3-lifecycle-config.json
   ```

   **Lifecycle Rules Explained**:
   - `uploads/temp/`: Files from failed or abandoned uploads (delete after 1 hour)
   - `temp/tracks/`: Temporary files for processing (delete after 7 days)
   - `temp/failed/`: Files from failed processing (keep for 30 days for debugging)

## Event Triggers

### Track Creation Event
```json
{
  "detail": {
    "track_id": "123",
    "s3_key": "temp/tracks/123/raw-filename.mp3"
  }
}
```

### Manual Processing
```json
{
  "track_id": "123",
  "s3_key": "temp/tracks/123/raw-filename.mp3"
}
```

## Processing Flow

1. **Download**: Downloads raw audio from S3 temp location
2. **Validation**: Checks audio format and duration
3. **Processing**:
   - For collaborations: Downloads all stems, mixes with gain adjustments
   - For regular uploads: Applies loudness normalization
4. **Upload**: Saves processed files to permanent S3 locations
5. **Database Update**: Updates track record with final URLs and completion status
6. **Cleanup**: Removes temporary files

## Error Handling

- Processing failures update the track's `processing_status` to 'failed'
- Error messages are stored in `processing_error` column
- Temporary files are cleaned up even on failure
- Failed tracks can be manually reprocessed

## Deployment

```bash
# Create deployment package
./scripts/create-audio-processing-lambda-zip.sh

# Deploy to AWS Lambda
aws lambda update-function-code \
  --function-name jamshot-audio-processing \
  --zip-file fileb://jamshot-audio-processing-lambda.zip
```

## Monitoring

Monitor these CloudWatch metrics:
- Duration (should be < 10 minutes for most tracks)
- Error count
- Success/failure rates
- S3 data transfer costs
