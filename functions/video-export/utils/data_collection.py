"""Data collection module for fetching track tree data, peaks, and profile pictures"""
import os
import json
import requests
import tempfile
from typing import List, Optional, Union
from psycopg2.extras import RealDictCursor

from utils.config import get_db_connection, db_pool, R2_PUBLIC_URL
from utils.models import TrackData


class DataCollectionModule:
    """Module for collecting track tree data, peaks, and profile pictures"""
    
    def __init__(self):
        self.session = requests.Session()
    
    def fetch_track_tree(self, track_id: Union[int, str]) -> List[TrackData]:
        """Fetch track tree directly from database"""
        conn = None
        try:
            conn = get_db_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Base query for track selection (similar to getBaseTrackSelectQuery)
            base_query = """
                t.id, t.user_id, t.title, t.duration, t.waveform_url, t.combined_waveform_url,
                t.combined_audio_url, t.mix_gains, t.parent_track_id,
                u.username, u.profile_pic_url
            """
            
            # First, get the current track
            cursor.execute(f"""
                SELECT 
                    {base_query}
                FROM tracks t
                LEFT JOIN users u ON t.user_id = u.id
                WHERE t.id = %s AND t.processing_status = 'completed'
            """, (track_id,))
            
            current_track_row = cursor.fetchone()
            if not current_track_row:
                raise ValueError(f"Track {track_id} not found")
            
            current_track = dict(current_track_row)
            current_track['is_leaf_track'] = True
            
            # Get all ancestors (tracks up the tree to the root)
            ancestors = []
            parent_id = current_track.get('parent_track_id')
            
            while parent_id:
                cursor.execute(f"""
                    SELECT
                        {base_query}
                    FROM tracks t
                    LEFT JOIN users u ON t.user_id = u.id
                    WHERE t.id = %s AND t.processing_status = 'completed'
                """, (parent_id,))
                
                parent_row = cursor.fetchone()
                if not parent_row:
                    break
                
                parent = dict(parent_row)
                ancestors.insert(0, parent)  # Add to the beginning
                parent_id = parent.get('parent_track_id')
            
            # Build track tree: ancestors + current track
            all_tracks_data = ancestors + [current_track]
            
            # Convert to TrackData objects
            tracks = []
            for track_row in all_tracks_data:
                # Build waveform URL (use R2_PUBLIC_URL if it's a relative path)
                waveform_url = track_row.get('waveform_url')
                if waveform_url and waveform_url.startswith('waveforms/'):
                    waveform_url = f"{R2_PUBLIC_URL}/{waveform_url}"
                
                combined_waveform_url = track_row.get('combined_waveform_url')
                if combined_waveform_url and combined_waveform_url.startswith('waveforms/'):
                    combined_waveform_url = f"{R2_PUBLIC_URL}/{combined_waveform_url}"
                
                # Build profile pic URL
                profile_pic_url = track_row.get('profile_pic_url')
                if profile_pic_url and not profile_pic_url.startswith('http'):
                    profile_pic_url = f"{R2_PUBLIC_URL}/{profile_pic_url}" if profile_pic_url else None
                
                # Build combined audio URL (use R2_PUBLIC_URL if it's a relative path)
                combined_audio_url = track_row.get('combined_audio_url')
                if combined_audio_url:
                    if combined_audio_url.startswith('tracks/') or (not combined_audio_url.startswith('http')):
                        combined_audio_url = f"{R2_PUBLIC_URL}/{combined_audio_url}"
                
                # Parse mix_gains if it's a string
                mix_gains = track_row.get('mix_gains')
                if isinstance(mix_gains, str):
                    try:
                        mix_gains = json.loads(mix_gains)
                    except:
                        mix_gains = None
                
                track = TrackData(
                    id=track_row['id'],
                    title=track_row['title'],
                    duration=float(track_row['duration']) if track_row['duration'] else 0.0,
                    user_id=track_row['user_id'],
                    username=track_row['username'] or 'Unknown',
                    profile_pic_url=profile_pic_url,
                    waveform_url=waveform_url,
                    combined_waveform_url=combined_waveform_url,
                    combined_audio_url=combined_audio_url,
                    mix_gains=mix_gains,
                    is_leaf_track=track_row.get('is_leaf_track', False)
                )
                tracks.append(track)
            
            cursor.close()
            print(f"✅ Fetched {len(tracks)} tracks from tree")
            return tracks
            
        except Exception as e:
            print(f"❌ Error fetching track tree: {e}")
            raise
        finally:
            if conn and db_pool:
                db_pool.putconn(conn)
    
    def download_peaks_data(self, track: TrackData) -> None:
        """Download peaks JSON data from R2 and add to track object
        
        Raises:
            ValueError: If peaks URL is missing or invalid
            requests.RequestException: If download fails
        """
        # Use stem peaks for all tracks, combined peaks only for leaf track
        peaks_url = track.waveform_url
        if not peaks_url:
            raise ValueError(f"No peaks URL for track {track.id} ({track.title})")
        
        response = self.session.get(peaks_url)
        response.raise_for_status()
        
        peaks_json = response.json()
        # Extract resolution 256 peaks (as used in the frontend)
        if 'peaks' in peaks_json and '256' in peaks_json['peaks']:
            track.peaks_data = peaks_json['peaks']['256']
            print(f"✅ Downloaded peaks for track {track.id} ({len(track.peaks_data)} points)")
        else:
            raise ValueError(f"Invalid peaks format for track {track.id}: missing 'peaks.256' key")
    
    def download_profile_pic(self, track: TrackData) -> None:
        """Download profile picture from R2 and add to track object
        
        Raises:
            ValueError: If profile pic URL is missing
            requests.RequestException: If download fails
        """
        if not track.profile_pic_url:
            raise ValueError(f"No profile pic URL for user {track.username} (track {track.id})")
        
        response = self.session.get(track.profile_pic_url)
        response.raise_for_status()
        
        track.profile_pic_data = response.content
        print(f"✅ Downloaded profile pic for {track.username} ({len(track.profile_pic_data)} bytes)")
    
    def download_audio_file(self, track: TrackData, output_dir: Optional[str] = None) -> None:
        """Download audio file from combined_audio_url and save to local file
        
        Raises:
            ValueError: If audio URL is missing or invalid
            requests.RequestException: If download fails
            IOError: If file cannot be saved
        """
        if not track.combined_audio_url:
            raise ValueError(f"No audio URL for track {track.id} ({track.title})")
        
        # Create temporary directory if not provided
        if output_dir is None:
            output_dir = tempfile.mkdtemp(prefix="audio_download_")
        
        # Determine file extension from URL or default to .mp3
        audio_url = track.combined_audio_url
        file_ext = '.mp3'  # default
        if '.' in audio_url.split('/')[-1]:
            file_ext = '.' + audio_url.split('.')[-1].split('?')[0]
        
        # Download audio file
        response = self.session.get(audio_url, stream=True)
        response.raise_for_status()
        
        # Save to temporary file
        audio_file_path = os.path.join(output_dir, f"track_{track.id}_audio{file_ext}")
        try:
            with open(audio_file_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
        except IOError as e:
            raise IOError(f"Failed to save audio file for track {track.id}: {e}")
        
        track.audio_file_path = audio_file_path
        file_size = os.path.getsize(audio_file_path)
        print(f"✅ Downloaded audio for track {track.id} ({file_size / 1024 / 1024:.2f} MB)")
    
    def collect_all_data(self, track_id: Union[int, str], download_audio: bool = True) -> List[TrackData]:
        """Main method to collect all required data
        
        Raises:
            ValueError: If track not found or required data is missing
            requests.RequestException: If any download fails
        """
        print(f"🚀 Starting data collection for track {track_id}")
        
        # Fetch track tree
        tracks = self.fetch_track_tree(track_id)
        
        if not tracks:
            raise ValueError(f"No tracks found for track {track_id}")
        
        # Download peaks and profile pics for all tracks
        # These are blocking - any failure will raise an exception
        for track in tracks:
            self.download_peaks_data(track)
            self.download_profile_pic(track)
        
        # Download audio file for the leaf track (last track in the list)
        # This is also blocking - failure will raise an exception
        if download_audio:
            leaf_track = tracks[-1]  # The current track is the leaf
            self.download_audio_file(leaf_track)
        
        print(f"✅ Data collection complete for {len(tracks)} tracks")
        return tracks

