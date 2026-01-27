"""PIL-based frame generation with SoundCloud-style waveforms"""
import io
from typing import List, Optional
from PIL import Image, ImageDraw, ImageFont

from utils.config import (
    FRAME_WIDTH, FRAME_HEIGHT, TRACK_HEIGHT, PROFILE_PIC_SIZE, PADDING,
    WAVEFORM_COLOR, BACKGROUND_COLOR, TEXT_COLOR, SECONDARY_TEXT_COLOR
)
from utils.models import TrackData


class FrameGenerationModule:
    """PIL-based frame generation with SoundCloud-style waveforms"""
    
    def __init__(self, 
                 width: int = FRAME_WIDTH, 
                 height: int = FRAME_HEIGHT,
                 track_height: int = TRACK_HEIGHT):
        self.width = width
        self.height = height
        self.track_height = track_height
        
        # Try to load a font, fall back to default if not available
        try:
            self.font_large = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 24)
            self.font_medium = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 18)
            self.font_small = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 14)
        except:
            self.font_large = ImageFont.load_default()
            self.font_medium = ImageFont.load_default()
            self.font_small = ImageFont.load_default()
    
    def draw_waveform(self, draw: ImageDraw, peaks: List, x: int, y: int, width: int, height: int, 
                     duration: float = None, playback_time: float = None):
        """Draw SoundCloud-style waveform from peaks data
        
        Args:
            draw: ImageDraw object
            peaks: List of peak pairs [min, max]
            x, y: Position of waveform
            width, height: Dimensions of waveform
            duration: Track duration in seconds (for playback coloring)
            playback_time: Current playback time in seconds (None = no coloring)
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
                # If bar is earlier than playback time, it's played (orange), otherwise white
                bar_color = WAVEFORM_COLOR if bar_time < playback_time else TEXT_COLOR
            else:
                # Default: all bars orange
                bar_color = WAVEFORM_COLOR
            
            # Draw the waveform bar
            draw.rectangle(
                [bar_x, bar_y1, bar_x + bar_width - bar_spacing, bar_y2],
                fill=bar_color
            )
    
    def draw_profile_pic(self, draw: ImageDraw, image: Image, profile_pic_data: bytes, x: int, y: int, size: int):
        """Draw circular profile picture"""
        try:
            # Load profile picture
            profile_img = Image.open(io.BytesIO(profile_pic_data))
            profile_img = profile_img.convert('RGB')
            profile_img = profile_img.resize((size, size), Image.Resampling.LANCZOS)
            
            # Create circular mask
            mask = Image.new('L', (size, size), 0)
            mask_draw = ImageDraw.Draw(mask)
            mask_draw.ellipse([0, 0, size, size], fill=255)
            
            # Apply mask and paste onto main image
            profile_img.putalpha(mask)
            image.paste(profile_img, (x, y), profile_img)
            
        except Exception as e:
            print(f"⚠️  Error drawing profile pic: {e}")
            # Draw placeholder circle
            draw.ellipse([x, y, x + size, y + size], fill=(100, 100, 100))
    
    def generate_frame(self, tracks: List[TrackData], save_path: Optional[str] = None, 
                      playback_time: Optional[float] = None, verbose: bool = True) -> Image:
        """Generate a single frame with vertical stack of tracks
        
        Args:
            tracks: List of TrackData objects
            save_path: Optional path to save the frame
            playback_time: Optional playback time in seconds for coloring waveform bars
            verbose: Whether to print progress messages
        """
        if verbose:
            print(f"🎨 Generating frame with {len(tracks)} tracks")
        
        # Create image
        image = Image.new('RGB', (self.width, self.height), BACKGROUND_COLOR)
        draw = ImageDraw.Draw(image)
        
        # Calculate layout
        available_height = self.height - 2 * PADDING
        track_spacing = available_height // len(tracks) if len(tracks) > 0 else self.track_height
        actual_track_height = min(self.track_height, track_spacing - 10)
        
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
                self.draw_waveform(draw, track.peaks_data, waveform_x, waveform_y, 
                                 waveform_width, waveform_height,
                                 duration=duration, playback_time=playback_time)
            else:
                # Placeholder waveform
                draw.rectangle([waveform_x, waveform_y + waveform_height//2 - 2, 
                              waveform_x + waveform_width, waveform_y + waveform_height//2 + 2], 
                             fill=(80, 80, 80))
            
            # Draw user/track details at bottom left of track section
            details_y = track_y_end - PROFILE_PIC_SIZE - 5  # Bottom of section minus profile pic size
            
            # Draw profile picture
            if track.profile_pic_data:
                self.draw_profile_pic(draw, image, track.profile_pic_data, 
                                    PADDING, details_y, PROFILE_PIC_SIZE)
            else:
                # Placeholder circle
                draw.ellipse([PADDING, details_y, PADDING + PROFILE_PIC_SIZE, details_y + PROFILE_PIC_SIZE], 
                           fill=(100, 100, 100))
            
            # Draw username and track title
            text_x = PADDING + PROFILE_PIC_SIZE + 15
            draw.text((text_x, details_y), track.username, fill=TEXT_COLOR, font=self.font_medium)
            draw.text((text_x, details_y + 25), track.title, fill=SECONDARY_TEXT_COLOR, font=self.font_small)
        
        # Save if path provided
        if save_path:
            image.save(save_path)
            if verbose:
                print(f"💾 Frame saved to {save_path}")
        
        return image

