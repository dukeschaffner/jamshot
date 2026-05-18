#!/usr/bin/env python3
"""
Generate marketing assets for a collaboration track.

Outputs a folder with:
  - One waveform progress video per track (active + muted variants)
  - One PNG avatar per unique collaborator
  - Individual stem audio file per track (audio_track_<id>.<ext>)
  - Combined mix audio for the leaf track (audio_combined_track_<id>.<ext>)
  - tracks.txt listing track title and artist (username) for each stem

Usage:
  1. Set TRACK_ID below
  2. Ensure .env is configured (same as video export)
  3. Run from this directory: python generate_assets.py

  Use prod values without swapping .env:
    DOTENV_PATH=.env.prod python generate_assets.py
"""
import io
import os
import sys
from typing import Dict, List, Union

from PIL import Image, ImageDraw

from utils.config import ACCENT_COLOR, get_temp_dir
from utils.data_collection import DataCollectionModule
from utils.peaks_processing import PeaksProcessingModule
from utils.asset_generation import (
    generate_waveform_video,
    sanitize_filename,
    AVATAR_EXPORT_SIZE,
)
from utils.models import TrackData



# --- Configure here ---
TRACK_ID: Union[int, str] = 61  # Set the leaf track ID to export assets for
# ----------------------

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_OUTPUT_DIR = os.path.join(SCRIPT_DIR, "generated_assets")


def collect_track_data(
    collector: DataCollectionModule,
    track_id: Union[int, str],
) -> List[TrackData]:
    tracks = collector.fetch_track_tree(track_id)

    if not tracks:
        raise ValueError(f"No tracks found for track {track_id}")

    for track in tracks:
        collector.download_peaks_data(track)
        try:
            collector.download_profile_pic(track)
        except Exception as exc:
            print(f"⚠️  Skipping profile pic for {track.username}: {exc}")

    return tracks


def export_avatar_png(track: TrackData, output_path: str) -> bool:
    """Save a circular avatar PNG (with accent ring) for a user."""
    if not track.profile_pic_data:
        return False

    size = AVATAR_EXPORT_SIZE
    try:
        profile_img = Image.open(io.BytesIO(track.profile_pic_data))
        profile_img = profile_img.convert("RGB")
        profile_img = profile_img.resize((size, size), Image.Resampling.LANCZOS)

        image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        mask = Image.new("L", (size, size), 0)
        mask_draw = ImageDraw.Draw(mask)
        mask_draw.ellipse([0, 0, size, size], fill=255)

        profile_img.putalpha(mask)
        image.paste(profile_img, (0, 0), profile_img)

        draw = ImageDraw.Draw(image)
        outline_width = max(2, int(size * 0.04))
        draw.ellipse(
            [0, 0, size - 1, size - 1],
            outline=ACCENT_COLOR,
            width=outline_width,
        )

        image.save(output_path, "PNG")
        return True
    except Exception as exc:
        print(f"⚠️  Failed to export avatar for {track.username}: {exc}")
        return False


def write_tracks_metadata(tracks: List[TrackData], output_path: str) -> None:
    lines: List[str] = []
    for track in tracks:
        lines.append(f"Track: {track.title}")
        lines.append(f"Artist: {track.username}")
        lines.append("")

    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines).rstrip() + "\n")


def generate_assets(track_id: Union[int, str], output_dir: str) -> None:
    if not track_id:
        raise ValueError("Set TRACK_ID at the top of generate_assets.py before running")

    os.makedirs(output_dir, exist_ok=True)

    print(f"🎬 Generating assets for track {track_id}")
    print(f"📁 Output: {output_dir}")

    collector = DataCollectionModule()
    tracks = collect_track_data(collector, track_id)
    processed_tracks = PeaksProcessingModule().process_tracks(tracks)

    print("🎵 Downloading audio files...")
    audio_paths = collector.export_track_audio_files(processed_tracks, output_dir)

    leaf_track = processed_tracks[-1]
    duration = leaf_track.duration
    if duration <= 0:
        raise ValueError(f"Invalid duration ({duration}) for track {track_id}")

    print(f"⏱️  Duration: {duration:.2f}s | {len(processed_tracks)} waveform(s)")

    for track in processed_tracks:
        base_name = f"waveform_track_{track.id}"
        active_path = os.path.join(output_dir, f"{base_name}.mp4")
        muted_path = os.path.join(output_dir, f"{base_name}_muted.mp4")

        print(f"🎞️  Rendering active waveform for track {track.id} ({track.title})")
        generate_waveform_video(track, duration, active_path, muted=False)

        print(f"🎞️  Rendering muted waveform for track {track.id}")
        generate_waveform_video(track, duration, muted_path, muted=True)

    exported_users: Dict[int, str] = {}
    for track in processed_tracks:
        if track.user_id in exported_users:
            continue

        avatar_name = f"avatar_{sanitize_filename(track.username)}.png"
        avatar_path = os.path.join(output_dir, avatar_name)

        if export_avatar_png(track, avatar_path):
            exported_users[track.user_id] = avatar_path
            print(f"🖼️  Saved avatar: {avatar_name}")

    metadata_path = os.path.join(output_dir, "tracks.txt")
    write_tracks_metadata(processed_tracks, metadata_path)
    print(f"📝 Wrote {metadata_path}")

    video_count = len(processed_tracks) * 2
    print(
        f"✅ Done — {video_count} videos, {len(audio_paths)} audio files, "
        f"{len(exported_users)} avatars, tracks.txt in {output_dir}"
    )


def main() -> None:
    track_id = TRACK_ID
    if len(sys.argv) > 1:
        track_id = sys.argv[1]

    output_dir = os.path.join(
        DEFAULT_OUTPUT_DIR,
        f"track_{track_id}",
    )
    if len(sys.argv) > 2:
        output_dir = sys.argv[2]

    try:
        generate_assets(track_id, output_dir)
    except Exception as exc:
        print(f"❌ Asset generation failed: {exc}")
        import traceback

        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
