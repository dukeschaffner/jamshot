#!/usr/bin/env python3
"""
Local development server for video export lambda
Allows running the lambda function locally for testing
"""
import os
import sys
import time
import json
from index import lambda_handler

def main():
    print('🎬 Video Export Lambda - Local Development Server')
    print('=' * 50)
    print()
    
    # Check if running in virtual environment
    in_venv = hasattr(sys, 'real_prefix') or (hasattr(sys, 'base_prefix') and sys.base_prefix != sys.prefix)
    if not in_venv:
        venv_path = os.path.join(os.path.dirname(__file__), 'venv')
        if os.path.exists(venv_path):
            print('⚠️  Warning: Virtual environment not activated')
            print(f'   Run: source {venv_path}/bin/activate')
            print('   Or use: ./setup.sh')
            print()
    
    # Check environment variables
    required_vars = [
        'DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD',
        'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_ENDPOINT', 'R2_BUCKET', 'R2_PUBLIC_URL'
    ]
    
    missing_vars = [var for var in required_vars if not os.getenv(var)]
    if missing_vars:
        print('❌ Missing required environment variables:')
        for var in missing_vars:
            print(f'   - {var}')
        print()
        print('Please set these in your environment or .env file')
        sys.exit(1)
    
    print('✅ Environment variables configured')
    print()
    
    # Get track_id from command line or prompt
    if len(sys.argv) > 1:
        track_id = sys.argv[1]
    else:
        track_id = input('Enter track ID to export: ').strip()
    
    if not track_id:
        print('❌ Track ID is required')
        sys.exit(1)
    
    try:
        track_id = int(track_id)
    except ValueError:
        print('❌ Track ID must be a number')
        sys.exit(1)
    
    print(f'🎬 Starting video export for track {track_id}...')
    print()
    
    # Create event
    event = {
        'track_id': str(track_id)
    }
    
    # Run lambda handler
    start_time = time.time()
    result = lambda_handler(event, None)
    elapsed_time = time.time() - start_time
    
    print()
    print('=' * 50)
    print(f'⏱️  Completed in {elapsed_time:.2f} seconds')
    print()
    
    # Parse and display result
    if isinstance(result, dict) and 'body' in result:
        body = json.loads(result['body'])
        if body.get('status') == 'success':
            print('✅ Video export successful!')
            print(f'   Video URL: {body.get("video_url")}')
            print(f'   Duration: {body.get("duration", 0):.2f} seconds')
        else:
            print('❌ Video export failed')
            print(f'   Error: {body.get("error")}')
    else:
        print('Result:', json.dumps(result, indent=2))

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('\n\n🛑 Interrupted by user')
        sys.exit(0)
    except Exception as e:
        print(f'\n❌ Error: {str(e)}')
        import traceback
        traceback.print_exc()
        sys.exit(1)

