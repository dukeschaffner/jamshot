# Video Export Lambda

Python AWS Lambda function for generating video exports of tracks with waveform visualizations.

## Features

- Downloads stems for each track in a collaboration
- Renders each track's audio to its own visualization section
- Uses `combined_audio_url` for the video's audio track
- Displays track name, user names, and profile pictures
- Modular graphics system for easy customization
- Vertical orientation (1080x1920) optimized for social media

## Setup

### 1. Create and Activate Virtual Environment

```bash
cd functions/lambda/video-export

# Option 1: Use the setup script (recommended)
./setup.sh

# Option 2: Manual setup
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

The setup script will create a virtual environment and install all dependencies automatically.

### 2. Environment Variables

Set the following environment variables:

```bash
# Database
export DB_HOST=your-db-host
export DB_PORT=5432
export DB_NAME=your-db-name
export DB_USER=your-db-user
export DB_PASSWORD=your-db-password
export DB_SSL=true

# R2 Storage
export R2_ACCESS_KEY_ID=your-r2-access-key
export R2_SECRET_ACCESS_KEY=your-r2-secret-key
export R2_ENDPOINT=https://your-account-id.r2.cloudflarestorage.com
export R2_BUCKET=your-bucket-name
export R2_PUBLIC_URL=https://your-public-url.com
```

### 3. Local Development

Run the lambda function locally:

```bash
python dev-server.py <track_id>
```

Or set the `TRACK_ID` environment variable:

```bash
export TRACK_ID=123
python dev-server.py
```

## Architecture

### Modular Graphics System

The graphics generation is modular and can be easily swapped out:

- **Base Class**: `utils/graphics/base.py` - Abstract base class for graphics generators
- **Waveform Generator**: `utils/graphics/waveform.py` - Waveform visualization implementation

To create a new graphics generator:

1. Create a new class inheriting from `GraphicsGenerator`
2. Implement `generate_frame()` method
3. Implement `get_fps()` method
4. Update `index.py` to use your new generator

Example:

```python
from utils.graphics.base import GraphicsGenerator

class MyCustomGraphicsGenerator(GraphicsGenerator):
    def generate_frame(self, frame_number, audio_data, track_info, stem_info_list, timestamp):
        # Your custom visualization logic
        pass
    
    def get_fps(self):
        return 30
```

### Components

- **`index.py`**: Main lambda handler
- **`utils/db.py`**: Database connection pool
- **`utils/r2_client.py`**: R2 (S3-compatible) client for file operations
- **`utils/track_fetcher.py`**: Fetches track data, stems, and user info from database
- **`utils/graphics/`**: Modular graphics generation system
- **`dev-server.py`**: Local development server

## Usage

### AWS Lambda

The function expects an event with `track_id`:

```json
{
  "track_id": "123"
}
```

### Local Testing

```bash
python dev-server.py 123
```

## Output

The function generates a video file and uploads it to R2, returning:

```json
{
  "statusCode": 200,
  "body": {
    "status": "success",
    "video_url": "https://your-public-url.com/videos/123-1234567890.mp4",
    "track_id": 123,
    "duration": 45.2
  }
}
```

## Customization

### Changing Graphics Style

To use a different graphics generator, modify `index.py`:

```python
from utils.graphics import WaveformGraphicsGenerator
# Change to your custom generator
graphics_generator = MyCustomGraphicsGenerator()
```

### Video Dimensions

Modify the graphics generator initialization:

```python
graphics_generator = WaveformGraphicsGenerator(width=1920, height=1080)  # Horizontal
```

## Requirements

- Python 3.9+
- FFmpeg (for video encoding)
- PostgreSQL database access
- Cloudflare R2 storage access

## Notes

- Videos are saved to R2 with key format: `videos/{track_id}-{timestamp}.mp4`
- Temporary files are cleaned up after processing
- Profile pictures are loaded from URLs and displayed as circular images
- The waveform visualization divides the screen into sections for each stem in a collaboration

