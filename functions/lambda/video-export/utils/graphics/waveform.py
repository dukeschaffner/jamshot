"""
Waveform-based graphics generator for video export
"""
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import os
from .base import GraphicsGenerator

class WaveformGraphicsGenerator(GraphicsGenerator):
    """
    Generates waveform visualization with user profile pics and names
    """
    
    def __init__(self, width=1080, height=1920):
        super().__init__(width, height)
        self.fps = 30
        
        # Try to load fonts (fallback to default if not available)
        try:
            self.title_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 48)
            self.name_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 36)
            self.small_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 24)
        except:
            # Fallback to default font
            self.title_font = ImageFont.load_default()
            self.name_font = ImageFont.load_default()
            self.small_font = ImageFont.load_default()
    
    def get_fps(self):
        return self.fps
    
    def generate_frame(self, frame_number, stem_audio_data_list, track_info, stem_info_list, timestamp):
        """
        Generate a waveform visualization frame
        
        Args:
            frame_number: Current frame number
            stem_audio_data_list: List of audio data arrays, one per stem
            track_info: Track information dict
            stem_info_list: List of stem information dicts
            timestamp: Current timestamp in seconds
        
        Returns:
            PIL Image
        """
        # Create base image
        img = Image.new('RGB', (self.width, self.height), color='#000000')
        draw = ImageDraw.Draw(img)
        
        # Store img reference for profile pic loading
        self._current_img = img
        
        # Calculate number of stems to display
        num_stems = len(stem_info_list)
        
        # Divide screen into sections for each stem
        section_height = self.height // num_stems if num_stems > 0 else self.height
        
        # Draw each stem's waveform
        for i, stem_info in enumerate(stem_info_list):
            y_start = i * section_height
            y_end = (i + 1) * section_height
            
            # Draw stem section background
            draw.rectangle(
                [(0, y_start), (self.width, y_end)],
                fill='#1a1a1a' if i % 2 == 0 else '#0f0f0f'
            )
            
            # Get audio data for this stem
            stem_audio = stem_audio_data_list[i] if i < len(stem_audio_data_list) else np.array([])
            
            # Draw waveform for this stem
            self._draw_waveform(draw, stem_audio, y_start, y_end, stem_info)
            
            # Draw user info (profile pic, name) for this stem
            self._draw_user_info(draw, stem_info, y_start, y_end)
        
        # Draw track title at top
        self._draw_track_title(draw, track_info)
        
        # Draw watermark at bottom
        self._draw_watermark(draw)
        
        return img
    
    def _draw_waveform(self, draw, audio_data, y_start, y_end, stem_info):
        """Draw waveform visualization for a stem"""
        section_height = y_end - y_start
        section_width = self.width
        
        # Calculate waveform area (leave space for user info on left)
        waveform_x_start = 200  # Space for profile pic/name
        waveform_width = section_width - waveform_x_start - 40  # Padding on right
        waveform_y_center = y_start + section_height // 2
        
        # Use actual audio data if available
        num_points = 200
        max_amplitude = 0
        
        if len(audio_data) > 0:
            # Calculate RMS or peak amplitude for each segment
            samples_per_point = max(1, len(audio_data) // num_points)
            amplitudes = []
            
            for i in range(num_points):
                start_idx = i * samples_per_point
                end_idx = min(start_idx + samples_per_point, len(audio_data))
                
                if end_idx > start_idx:
                    segment = audio_data[start_idx:end_idx]
                    # Use RMS for smoother visualization
                    rms = np.sqrt(np.mean(segment**2))
                    amplitudes.append(rms)
                    max_amplitude = max(max_amplitude, rms)
                else:
                    amplitudes.append(0)
        else:
            # Fallback: use sine wave placeholder
            amplitudes = [np.sin(i * 0.1) * 0.5 + 0.5 for i in range(num_points)]
            max_amplitude = 1.0
        
        # Normalize amplitudes
        if max_amplitude > 0:
            amplitudes = [a / max_amplitude for a in amplitudes]
        
        # Draw waveform
        for i, amplitude in enumerate(amplitudes):
            x = waveform_x_start + (i / num_points) * waveform_width
            
            # Draw waveform line (centered)
            line_height = amplitude * (section_height - 100)  # Leave padding
            y_top = waveform_y_center - line_height // 2
            y_bottom = waveform_y_center + line_height // 2
            
            # Draw center line
            draw.line(
                [(x, waveform_y_center), (x, y_top)],
                fill='#00ff88',
                width=2
            )
            draw.line(
                [(x, waveform_y_center), (x, y_bottom)],
                fill='#00ff88',
                width=2
            )
    
    def _draw_user_info(self, draw, stem_info, y_start, y_end):
        """Draw user profile pic and name for a stem"""
        section_height = y_end - y_start
        y_center = y_start + section_height // 2
        
        # Profile pic size and position
        pic_size = 80
        pic_x = 40
        pic_y = y_center - pic_size // 2
        
        # Try to load profile pic if available
        profile_pic_url = stem_info.get('profile_pic_url')
        profile_img = None
        
        if profile_pic_url:
            try:
                import requests
                from io import BytesIO
                response = requests.get(profile_pic_url, timeout=5)
                if response.status_code == 200:
                    profile_img = Image.open(BytesIO(response.content))
                    # Resize and make circular
                    profile_img = profile_img.resize((pic_size, pic_size), Image.Resampling.LANCZOS)
                    # Create circular mask
                    mask = Image.new('L', (pic_size, pic_size), 0)
                    mask_draw = ImageDraw.Draw(mask)
                    mask_draw.ellipse([(0, 0), (pic_size, pic_size)], fill=255)
                    profile_img.putalpha(mask)
            except Exception as e:
                print(f"Warning: Could not load profile pic: {e}")
        
        # Draw profile pic
        if profile_img:
            # Paste profile image
            self._current_img.paste(profile_img, (pic_x, pic_y), profile_img)
            # Draw border
            draw.ellipse(
                [(pic_x, pic_y), (pic_x + pic_size, pic_y + pic_size)],
                outline='#00ff88',
                width=2
            )
        else:
            # Draw placeholder circle
            draw.ellipse(
                [(pic_x, pic_y), (pic_x + pic_size, pic_y + pic_size)],
                fill='#333333',
                outline='#00ff88',
                width=2
            )
        
        # Draw username
        username = stem_info.get('username', 'Unknown')
        name = stem_info.get('name', username)
        
        # Draw name text
        text_x = pic_x + pic_size + 20
        text_y = y_center - 20
        
        draw.text(
            (text_x, text_y),
            name,
            fill='#ffffff',
            font=self.name_font
        )
        
        # Draw username (smaller, gray)
        draw.text(
            (text_x, text_y + 30),
            f"@{username}",
            fill='#888888',
            font=self.small_font
        )
    
    def _draw_track_title(self, draw, track_info):
        """Draw track title at the top"""
        title = track_info.get('title', 'Untitled')
        
        # Draw title background
        draw.rectangle(
            [(0, 0), (self.width, 120)],
            fill='#000000'
        )
        
        # Draw title text
        draw.text(
            (40, 40),
            title,
            fill='#ffffff',
            font=self.title_font
        )
    
    def _draw_watermark(self, draw):
        """Draw Sterio watermark at bottom"""
        watermark_text = "Sterio"
        
        # Get text dimensions
        bbox = draw.textbbox((0, 0), watermark_text, font=self.small_font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        
        # Position at bottom right
        x = self.width - text_width - 40
        y = self.height - text_height - 40
        
        draw.text(
            (x, y),
            watermark_text,
            fill='#666666',
            font=self.small_font
        )

