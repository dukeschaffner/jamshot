"""Watermark component for video frames"""
import os
from typing import Optional, Tuple
from PIL import Image

from utils.config import PADDING


class WatermarkComponent:
    """Component for drawing TikTok-style watermarks on video frames"""
    
    def __init__(self, width: int, height: int, watermark_path: Optional[str] = None):
        """
        Initialize watermark component
        
        Args:
            width: Frame width in pixels
            height: Frame height in pixels
            watermark_path: Optional custom path to watermark image
        """
        self.width = width
        self.height = height
        
        # Watermark position change interval (in seconds) - TikTok style
        self.watermark_interval = 2.5  # Change position every 2.5 seconds
        
        # Load watermark image
        if watermark_path is None:
            # Try default paths
            base_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
            watermark_path = os.path.join(base_dir, 'assets', '@watermark.png')
            if not os.path.exists(watermark_path):
                watermark_path = os.path.join(base_dir, 'assets', 'watermark.png')
        
        if os.path.exists(watermark_path):
            try:
                self.watermark_image = Image.open(watermark_path).convert('RGBA')
                # Read actual dimensions from image
                self.watermark_width, self.watermark_height = self.watermark_image.size
            except Exception as e:
                print(f"⚠️  Warning: Could not load watermark image: {e}")
                self.watermark_image = None
                self.watermark_width = 120
                self.watermark_height = 40
        else:
            print(f"⚠️  Warning: Watermark image not found at {watermark_path}")
            self.watermark_image = None
            self.watermark_width = 120
            self.watermark_height = 40
    
    def get_watermark_position(self, playback_time: Optional[float]) -> Optional[Tuple[int, int]]:
        """Get watermark position based on playback time (TikTok-style periodic positioning)
        
        Args:
            playback_time: Current playback time in seconds
            
        Returns:
            Tuple of (x, y) position or None if watermark shouldn't be shown
        """
        if self.watermark_image is None or playback_time is None:
            return None
        
        # Calculate which position segment we're in (changes every watermark_interval seconds)
        position_index = int(playback_time / self.watermark_interval)
        
        # Define possible positions (corners and edge centers)
        # Positions are: top-left, top-right, bottom-left, bottom-right, top-center, bottom-center
        positions = [
            (PADDING, PADDING),  # Top-left
            (self.width - self.watermark_width - PADDING, PADDING),  # Top-right
            (PADDING, self.height - self.watermark_height - PADDING),  # Bottom-left
            (self.width - self.watermark_width - PADDING, self.height - self.watermark_height - PADDING),  # Bottom-right
            ((self.width - self.watermark_width) // 2, PADDING),  # Top-center
            ((self.width - self.watermark_width) // 2, self.height - self.watermark_height - PADDING),  # Bottom-center
        ]
        
        # Cycle through positions based on position_index
        position = positions[position_index % len(positions)]
        return position
    
    def draw(self, image: Image, playback_time: Optional[float]):
        """Draw TikTok-style watermark on the image
        
        Args:
            image: PIL Image to draw watermark on
            playback_time: Current playback time in seconds
        """
        if self.watermark_image is None:
            return
        
        position = self.get_watermark_position(playback_time)
        if position is None:
            return
        
        x, y = position
        
        # Paste watermark with alpha channel support
        # Make watermark semi-transparent (80% opacity) for TikTok-style effect
        watermark_with_alpha = self.watermark_image.copy()
        alpha = watermark_with_alpha.split()[3]
        alpha = alpha.point(lambda p: int(p * 0.8))  # 80% opacity
        watermark_with_alpha.putalpha(alpha)
        
        image.paste(watermark_with_alpha, (x, y), watermark_with_alpha)

