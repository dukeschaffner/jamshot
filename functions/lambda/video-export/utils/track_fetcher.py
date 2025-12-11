"""
Track data fetcher - retrieves track information, stems, and user data from database
"""
from .db import get_db_connection
import json

class TrackFetcher:
    """Fetches track data including stems and user information"""
    
    def __init__(self, track_id):
        self.track_id = track_id
    
    def fetch_track_data(self):
        """
        Fetch complete track data including:
        - Track name, combined_audio_url
        - All stems with their audio URLs
        - User info (name, username, profile_pic_url) for each stem
        
        Returns:
            dict with track info and stems list
        """
        with get_db_connection() as conn:
            cursor = conn.cursor()
            
            # Get main track info
            cursor.execute("""
                SELECT 
                    t.id,
                    t.title,
                    t.combined_audio_url,
                    t.audio_url,
                    t.mix_gains,
                    t.user_id,
                    u.username,
                    u.name,
                    u.profile_pic_url
                FROM tracks t
                JOIN users u ON t.user_id = u.id
                WHERE t.id = %s
            """, (self.track_id,))
            
            track_row = cursor.fetchone()
            if not track_row:
                raise Exception(f"Track {self.track_id} not found")
            
            track_data = {
                'id': track_row[0],
                'title': track_row[1],
                'combined_audio_url': track_row[2],
                'audio_url': track_row[3],
                'mix_gains': track_row[4],
                'user_id': track_row[5],
                'username': track_row[6],
                'name': track_row[7],
                'profile_pic_url': track_row[8]
            }
            
            # Parse mix_gains to get stems
            mix_gains = track_data['mix_gains']
            if not mix_gains or 'stems' not in mix_gains:
                # If no stems, treat the track itself as a single stem
                stems = [{
                    'track_id': track_data['id'],
                    'audio_url': track_data['audio_url'],
                    'title': track_data['title'],
                    'user_id': track_data['user_id'],
                    'username': track_data['username'],
                    'name': track_data['name'],
                    'profile_pic_url': track_data['profile_pic_url'],
                    'order': 0,
                    'gain': 1.0
                }]
            else:
                # Get stem track IDs
                stem_track_ids = [stem['track_id'] for stem in mix_gains['stems']]
                
                # Fetch user info for all stems
                cursor.execute("""
                    SELECT 
                        t.id,
                        t.title,
                        t.audio_url,
                        t.user_id,
                        u.username,
                        u.name,
                        u.profile_pic_url
                    FROM tracks t
                    JOIN users u ON t.user_id = u.id
                    WHERE t.id = ANY(%s)
                """, (stem_track_ids,))
                
                stem_data_map = {}
                for row in cursor.fetchall():
                    stem_data_map[row[0]] = {
                        'track_id': row[0],
                        'title': row[1],
                        'audio_url': row[2],
                        'user_id': row[3],
                        'username': row[4],
                        'name': row[5],
                        'profile_pic_url': row[6]
                    }
                
                # Build stems list with order, gain, and regions from mix_gains
                stems = []
                for stem_info in mix_gains['stems']:
                    stem_id = stem_info['track_id']
                    if stem_id in stem_data_map:
                        stem_data = stem_data_map[stem_id]
                        stems.append({
                            **stem_data,
                            'order': stem_info.get('order', 0),
                            'gain': stem_info.get('gain', 1.0),
                            'regions': stem_info.get('regions', [])
                        })
                
                # Sort by order
                stems.sort(key=lambda x: x['order'])
            
            return {
                'track': track_data,
                'stems': stems
            }

