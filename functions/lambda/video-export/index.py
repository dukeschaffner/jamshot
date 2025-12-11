"""
AWS Lambda handler for video export generation
"""
import os
import sys
import json
import tempfile
import shutil

# Add utils to path for local development
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from utils.track_fetcher import TrackFetcher
from utils.r2_client import R2Client
from utils.graphics import WaveformGraphicsGenerator
import librosa
import numpy as np
# MoviePy 2.x imports (direct from moviepy package)
from moviepy import ImageSequenceClip, AudioFileClip, CompositeVideoClip
from PIL import Image

def process_stem_audio_with_regions(stem_audio, sample_rate, gain, regions, duration):
    """
    Process stem audio by applying gain and filtering by regions.
    
    Args:
        stem_audio: numpy array of audio samples
        sample_rate: sample rate of the audio
        gain: gain value to apply (0.0 to 1.0)
        regions: list of region dicts with startTime, endTime, and offset
        duration: total duration of the final mix in seconds
    
    Returns:
        numpy array of processed audio matching the duration
    """
    # Apply gain to the full audio
    processed_audio = stem_audio * gain
    
    # If no regions, return the full audio (padded/trimmed to duration)
    if not regions or len(regions) == 0:
        target_samples = int(duration * sample_rate)
        if len(processed_audio) < target_samples:
            # Pad with zeros
            padding = np.zeros(target_samples - len(processed_audio))
            return np.concatenate([processed_audio, padding])
        else:
            # Trim to duration
            return processed_audio[:target_samples]
    
    # Create empty audio track for the full duration
    target_samples = int(duration * sample_rate)
    result_audio = np.zeros(target_samples)
    
    # Process each region
    for region in regions:
        start_time = region.get('startTime', 0)
        # Default end_time to the end of the processed audio
        default_end_time = len(processed_audio) / sample_rate
        end_time = region.get('endTime', default_end_time)
        offset = region.get('offset', 0)
        
        # Convert times to sample indices
        start_sample = int(start_time * sample_rate)
        end_sample = int(end_time * sample_rate)
        offset_sample = int(offset * sample_rate)
        
        # Ensure indices are within bounds
        start_sample = max(0, min(start_sample, len(processed_audio)))
        end_sample = max(start_sample, min(end_sample, len(processed_audio)))
        
        # Extract the region audio
        region_audio = processed_audio[start_sample:end_sample]
        
        # Place it at the offset position
        if offset_sample < target_samples:
            region_end_sample = min(offset_sample + len(region_audio), target_samples)
            region_length = region_end_sample - offset_sample
            result_audio[offset_sample:region_end_sample] = region_audio[:region_length]
    
    return result_audio

