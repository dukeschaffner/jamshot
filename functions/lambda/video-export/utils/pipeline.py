"""Main pipeline orchestrating the video export process"""
import os
import tempfile
from typing import Dict, Optional, Union, Callable

from utils.data_collection import DataCollectionModule
from utils.peaks_processing import PeaksProcessingModule
from utils.frame_generation import FrameGenerationModule
from utils.video_generation import VideoGenerationModule
from utils.models import TrackData


class VideoExportPipeline:
    """Main pipeline orchestrating the video export process"""
    
    def __init__(self, save_locally: bool = False, local_dir: Optional[str] = None):
        self.save_locally = save_locally
        self.local_dir = local_dir or tempfile.mkdtemp()
        
        # Initialize modules (no API URL needed anymore)
        self.data_collector = DataCollectionModule()
        self.peaks_processor = PeaksProcessingModule()
        self.frame_generator = FrameGenerationModule()
        self.video_generator = VideoGenerationModule(self.frame_generator)
    
    def export_track_video_frame(self, track_id: Union[int, str]) -> Dict:
        """Main export method - Phase 1: single frame generation"""
        tracks = None
        try:
            print(f"🎬 Starting video export for track {track_id}")
            
            # Step 1: Data Collection (blocking - will raise exception on failure)
            # Note: For frame generation, we don't need audio, so pass download_audio=False
            tracks = self.data_collector.collect_all_data(track_id, download_audio=False)
            
            # Step 2: Peaks Processing (placeholder)
            processed_tracks = self.peaks_processor.process_tracks(tracks)
            
            # Step 3: Frame Generation
            output_path = None
            if self.save_locally:
                output_path = os.path.join(self.local_dir, f"track_{track_id}_frame.png")
            
            frame = self.frame_generator.generate_frame(processed_tracks, output_path)
            
            result = {
                'success': True,
                'track_count': len(processed_tracks),
                'tracks': [{
                    'id': t.id,
                    'title': t.title,
                    'username': t.username,
                    'has_peaks': t.peaks_data is not None,
                    'has_profile_pic': t.profile_pic_data is not None
                } for t in processed_tracks],
                'frame_size': (frame.width, frame.height)
            }
            
            if output_path:
                result['output_path'] = output_path
            
            print(f"✅ Video export completed successfully")
            return result
            
        except Exception as e:
            print(f"❌ Video export failed: {e}")
            import traceback
            traceback.print_exc()
            
            # Cleanup: Remove any downloaded audio files (shouldn't be any for frame export)
            if tracks:
                for track in tracks:
                    if track.audio_file_path and os.path.exists(track.audio_file_path):
                        try:
                            audio_dir = os.path.dirname(track.audio_file_path)
                            os.remove(track.audio_file_path)
                            try:
                                os.rmdir(audio_dir)
                            except:
                                pass
                        except Exception as cleanup_error:
                            print(f"⚠️  Error cleaning up audio file: {cleanup_error}")
            
            return {
                'success': False,
                'error': str(e)
            }
    
    def export_track_video(self, 
                          track_id: Union[int, str], 
                          duration: Optional[float] = None,
                          start_time: Optional[float] = None,
                          end_time: Optional[float] = None,
                          progress_callback: Optional[Callable[[int, int], None]] = None) -> Dict:
        """
        Generate full video for a track
        
        Args:
            track_id: Track ID to generate video for
            duration: Video duration in seconds (defaults to longest track duration, ignored if start_time/end_time provided)
            start_time: Start timestamp in seconds (defaults to 0)
            end_time: End timestamp in seconds (defaults to track duration)
            progress_callback: Optional callback function(current_frame, total_frames)
        
        Returns:
            Dictionary with success status and video information
        """
        tracks = None
        try:
            print(f"🎬 Starting full video export for track {track_id}")
            
            # Step 1: Data Collection (blocking - will raise exception on failure)
            tracks = self.data_collector.collect_all_data(track_id)
            
            # Step 2: Peaks Processing (placeholder)
            processed_tracks = self.peaks_processor.process_tracks(tracks)
            
            # Step 3: Video Generation
            output_path = None
            if self.save_locally:
                output_path = os.path.join(self.local_dir, f"track_{track_id}_video.mp4")
            else:
                output_path = os.path.join(tempfile.gettempdir(), f"track_{track_id}_video.mp4")
            
            video_path = self.video_generator.generate_video(
                processed_tracks,
                output_path,
                duration=duration,
                start_time=start_time,
                end_time=end_time,
                progress_callback=progress_callback
            )
            
            # Get video duration
            if start_time is not None or end_time is not None:
                max_track_duration = max((track.duration for track in processed_tracks), default=30.0)
                if start_time is None:
                    start_time = 0.0
                if end_time is None:
                    end_time = max_track_duration
                duration = end_time - start_time
            elif duration is None:
                duration = max((track.duration for track in processed_tracks), default=30.0)
            
            result = {
                'success': True,
                'track_count': len(processed_tracks),
                'tracks': [{
                    'id': t.id,
                    'title': t.title,
                    'username': t.username,
                    'has_peaks': t.peaks_data is not None,
                    'has_profile_pic': t.profile_pic_data is not None
                } for t in processed_tracks],
                'video_path': video_path,
                'duration': duration,
                'start_time': start_time if start_time is not None else 0.0,
                'end_time': end_time if end_time is not None else duration,
                'fps': self.video_generator.fps,
                'frame_size': (self.frame_generator.width, self.frame_generator.height)
            }
            
            print(f"✅ Full video export completed successfully")
            return result
            
        except Exception as e:
            print(f"❌ Video export failed: {e}")
            import traceback
            traceback.print_exc()
            
            # Cleanup: Remove any downloaded audio files
            if tracks:
                for track in tracks:
                    if track.audio_file_path and os.path.exists(track.audio_file_path):
                        try:
                            audio_dir = os.path.dirname(track.audio_file_path)
                            os.remove(track.audio_file_path)
                            # Try to remove the directory if it's empty
                            try:
                                os.rmdir(audio_dir)
                            except:
                                pass
                        except Exception as cleanup_error:
                            print(f"⚠️  Error cleaning up audio file: {cleanup_error}")
            
            return {
                'success': False,
                'error': str(e)
            }

