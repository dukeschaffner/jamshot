"""Track details component for video frames"""
import io
from PIL import Image, ImageDraw, ImageFont

from utils.config import ACCENT_COLOR, TEXT_COLOR, SECONDARY_TEXT_COLOR, PADDING
from utils.models import TrackData


class TrackDetailsComponent:
    """Component for drawing track details (profile pic, username, track title)"""
    
    def __init__(self, profile_pic_size: int):
        """
        Initialize track details component
        
        Args:
            profile_pic_size: Size of profile picture in pixels
        """
        self.profile_pic_size = profile_pic_size
        
        # Try to load fonts, fall back to default if not available
        # Scale font sizes proportionally with profile pic size
        base_font_size_medium = int(self.profile_pic_size * 0.19)  # ~19% of profile pic
        base_font_size_small = int(self.profile_pic_size * 0.15)   # ~15% of profile pic
        
        try:
            self.font_medium = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", base_font_size_medium)
            self.font_small = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", base_font_size_small)
        except:
            self.font_medium = ImageFont.load_default()
            self.font_small = ImageFont.load_default()
    
    def draw_profile_pic(self, draw: ImageDraw, image: Image, profile_pic_data: bytes, x: int, y: int, size: int):
        """Draw circular profile picture with rustic pink outline
        
        Args:
            draw: ImageDraw object
            image: PIL Image to draw on
            profile_pic_data: Bytes of profile picture image
            x, y: Position of profile picture
            size: Size of profile picture
        """
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
            
            # Draw rustic pink circle outline
            outline_width = max(2, int(size * 0.04))  # 4% of size, minimum 2px
            draw.ellipse([x, y, x + size, y + size], outline=ACCENT_COLOR, width=outline_width)
            
        except Exception as e:
            print(f"⚠️  Error drawing profile pic: {e}")
            # Draw placeholder circle with outline
            draw.ellipse([x, y, x + size, y + size], fill=(100, 100, 100))
            outline_width = max(2, int(size * 0.04))
            draw.ellipse([x, y, x + size, y + size], outline=ACCENT_COLOR, width=outline_width)
    
    def draw_track_details(self, draw: ImageDraw, image: Image, track: TrackData, x: int, y: int):
        """Draw track details (profile pic, username, track title) at specified position
        
        Args:
            draw: ImageDraw object
            image: PIL Image to draw on
            track: TrackData object with track information
            x, y: Position to draw track details (bottom-left corner of profile pic)
        """
        # Draw profile picture
        if track.profile_pic_data:
            self.draw_profile_pic(draw, image, track.profile_pic_data, 
                                x, y, self.profile_pic_size)
        else:
            # Placeholder circle with outline
            draw.ellipse([x, y, x + self.profile_pic_size, y + self.profile_pic_size], 
                       fill=(100, 100, 100))
            outline_width = max(2, int(self.profile_pic_size * 0.04))
            draw.ellipse([x, y, x + self.profile_pic_size, y + self.profile_pic_size], 
                       outline=ACCENT_COLOR, width=outline_width)
        
        # Draw username and track title
        # Position text to the right of profile pic with spacing proportional to profile pic size
        text_x = x + self.profile_pic_size + int(self.profile_pic_size * 0.3)  # 30% spacing
        # Vertical spacing between username and title proportional to profile pic size
        text_spacing = int(self.profile_pic_size * 0.26)  # ~26% spacing
        draw.text((text_x, y), track.username, fill=TEXT_COLOR, font=self.font_medium)
        draw.text((text_x, y + text_spacing), track.title, fill=SECONDARY_TEXT_COLOR, font=self.font_small)

