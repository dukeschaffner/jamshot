"""Peaks processing module for applying edits, gains, and other transformations"""
from typing import List, Dict

from utils.models import TrackData


class PeaksProcessingModule:
    """Module for processing peaks data based on mix_gains regions and edits"""
    
    PEAKS_RESOLUTION = 256  # Standard resolution for peaks arrays
    
    def process_tracks(self, tracks: List[TrackData]) -> List[TrackData]:
        """Process tracks by applying mix_gains transformations to peaks
        
        For collaboration tracks (with mix_gains), transforms each stem's peaks
        to account for regions (trimming, duplication) and maps them to the
        collaboration timeline. All resulting peaks arrays are normalized to
        the same size (256 points) representing the full collaboration duration.
        
        Args:
            tracks: List of TrackData objects with peaks_data
            
        Returns:
            List of TrackData objects with transformed peaks_data
        """
        if not tracks:
            return tracks
        
        # Find the leaf track (last track) which has mix_gains
        leaf_track = tracks[-1]
        
        # If no mix_gains, return tracks as-is (original track, no edits)
        if not leaf_track.mix_gains or not leaf_track.mix_gains.get('stems'):
            print(f"📊 No mix_gains found, returning {len(tracks)} tracks unchanged")
            return tracks
        
        print(f"📊 Processing {len(tracks)} tracks with mix_gains transformations")
        
        # Get collaboration duration from leaf track
        collab_duration = leaf_track.duration
        
        # Create a lookup map of track_id -> TrackData for quick access
        track_map = {track.id: track for track in tracks}
        
        # Process each stem in mix_gains
        stems = leaf_track.mix_gains['stems']
        for stem in stems:
            track_id = stem.get('track_id')
            if not track_id:
                continue
            
            # Convert track_id to int if it's a string
            track_id = int(track_id) if isinstance(track_id, str) else track_id
            
            # Find the corresponding track
            source_track = track_map.get(track_id)
            if not source_track or not source_track.peaks_data:
                print(f"⚠️  Track {track_id} not found or has no peaks_data, skipping")
                continue
            
            # Get stem parameters
            gain = stem.get('gain', 1.0)
            regions = stem.get('regions', [])
            
            # Transform peaks based on regions
            transformed_peaks = self._transform_peaks_for_stem(
                source_track.peaks_data,
                source_track.duration,
                collab_duration,
                regions,
                gain
            )
            
            # Update the track's peaks_data
            source_track.peaks_data = transformed_peaks
            print(f"✅ Transformed peaks for track {track_id} ({len(regions)} regions, gain={gain})")
        
        return tracks
    
    def _transform_peaks_for_stem(self,
                                  source_peaks: List[List[float]],
                                  source_duration: float,
                                  collab_duration: float,
                                  regions: List[Dict],
                                  gain: float) -> List[List[float]]:
        """Transform source peaks to collaboration timeline accounting for regions
        
        Args:
            source_peaks: Original peaks array [[min, max], ...] from source audio
            source_duration: Duration of source audio in seconds
            collab_duration: Duration of collaboration in seconds
            regions: List of region dicts with startTime, endTime, offset
            gain: Gain multiplier to apply
            
        Returns:
            Transformed peaks array of length PEAKS_RESOLUTION (256)
        """
        if not source_peaks or source_duration <= 0 or collab_duration <= 0:
            # Return zero-filled peaks array
            return [[0.0, 0.0]] * self.PEAKS_RESOLUTION
        
        # Calculate time per peak for source and collaboration
        source_time_per_peak = source_duration / len(source_peaks)
        collab_time_per_peak = collab_duration / self.PEAKS_RESOLUTION
        
        # If no regions, map entire source to collaboration timeline
        if not regions:
            return self._map_peaks_without_regions(
                source_peaks, source_duration, collab_duration, gain
            )
        
        # Build transformed peaks array
        transformed_peaks = []
        
        for i in range(self.PEAKS_RESOLUTION):
            # Calculate collaboration time for this peak
            collab_time = i * collab_time_per_peak
            
            # Find all regions that cover this collaboration time
            covering_regions = [
                r for r in regions
                if r.get('startTime', 0) <= collab_time < r.get('endTime', collab_duration)
            ]
            
            if not covering_regions:
                # No region covers this time, use zero
                transformed_peaks.append([0.0, 0.0])
            else:
                # Aggregate peaks from all covering regions
                aggregated_peak = self._aggregate_peaks_from_regions(
                    covering_regions,
                    collab_time,
                    source_peaks,
                    source_time_per_peak,
                    source_duration
                )
                
                # Apply gain
                aggregated_peak = [
                    aggregated_peak[0] * gain,
                    aggregated_peak[1] * gain
                ]
                
                transformed_peaks.append(aggregated_peak)
        
        return transformed_peaks
    
    def _map_peaks_without_regions(self,
                                   source_peaks: List[List[float]],
                                   source_duration: float,
                                   collab_duration: float,
                                   gain: float) -> List[List[float]]:
        """Map source peaks to collaboration timeline when no regions exist
        
        This handles the case where the entire source is mapped to the collaboration.
        Maps source peaks proportionally to collaboration timeline, padding with zeros
        if source is shorter than collaboration.
        """
        transformed = []
        
        for i in range(self.PEAKS_RESOLUTION):
            # Calculate collaboration time for this peak
            collab_time = (i / self.PEAKS_RESOLUTION) * collab_duration
            
            # Map to source time (proportionally)
            if collab_time < source_duration:
                # Map collaboration time to source time
                source_time = collab_time
                # Calculate source peak index
                source_index = int((source_time / source_duration) * len(source_peaks))
                source_index = max(0, min(source_index, len(source_peaks) - 1))
                
                # Get source peak and apply gain
                peak = source_peaks[source_index]
                transformed.append([peak[0] * gain, peak[1] * gain])
            else:
                # Beyond source duration, use zero
                transformed.append([0.0, 0.0])
        
        return transformed
    
    def _aggregate_peaks_from_regions(self,
                                      regions: List[Dict],
                                      collab_time: float,
                                      source_peaks: List[List[float]],
                                      source_time_per_peak: float,
                                      source_duration: float) -> List[float]:
        """Aggregate peaks from multiple overlapping regions
        
        When multiple regions overlap at a given collaboration time, we aggregate
        their peak values by taking the maximum absolute values.
        
        Args:
            regions: List of region dicts covering collab_time
            collab_time: Time in collaboration timeline
            source_peaks: Source peaks array
            source_time_per_peak: Time per peak in source
            source_duration: Duration of source audio
            
        Returns:
            Aggregated peak [min, max]
        """
        aggregated_min = 0.0
        aggregated_max = 0.0
        
        for region in regions:
            start_time = region.get('startTime', 0)
            offset = region.get('offset', 0)
            
            # Map collaboration time to source time
            source_time = collab_time - start_time + offset
            
            # Clamp source_time to valid range
            source_time = max(0.0, min(source_time, source_duration))
            
            # Calculate source peak index
            source_index = int(source_time / source_time_per_peak)
            source_index = max(0, min(source_index, len(source_peaks) - 1))
            
            # Get source peak
            if source_index < len(source_peaks):
                peak_min, peak_max = source_peaks[source_index]
                
                # Aggregate by taking the most extreme values
                aggregated_min = min(aggregated_min, peak_min)
                aggregated_max = max(aggregated_max, peak_max)
        
        return [aggregated_min, aggregated_max]