def lambda_handler(event, context):
    """
    AWS Lambda handler for video export
    
    Event structure:
    {
        "track_id": "123"
    }
    """
    print('🎬 Video Export Lambda Started')
    print(f'Event: {json.dumps(event)}')
    
    try:
        # Parse event
        track_id = event.get('track_id') or event.get('detail', {}).get('track_id')
        
        if not track_id:
            raise ValueError('track_id is required in event')
        
        track_id = int(track_id)
        
        # Initialize components
        track_fetcher = TrackFetcher(track_id)
        r2_client = R2Client()
        graphics_generator = WaveformGraphicsGenerator()
        
        # Fetch track data
        print(f'📊 Fetching track data for track {track_id}...')
        track_data = track_fetcher.fetch_track_data()
        
        track_info = track_data['track']
        stems = track_data['stems']
        
        print(f'✅ Found {len(stems)} stems')
        
        # Create temp directory for processing
        temp_dir = tempfile.mkdtemp()
        
        try:
            # Download combined audio for video audio track
            print('📥 Downloading combined audio...')
            combined_audio_url = track_info['combined_audio_url']
            if not combined_audio_url:
                combined_audio_url = track_info['audio_url']
            
            # Determine if it's an R2 key or URL
            if combined_audio_url.startswith('tracks/'):
                combined_audio_path = r2_client.download_to_temp(combined_audio_url, '.mp3')
            else:
                combined_audio_path = r2_client.download_url_to_temp(combined_audio_url, '.mp3')
            
            # Load combined audio first to get duration and sample rate
            print('🎵 Loading combined audio...')
            combined_audio_data, sample_rate = librosa.load(combined_audio_path, sr=None)
            duration = len(combined_audio_data) / sample_rate
            
            # Download stems and render audio for visualization
            print('📥 Downloading and processing stems...')
            stem_audio_data = []
            
            for i, stem in enumerate(stems):
                print(f'  Processing stem {i+1}/{len(stems)}: {stem["title"]}')
                
                audio_url = stem['audio_url']
                gain = stem.get('gain', 1.0)
                regions = stem.get('regions', [])
                
                # Download stem audio
                if audio_url.startswith('tracks/'):
                    stem_path = r2_client.download_to_temp(audio_url, '.mp3')
                else:
                    stem_path = r2_client.download_url_to_temp(audio_url, '.mp3')
                
                # Load stem audio
                stem_audio, _ = librosa.load(stem_path, sr=sample_rate)
                
                # Process stem audio with regions and gain
                processed_audio = process_stem_audio_with_regions(
                    stem_audio,
                    sample_rate,
                    gain,
                    regions,
                    duration
                )
                
                if regions:
                    print(f'    Applied gain {gain} and {len(regions)} region(s)')
                else:
                    print(f'    Applied gain {gain} (no regions)')
                
                stem_audio_data.append({
                    'audio': processed_audio,
                    'path': stem_path,
                    'info': stem
                })
            
            # All stems should already be the same length (duration) after processing
            # But ensure they match exactly
            target_length = len(combined_audio_data)
            for stem_data in stem_audio_data:
                if len(stem_data['audio']) < target_length:
                    padding = np.zeros(target_length - len(stem_data['audio']))
                    stem_data['audio'] = np.concatenate([stem_data['audio'], padding])
                elif len(stem_data['audio']) > target_length:
                    stem_data['audio'] = stem_data['audio'][:target_length]
            
            # Generate video frames
            print('🎨 Generating video frames...')
            fps = graphics_generator.get_fps()
            total_frames = int(duration * fps)
            
            frame_paths = []
            for frame_num in range(total_frames):
                timestamp = frame_num / fps
                
                # Extract audio segments for each stem for this frame
                start_sample = int(timestamp * sample_rate)
                end_sample = int((timestamp + 1/fps) * sample_rate)
                
                stem_audio_segments = []
                for stem_data in stem_audio_data:
                    stem_audio = stem_data['audio']
                    if start_sample < len(stem_audio):
                        segment_end = min(end_sample, len(stem_audio))
                        segment = stem_audio[start_sample:segment_end]
                    else:
                        segment = np.array([])
                    stem_audio_segments.append(segment)
                
                # Generate frame with stem-specific audio data
                frame = graphics_generator.generate_frame(
                    frame_num,
                    stem_audio_segments,
                    track_info,
                    stems,
                    timestamp
                )
                
                # Save frame
                frame_path = os.path.join(temp_dir, f'frame_{frame_num:06d}.png')
                frame.save(frame_path)
                frame_paths.append(frame_path)
                
                if (frame_num + 1) % 30 == 0:
                    print(f'  Generated {frame_num + 1}/{total_frames} frames')
            
            # Create video from frames
            print('🎬 Creating video...')
            video_path = os.path.join(temp_dir, 'video.mp4')
            
            # Use moviepy ImageSequenceClip to create video from frames
            video_clip = ImageSequenceClip(frame_paths, fps=fps)
            
            # Load audio and combine with video
            audio_clip = AudioFileClip(combined_audio_path)
            
            # Ensure video duration matches audio duration
            # Use a small tolerance for floating point comparison
            duration_diff = abs(video_clip.duration - audio_clip.duration)
            tolerance = 0.1  # 100ms tolerance
            
            if video_clip.duration > audio_clip.duration + tolerance:
                # Trim video to match audio duration
                video_clip = video_clip.subclipped(0, audio_clip.duration)
            elif video_clip.duration < audio_clip.duration - tolerance:
                # Loop video if audio is longer
                loops_needed = int(np.ceil(audio_clip.duration / video_clip.duration))
                # Create composite clip
                composite_clip = CompositeVideoClip([video_clip] * loops_needed)
                # Trim to the minimum of audio duration or composite clip duration
                # to avoid errors from floating point precision issues
                trim_duration = min(audio_clip.duration, composite_clip.duration)
                video_clip = composite_clip.subclipped(0, trim_duration)
            
            # Trim audio to match video duration if needed (to avoid sync issues)
            if audio_clip.duration > video_clip.duration + tolerance:
                audio_clip = audio_clip.subclipped(0, video_clip.duration)
            
            final_clip = video_clip.with_audio(audio_clip)
            
            # MoviePy 2.x API - removed verbose and logger parameters
            final_clip.write_videofile(
                video_path,
                fps=fps,
                codec='libx264',
                audio_codec='aac',
                temp_audiofile=os.path.join(temp_dir, 'temp_audio.m4a'),
                remove_temp=True
            )
            
            # Clean up clips
            video_clip.close()
            audio_clip.close()
            final_clip.close()
            
            # Upload video to R2
            print('📤 Uploading video to R2...')
            video_r2_key = f"videos/{track_id}-{int(os.path.getmtime(video_path))}.mp4"
            video_url = r2_client.upload_file(video_path, video_r2_key)
            
            print(f'✅ Video export completed: {video_url}')
            
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'status': 'success',
                    'video_url': video_url,
                    'track_id': track_id,
                    'duration': duration
                })
            }
        
        finally:
            # Cleanup temp directory
            print('🧹 Cleaning up temporary files...')
            shutil.rmtree(temp_dir, ignore_errors=True)
            
            # Cleanup stem audio files
            for stem_data in stem_audio_data:
                try:
                    os.unlink(stem_data['path'])
                except:
                    pass
            
            try:
                os.unlink(combined_audio_path)
            except:
                pass
    
    except Exception as e:
        print(f'❌ Error during video export: {str(e)}')
        import traceback
        traceback.print_exc()
        
        return {
            'statusCode': 500,
            'body': json.dumps({
                'status': 'error',
                'error': str(e),
                'track_id': event.get('track_id') or event.get('detail', {}).get('track_id')
            })
        }

# For local development
if __name__ == '__main__':
    import sys
    
    # Get track_id from command line or environment
    track_id = sys.argv[1] if len(sys.argv) > 1 else os.getenv('TRACK_ID')
    
    if not track_id:
        print('Usage: python index.py <track_id>')
        print('Or set TRACK_ID environment variable')
        sys.exit(1)
    
    event = {'track_id': track_id}
    result = lambda_handler(event, None)
    print(json.dumps(result, indent=2))

