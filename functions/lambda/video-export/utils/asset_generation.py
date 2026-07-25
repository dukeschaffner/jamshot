"""Waveform-only frame and silent video generation for marketing assets."""
import os
import re
import tempfile
from typing import List, Optional

from PIL import Image, ImageDraw
from moviepy import ImageSequenceClip

from utils.config import (
    BACKGROUND_COLOR,
    PADDING,
    VIDEO_FPS,
    VIDEO_CODEC,
    VIDEO_BITRATE,
    get_temp_dir,
)
from utils.models import TrackData
from utils.components.waveform import WaveformComponent


ASSET_FRAME_WIDTH = 1080
ASSET_FRAME_HEIGHT = 200
AVATAR_EXPORT_SIZE = 256


class AssetFrameGenerator:
    """Generates frames containing a single animated waveform (no overlays)."""

    def __init__(
        self,
        width: int = ASSET_FRAME_WIDTH,
        height: int = ASSET_FRAME_HEIGHT,
    ):
        self.width = width
        self.height = height
        self.waveform_component = WaveformComponent()

    def generate_waveform_frame(
        self,
        track: TrackData,
        duration: float,
        playback_time: Optional[float] = None,
        muted: bool = False,
        save_path: Optional[str] = None,
    ) -> Image.Image:
        image = Image.new("RGB", (self.width, self.height), BACKGROUND_COLOR)
        draw = ImageDraw.Draw(image)

        waveform_x = PADDING
        waveform_y = PADDING
        waveform_width = self.width - 2 * PADDING
        waveform_height = self.height - 2 * PADDING

        if track.peaks_data:
            self.waveform_component.draw(
                draw,
                track.peaks_data,
                waveform_x,
                waveform_y,
                waveform_width,
                waveform_height,
                duration=duration,
                playback_time=playback_time,
                muted=muted,
            )
        else:
            self.waveform_component.draw_placeholder(
                draw, waveform_x, waveform_y, waveform_width, waveform_height
            )

        if save_path:
            image.save(save_path)

        return image


def generate_waveform_video(
    track: TrackData,
    duration: float,
    output_path: str,
    muted: bool = False,
    fps: int = VIDEO_FPS,
) -> str:
    """Render a silent MP4 of one waveform animating from start to finish."""
    frame_generator = AssetFrameGenerator()
    temp_base = get_temp_dir()
    frame_dir = tempfile.mkdtemp(dir=temp_base, prefix="asset_frames_")
    frame_paths: List[str] = []

    try:
        total_frames = max(1, int(duration * fps))
        frame_interval = duration / total_frames if total_frames > 0 else 0.1

        for frame_num in range(total_frames):
            playback_time = frame_num * frame_interval
            frame_path = os.path.join(frame_dir, f"frame_{frame_num:06d}.png")
            frame_generator.generate_waveform_frame(
                track,
                duration=duration,
                playback_time=playback_time,
                muted=muted,
                save_path=frame_path,
            )
            frame_paths.append(frame_path)

        clip = ImageSequenceClip(frame_paths, fps=fps)
        clip.write_videofile(
            output_path,
            codec=VIDEO_CODEC,
            bitrate=VIDEO_BITRATE,
            audio=False,
            logger=None,
        )
        clip.close()

        return output_path
    finally:
        for frame_path in frame_paths:
            try:
                os.remove(frame_path)
            except OSError:
                pass
        try:
            os.rmdir(frame_dir)
        except OSError:
            pass


def sanitize_filename(name: str) -> str:
    """Make a string safe for use as a filename."""
    sanitized = re.sub(r"[^\w\-.]", "_", name.strip())
    return sanitized or "unknown"
