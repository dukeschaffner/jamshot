"""
Base class for graphics generators
"""
from abc import ABC, abstractmethod

class GraphicsGenerator(ABC):
    """
    Base class for graphics generators.
    Subclasses should implement generate_frame to create video frames.
    """
    
    def __init__(self, width=1080, height=1920):
        """
        Initialize graphics generator
        
        Args:
            width: Video width in pixels (default 1080 for vertical)
            height: Video height in pixels (default 1920 for vertical)
        """
        self.width = width
        self.height = height
    
    @abstractmethod
    def generate_frame(self, frame_number, stem_audio_data_list, track_info, stem_info_list, timestamp):
        """
        Generate a single video frame
        
        Args:
            frame_number: Current frame number
            stem_audio_data_list: List of audio data arrays, one per stem (numpy arrays)
            track_info: Dict with track information (title, username, etc.)
            stem_info_list: List of stem information dicts for each track
            timestamp: Current timestamp in seconds
        
        Returns:
            PIL Image or numpy array representing the frame
        """
        pass
    
    @abstractmethod
    def get_fps(self):
        """
        Get frames per second for video generation
        
        Returns:
            int: FPS (typically 30 or 60)
        """
        pass

