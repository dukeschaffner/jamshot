"""Module for generating full video from frames"""
import os
import tempfile
from typing import List, Optional, Callable
from moviepy import ImageSequenceClip, AudioFileClip, CompositeVideoClip

from utils.config import VIDEO_FPS, VIDEO_CODEC, VIDEO_BITRATE
from utils.models import TrackData
from utils.frame_generation import FrameGenerationModule


class VideoGenerationModule:
    """Module for generating full video from frames"""
    
    def __init__(self, 
                 frame_generator: FrameGenerationModule,
                 fps: int = VIDEO_FPS,
                 codec: str = VIDEO_CODEC,
                 bitrate: str = VIDEO_BITRATE):
        """
        Initialize video generation module
        
        Args:
            frame_generator: FrameGenerationModule instance for generating frames
            fps: Frames per second for the output video
            codec: Video codec to use
            bitrate: Video bitrate
        """
        self.frame_generator = frame_generator
        self.fps = fps
        self.codec = codec
        self.bitrate = bitrate
    
    def generate_video(self, 
                      tracks: List[TrackData], 
                      output_path: str,
                      duration: Optional[float] = None,
                      progress_callback: Optional[Callable[[int, int], None]] = None) -> str:
        """
        Generate a full video from tracks
        
        Args:
            tracks: List of TrackData objects
            output_path: Path where video will be saved
            duration: Video duration in seconds (defaults to longest track duration)
            progress_callback: Optional callback function(current_frame, total_frames)
        
        Returns:
            Path to the generated video file
        """
        # Determine video duration (use longest track duration if not specified)
        if duration is None:
            duration = max((track.duration for track in tracks), default=30.0)
        
        print(f"🎬 Generating video: {duration:.2f}s @ {self.fps} FPS")
        print(f"📊 Total frames: {int(duration * self.fps)}")
        
        # Create temporary directory for frames
        frame_dir = tempfile.mkdtemp(prefix="video_frames_")
        frame_paths = []
        
        try:
            # Generate frames at each time point
            total_frames = int(duration * self.fps)
            frame_interval = duration / total_frames if total_frames > 0 else 0.1
            
            for frame_num in range(total_frames):
                playback_time = frame_num * frame_interval
                
                # Generate frame at this playback time
                frame_path = os.path.join(frame_dir, f"frame_{frame_num:06d}.png")
                self.frame_generator.generate_frame(
                    tracks, 
                    save_path=frame_path,
                    playback_time=playback_time,
                    verbose=False  # Suppress per-frame messages during video generation
                )
                frame_paths.append(frame_path)
                
                # Progress callback
                if progress_callback:
                    progress_callback(frame_num + 1, total_frames)
                
                # Print progress every 10%
                if (frame_num + 1) % max(1, total_frames // 10) == 0:
                    progress = ((frame_num + 1) / total_frames) * 100
                    print(f"📹 Progress: {progress:.1f}% ({frame_num + 1}/{total_frames} frames)")
            
            print(f"✅ Generated {len(frame_paths)} frames")
            print(f"🎞️  Creating video from frames...")
            
            # Validate tracks and audio file - REQUIRED for video export
            if not tracks or len(tracks) == 0:
                raise ValueError("No tracks provided. Cannot generate video.")
            
            leaf_track = tracks[-1]
            if not leaf_track.audio_file_path or not os.path.exists(leaf_track.audio_file_path):
                raise ValueError(f"Audio file not found for track {leaf_track.id}. Cannot generate video without audio.")
            
            # Load audio file first - blocking operation, will raise exception on failure
            print(f"🎵 Loading audio from {leaf_track.audio_file_path}")
            audio_clip = AudioFileClip(leaf_track.audio_file_path)
            
            # Create video from frame sequence
            video_clip = ImageSequenceClip(frame_paths, fps=self.fps)
            
            # Determine final duration (use the shorter of the two, with small tolerance for floating point)
            video_duration = video_clip.duration
            audio_duration = audio_clip.duration
            duration_tolerance = 0.1  # 100ms tolerance
            
            # Check if durations match (within tolerance)
            if abs(video_duration - audio_duration) <= duration_tolerance:
                # Durations match - use video duration
                final_duration = video_duration
            else:
                # Durations differ - use the shorter one and trim both if needed
                final_duration = min(video_duration, audio_duration)
                
                # Trim video if it's longer
                if video_duration > final_duration + duration_tolerance:
                    video_clip = video_clip.subclip(0, final_duration)
                    print(f"📹 Trimmed video from {video_duration:.2f}s to {final_duration:.2f}s")
                
                # Trim audio if it's longer - AudioFileClip should support subclip
                if audio_duration > final_duration + duration_tolerance:
                    try:
                        # Try subclip first (standard MoviePy API)
                        audio_clip = audio_clip.subclip(0, final_duration)
                        print(f"🎵 Trimmed audio from {audio_duration:.2f}s to {final_duration:.2f}s")
                    except AttributeError:
                        # If subclip doesn't work, try subclipped (some MoviePy versions)
                        try:
                            audio_clip = audio_clip.subclipped(0, final_duration)
                            print(f"🎵 Trimmed audio from {audio_duration:.2f}s to {final_duration:.2f}s")
                        except AttributeError:
                            # If neither works, set duration on audio clip
                            audio_clip = audio_clip.set_duration(final_duration)
                            print(f"🎵 Set audio duration to {final_duration:.2f}s")
                
                # If audio is shorter, warn but proceed
                if audio_duration < final_duration - duration_tolerance:
                    print(f"⚠️  Audio duration ({audio_duration:.2f}s) is shorter than video ({video_duration:.2f}s), video will be trimmed")
            
            # Attach audio to video clip - blocking operation, will raise exception on failure
            # ImageSequenceClip uses with_audio() method (not set_audio) in some MoviePy versions
            # This is a required operation - failure will stop execution
            try:
                # Try with_audio first (suggested by error message)
                if hasattr(video_clip, 'with_audio'):
                    final_clip = video_clip.with_audio(audio_clip)
                elif hasattr(video_clip, 'set_audio'):
                    # Fallback to set_audio if available
                    final_clip = video_clip.set_audio(audio_clip)
                else:
                    # Last resort: use CompositeVideoClip
                    final_clip = CompositeVideoClip([video_clip]).set_audio(audio_clip)
                print(f"✅ Audio attached to video (duration: {final_duration:.2f}s)")
            except Exception as e:
                # Clean up clips if attachment fails - this is a blocking error
                video_clip.close()
                audio_clip.close()
                raise RuntimeError(f"Failed to attach audio to video for track {leaf_track.id}. This is a blocking error. Error: {e}")
            
            # Write video file with audio
            try:
                final_clip.write_videofile(
                    output_path,
                    codec=self.codec,
                    bitrate=self.bitrate,
                    audio_codec='aac',
                    logger=None
                )
            finally:
                # Clean up clips
                final_clip.close()
                video_clip.close()
                audio_clip.close()
            
            print(f"✅ Video saved to: {output_path}")
            
            # Clean up temporary frames
            print(f"🧹 Cleaning up temporary frames...")
            for frame_path in frame_paths:
                try:
                    os.remove(frame_path)
                except:
                    pass
            try:
                os.rmdir(frame_dir)
            except:
                pass
            
            # Clean up audio file if it was downloaded
            if tracks and len(tracks) > 0:
                leaf_track = tracks[-1]
                if leaf_track.audio_file_path and os.path.exists(leaf_track.audio_file_path):
                    try:
                        audio_dir = os.path.dirname(leaf_track.audio_file_path)
                        os.remove(leaf_track.audio_file_path)
                        # Try to remove the directory if it's empty
                        try:
                            os.rmdir(audio_dir)
                        except:
                            pass
                    except:
                        pass
            
            return output_path
            
        except Exception as e:
            print(f"❌ Error generating video: {e}")
            import traceback
            traceback.print_exc()
            
            # Clean up frames on error
            for frame_path in frame_paths:
                try:
                    os.remove(frame_path)
                except:
                    pass
            try:
                os.rmdir(frame_dir)
            except:
                pass
            
            # Clean up clips on error (must be done in order)
            if 'final_clip' in locals():
                try:
                    final_clip.close()
                except:
                    pass
            if 'video_clip' in locals():
                try:
                    video_clip.close()
                except:
                    pass
            if 'audio_clip' in locals():
                try:
                    audio_clip.close()
                except:
                    pass
            
            # Re-raise the exception to block execution
            raise

