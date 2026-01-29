"""AWS Lambda handler for video export processing"""
import os
import json
import boto3
from botocore.config import Config
import psycopg2
from psycopg2.extras import RealDictCursor
from utils.pipeline import VideoExportPipeline
from utils.config import R2_PUBLIC_URL, get_db_connection

# R2/S3 client setup
s3_client = boto3.client(
    's3',
    endpoint_url=os.getenv('R2_ENDPOINT'),
    aws_access_key_id=os.getenv('R2_ACCESS_KEY_ID'),
    aws_secret_access_key=os.getenv('R2_SECRET_ACCESS_KEY'),
    region_name='auto',  # R2 uses 'auto' region or specific regions: wnam, enam, weur, eeur, apac, oc
    config=Config(signature_version='s3v4')
)

R2_BUCKET = os.getenv('R2_BUCKET')


def get_user_friendly_error(error_message: str) -> str:
    """Convert technical errors to user-friendly messages"""
    error_lower = error_message.lower()
    
    if 'database' in error_lower or 'connection' in error_lower:
        return "Unable to start video export. Please try again."
    elif 'lambda' in error_lower or 'invocation' in error_lower:
        return "Video export service unavailable. Please try again later."
    elif 'processing' in error_lower or 'generation' in error_lower:
        return "Video generation failed. Please try again."
    elif 'not found' in error_lower:
        return "Track not found. Please try again."
    else:
        return "Video generation failed. Please try again."


def update_export_status(export_id: int, status: str, video_url: str = None, error_message: str = None):
    """Update video export status in database"""
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        if status == 'completed' and video_url:
            cursor.execute(
                'UPDATE video_exports SET status = %s, video_url = %s WHERE id = %s',
                (status, video_url, export_id)
            )
        elif status == 'failed' and error_message:
            cursor.execute(
                'UPDATE video_exports SET status = %s, error_message = %s WHERE id = %s',
                (status, error_message, export_id)
            )
        else:
            cursor.execute(
                'UPDATE video_exports SET status = %s WHERE id = %s',
                (status, export_id)
            )
        
        conn.commit()
        cursor.close()
    except Exception as e:
        print(f"Error updating export status: {e}")
        if conn:
            conn.rollback()
    finally:
        if conn:
            conn.close()


def upload_video_to_r2(local_path: str, track_guid: str) -> str:
    """Upload video file to R2 and return public URL"""
    try:
        r2_key = f"videos/{track_guid}.mp4"
        
        # Upload to R2
        with open(local_path, 'rb') as video_file:
            s3_client.upload_fileobj(
                video_file,
                R2_BUCKET,
                r2_key,
                ExtraArgs={'ContentType': 'video/mp4'}
            )
        
        # Generate public URL
        video_url = f"{R2_PUBLIC_URL}/{r2_key}"
        
        print(f"✅ Uploaded video to R2: {video_url}")
        return video_url
        
    except Exception as e:
        print(f"❌ Error uploading video to R2: {e}")
        raise


