"""PIL-based frame generation with SoundCloud-style waveforms"""
from typing import List, Optional
from PIL import Image, ImageDraw, ImageFont

from utils.config import (
    FRAME_WIDTH, FRAME_HEIGHT, TRACK_HEIGHT, PADDING,
    BACKGROUND_COLOR, TEXT_COLOR, SECONDARY_TEXT_COLOR
)
from utils.models import TrackData
from utils.components.watermark import WatermarkComponent
from utils.components.track_details import TrackDetailsComponent
from utils.components.waveform import WaveformComponent
from utils.components.add_track_button import AddTrackButtonComponent


class FrameGenerationModule:
    """PIL-based frame generation with SoundCloud-style waveforms"""
    
    def __init__(self, 
                 width: int = FRAME_WIDTH, 
                 height: int = FRAME_HEIGHT,
                 track_height: int = TRACK_HEIGHT):
        self.width = width
        self.height = height
        self.track_height = track_height
        
        # Calculate profile pic size as 1/15 of video height
        self.profile_pic_size = self.height // 15
        
        # Try to load a font for title, fall back to default if not available
        # Scale font size proportionally with profile pic size
        base_font_size_large = int(self.profile_pic_size * 0.25)  # ~25% of profile pic
        
        try:
            self.font_large = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", base_font_size_large)
        except:
            self.font_large = ImageFont.load_default()
        
        # Initialize components
        self.watermark_component = WatermarkComponent(width, height)
        self.track_details_component = TrackDetailsComponent(self.profile_pic_size)
        self.waveform_component = WaveformComponent()
        self.add_track_button_component = AddTrackButtonComponent(width, height)
    
    def generate_frame(self, tracks: List[TrackData], save_path: Optional[str] = None, 
                      playback_time: Optional[float] = None, verbose: bool = True, 
                      debug: bool = False) -> Image:
        """Generate a single frame with vertical stack of tracks
        
        Args:
            tracks: List of TrackData objects
            save_path: Optional path to save the frame
            playback_time: Optional playback time in seconds for coloring waveform bars
            verbose: Whether to print progress messages
            debug: Whether to show track section borders for debugging
        """
        if verbose:
            print(f"🎨 Generating frame with {len(tracks)} tracks")
        
        # Create image
        image = Image.new('RGB', (self.width, self.height), BACKGROUND_COLOR)
        draw = ImageDraw.Draw(image)
        
        # Calculate layout - reserve space for add track button at bottom
        button_reserved_height = self.add_track_button_component.get_reserved_height()
        available_height = self.height - 2 * PADDING - button_reserved_height
        track_spacing = available_height // len(tracks) if len(tracks) > 0 else self.track_height
        
        # Draw title
        title = f"Track Collaboration - {len(tracks)} Artists"
        draw.text((PADDING, PADDING // 2), title, fill=TEXT_COLOR, font=self.font_large)

        leaf_track = [track for track in tracks if track.is_leaf_track][0]
        duration = leaf_track.duration

        # Draw each track
        for i, track in enumerate(tracks):
            track_y_start = PADDING + i * track_spacing
            track_y_end = track_y_start + track_spacing
            
            # Draw waveform - full width (with padding)
            # Waveform height is proportional to track section height (60% of section height)
            waveform_x = PADDING
            waveform_width = self.width - 2 * PADDING
            waveform_height = int(track_spacing * 0.6)  # 60% of section height
            waveform_y = track_y_start + (track_spacing - waveform_height) // 2
            
            if track.peaks_data:
                self.waveform_component.draw(draw, track.peaks_data, waveform_x, waveform_y, 
                                           waveform_width, waveform_height,
                                           duration=duration, playback_time=playback_time)
            else:
                # Placeholder waveform
                self.waveform_component.draw_placeholder(draw, waveform_x, waveform_y, 
                                                        waveform_width, waveform_height)
            
            # Draw user/track details at bottom left of track section
            # Position profile pic so it fits within the track section
            details_y = track_y_end - self.profile_pic_size - 5  # Bottom of section minus profile pic size
            
            # Use track details component to draw profile pic, username, and track title
            self.track_details_component.draw_track_details(draw, image, track, PADDING, details_y)
            
            # Draw border at bottom of vertical section (only if debug mode)
            if debug:
                border_y = track_y_end - 1  # Position at bottom of section
                draw.line([(PADDING, border_y), (self.width - PADDING, border_y)], 
                         fill=SECONDARY_TEXT_COLOR, width=1)
        
        # Draw TikTok-style watermark using watermark component
        self.watermark_component.draw(image, playback_time)
        
        # Draw add track button at bottom center
        self.add_track_button_component.draw(image)
        
        # Save if path provided
        if save_path:
            image.save(save_path)
            if verbose:
                print(f"💾 Frame saved to {save_path}")
        
        return image

