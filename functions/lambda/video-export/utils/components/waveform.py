"""Waveform component for video frames"""
from typing import List, Optional
from PIL import ImageDraw

from utils.config import WAVEFORM_COLOR, MUTED_WAVEFORM_COLOR, TEXT_COLOR


class WaveformComponent:
    """Component for drawing SoundCloud-style waveforms"""
    
    def __init__(self):
        """Initialize waveform component"""
        pass
    
    def draw(self, draw: ImageDraw, peaks: List, x: int, y: int, width: int, height: int, 
             duration: Optional[float] = None, playback_time: Optional[float] = None,
             muted: bool = False):
        """Draw SoundCloud-style waveform from peaks data
        
        Args:
            draw: ImageDraw object
            peaks: List of peak pairs [min, max]
            x, y: Position of waveform
            width, height: Dimensions of waveform
            duration: Track duration in seconds (for playback coloring)
            playback_time: Current playback time in seconds (None = no coloring)
            muted: When True, played bars use grey instead of seafoam
        """
        if not peaks or len(peaks) == 0:
            return
        
        # Calculate bar width
        bar_width = max(1, width // len(peaks))
        bar_spacing = max(1, bar_width // 4)
        
        center_y = y + height // 2
        
        # Determine if we should color by playback time
        use_playback_coloring = playback_time is not None and duration is not None and duration > 0
        
        for i, peak_pair in enumerate(peaks):
            if i * bar_width >= width:
                break
                
            # Peak pair is [min, max]
            min_val, max_val = peak_pair
            
            # Normalize to height (peaks are typically in range -1 to 1)
            bar_height = int(abs(max_val - min_val) * height / 2)
            bar_height = max(2, min(bar_height, height))  # Ensure visible bars
            
            bar_x = x + i * bar_width
            bar_y1 = center_y - bar_height // 2
            bar_y2 = center_y + bar_height // 2
            
            # Determine bar color based on playback time
            if use_playback_coloring:
                # Calculate the time position of this bar
                bar_time = (i / len(peaks)) * duration
                played_color = MUTED_WAVEFORM_COLOR if muted else WAVEFORM_COLOR
                bar_color = played_color if bar_time < playback_time else TEXT_COLOR
            else:
                # Default: all bars seafoam
                bar_color = WAVEFORM_COLOR
            
            # Draw the waveform bar
            draw.rectangle(
                [bar_x, bar_y1, bar_x + bar_width - bar_spacing, bar_y2],
                fill=bar_color
            )
    
    def draw_placeholder(self, draw: ImageDraw, x: int, y: int, width: int, height: int):
        """Draw a placeholder waveform when peaks data is not available
        
        Args:
            draw: ImageDraw object
            x, y: Position of waveform
            width, height: Dimensions of waveform
        """
        center_y = y + height // 2
        draw.rectangle(
            [x, center_y - 2, x + width, center_y + 2], 
            fill=(80, 80, 80)
        )

