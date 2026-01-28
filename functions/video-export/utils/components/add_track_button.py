"""Add track button component for video frames"""
import os
from typing import Optional
from PIL import Image

from utils.config import PADDING


class AddTrackButtonComponent:
    """Component for drawing the 'add track' button at the bottom of video frames"""
    
    def __init__(self, width: int, height: int, button_path: Optional[str] = None):
        """
        Initialize add track button component
        
        Args:
            width: Frame width in pixels
            height: Frame height in pixels
            button_path: Optional custom path to button image
        """
        self.width = width
        self.height = height
        
        # Load button image
        if button_path is None:
            # Try default path
            base_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
            button_path = os.path.join(base_dir, 'assets', 'add_your_ideas.png')
        
        if os.path.exists(button_path):
            try:
                self.button_image = Image.open(button_path).convert('RGBA')
                # Read actual dimensions from image
                self.button_width, self.button_height = self.button_image.size
            except Exception as e:
                print(f"⚠️  Warning: Could not load add track button image: {e}")
                self.button_image = None
                self.button_width = 0
                self.button_height = 0
        else:
            print(f"⚠️  Warning: Add track button image not found at {button_path}")
            self.button_image = None
            self.button_width = 0
            self.button_height = 0
    
    def get_reserved_height(self) -> int:
        """Get the height reserved for the button (button height + padding)
        
        Returns:
            Reserved height in pixels
        """
        if self.button_image is None:
            return 0
        return self.button_height + PADDING
    
    def draw(self, image: Image):
        """Draw add track button at the bottom center of the image
        
        Args:
            image: PIL Image to draw button on
        """
        if self.button_image is None:
            return
        
        # Position at bottom center with padding from bottom
        x = (self.width - self.button_width) // 2
        y = self.height - self.button_height - PADDING
        
        # Paste button with alpha channel support
        image.paste(self.button_image, (x, y), self.button_image)