def handler(event=None, context=None):
    """AWS Lambda handler for video export"""
    print("🎬 Video Export Lambda Started")
    
    # Support both Lambda event and direct execution with environment variables
    if event is None:
        event = {}
    
    # Parse event parameters (support both Lambda event format and environment variables for local dev)
    export_id = event.get('export_id') or os.getenv('EXPORT_ID')
    track_id = event.get('track_id') or os.getenv('TRACK_ID')
    track_guid = event.get('track_guid') or os.getenv('TRACK_GUID')
    start_time = event.get('start_time') or os.getenv('START_TIME', '0')
    duration = event.get('duration') or os.getenv('DURATION')
    
    # Convert start_time to float if it's a string
    if isinstance(start_time, str):
        try:
            start_time = float(start_time) if start_time else 0
        except ValueError:
            start_time = 0
    
    # Convert duration to float if it's a string
    if isinstance(duration, str):
        try:
            duration = float(duration) if duration else None
        except ValueError:
            duration = None
    
    # Convert export_id and track_id to int if they're strings
    if isinstance(export_id, str):
        try:
            export_id = int(export_id)
        except ValueError:
            pass
    
    if isinstance(track_id, str):
        try:
            track_id = int(track_id)
        except ValueError:
            pass
    
    print(f"Event: {json.dumps(event, default=str)}")
    print(f"Environment variables:")
    print(f"  EXPORT_ID: {os.getenv('EXPORT_ID')}")
    print(f"  TRACK_ID: {os.getenv('TRACK_ID')}")
    print(f"  TRACK_GUID: {os.getenv('TRACK_GUID')}")
    print(f"  START_TIME: {os.getenv('START_TIME')}")
    print(f"  DURATION: {os.getenv('DURATION')}")
    
    try:
        if not export_id:
            raise ValueError('export_id is required in event or EXPORT_ID environment variable')
        
        if not track_id:
            raise ValueError('track_id is required in event or TRACK_ID environment variable')
        
        if not track_guid:
            raise ValueError('track_guid is required in event or TRACK_GUID environment variable')
        
        print(f"📊 Processing video export:")
        print(f"  Export ID: {export_id}")
        print(f"  Track ID: {track_id}")
        print(f"  Track GUID: {track_guid}")
        print(f"  Start time: {start_time}s")
        print(f"  Duration: {duration}s")
        
        # Initialize pipeline
        pipeline = VideoExportPipeline(save_locally=True)
        
        # Calculate end_time from start_time and duration
        end_time = start_time + duration if duration else None
        
        # Generate video
        print("🎥 Generating video...")
        result = pipeline.export_track_video(
            track_id=track_id,
            start_time=start_time,
            end_time=end_time,
            duration=duration
        )
        
        if not result.get('success'):
            error_msg = result.get('error', 'Video generation failed')
            user_friendly_error = get_user_friendly_error(error_msg)
            update_export_status(export_id, 'failed', error_message=user_friendly_error)
            
            return {
                'statusCode': 500,
                'body': json.dumps({
                    'success': False,
                    'error': user_friendly_error,
                    'export_id': export_id
                })
            }
        
        # Upload video to R2
        video_path = result.get('video_path')
        if not video_path or not os.path.exists(video_path):
            error_msg = 'Generated video file not found'
            user_friendly_error = get_user_friendly_error(error_msg)
            update_export_status(export_id, 'failed', error_message=user_friendly_error)
            
            return {
                'statusCode': 500,
                'body': json.dumps({
                    'success': False,
                    'error': user_friendly_error,
                    'export_id': export_id
                })
            }
        
        print("📤 Uploading video to R2...")
        video_url = upload_video_to_r2(video_path, track_guid)
        
        # Update database with success status
        update_export_status(export_id, 'completed', video_url=video_url)
        
        # Cleanup local video file
        try:
            if os.path.exists(video_path):
                os.remove(video_path)
                print(f"🧹 Cleaned up local video file: {video_path}")
        except Exception as cleanup_error:
            print(f"⚠️  Error cleaning up video file: {cleanup_error}")
        
        print("✅ Video export completed successfully!")
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'success': True,
                'export_id': export_id,
                'video_url': video_url,
                'track_id': track_id
            })
        }
        
    except Exception as e:
        print(f"❌ Error during video export: {e}")
        import traceback
        traceback.print_exc()
        
        # Try to update status if we have export_id
        export_id = event.get('export_id')
        if export_id:
            try:
                user_friendly_error = get_user_friendly_error(str(e))
                update_export_status(export_id, 'failed', error_message=user_friendly_error)
            except Exception as update_error:
                print(f"⚠️  Failed to update export status: {update_error}")
        
        return {
            'statusCode': 500,
            'body': json.dumps({
                'success': False,
                'error': get_user_friendly_error(str(e)),
                'export_id': export_id
            })
        }


# Local development: if this file is run directly, invoke the handler
if __name__ == '__main__':
    print('🔧 Running in local development mode')
    import sys
    
    try:
        # Create event object from environment variables (set by dev server)
        event = {
            'export_id': os.getenv('EXPORT_ID'),
            'track_id': os.getenv('TRACK_ID'),
            'track_guid': os.getenv('TRACK_GUID'),
            'start_time': os.getenv('START_TIME', '0'),
            'duration': os.getenv('DURATION')
        }
        
        print('🔍 Debug: Local event object:', json.dumps(event, default=str))
        
        result = handler(event, {})
        print('✅ Local execution completed:', json.dumps(result, default=str))
        sys.exit(0)
    except Exception as error:
        print(f'❌ Local execution failed: {error}')
        import traceback
        traceback.print_exc()
        sys.exit(1)

