"""Data models for video export functionality"""
from dataclasses import dataclass
from typing import Dict, List, Optional


@dataclass
class TrackData:
    """Data structure for track information"""
    id: int
    title: str
    duration: float
    user_id: int
    username: str
    profile_pic_url: Optional[str]
    waveform_url: Optional[str]  # stem peaks URL
    combined_waveform_url: Optional[str]  # combined peaks URL (for leaf track)
    combined_audio_url: Optional[str]  # combined audio URL (for leaf track)
    mix_gains: Optional[Dict] = None  # mix gains data (for leaf track)
    peaks_data: Optional[List] = None  # Downloaded peaks data
    profile_pic_data: Optional[bytes] = None  # Downloaded profile pic data
    audio_file_path: Optional[str] = None  # Local path to downloaded audio file
    is_leaf_track: bool = False  # Whether this is the leaf track (the track given as input)

