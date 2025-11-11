// ui/src/components/DAW/core/TrackManager.js
import { bufferRegistry } from './BufferRegistry.js';
import { getAudioBufferFromS3 } from '../misc/DAWUtils.js';
import Track from './Track.js';
import { eventBus } from '../misc/EventBus.js';
import { DAW_EVENTS } from '../misc/DAWEvents.js';
import AudioState from './AudioStateStore.js';
import api from '../../../lib/api.js';

class TrackManager {
  constructor(audioContext) {
    this.tracks = new Map(); // trackId -> Track instance
    this.audioContext = audioContext;
    this.id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // Load stem chain for DAW using complete stem information
  async loadStemChain(trackData) {
    try {
      // Call the stems API endpoint to get complete stem information with signed URLs
      const stemsResponse = await api.get(`/tracks/${trackData.id}/stems`);
      const stemsData = stemsResponse.data;

      if (!stemsData || stemsData.length === 0) {
        // Fallback if stems endpoint fails
        return [await this.createTrackFromData(trackData)];
      }

      // Load all stem audio files in parallel
      const stemPromises = stemsData.map(async (stem, index) => {
        const buffer = await getAudioBufferFromS3(stem.audio_url, this.audioContext);
        return {
          id: stem.track_id,
          buffer: buffer,
          gain: stem.gain,
          order: stem.order,
          title: stem.title,
          regions: stem.regions || [],
          name: `Stem ${index + 1} (Track ${stem.track_id})`
        };
      });

      const stems = await Promise.all(stemPromises);

      // Sort by order and create tracks
      const tracks = stems
        .sort((a, b) => a.order - b.order)
        .map(stem => this.createTrackFromStem(stem));

      // Set DAW duration from longest stem
      const durations = tracks.map(track => track.calculateTotalDuration());
      const maxDuration = Math.max(...durations);
      AudioState.dawDuration = maxDuration;
      eventBus.emit(DAW_EVENTS.PLAYBACK.DURATION_CHANGE, { duration: maxDuration });

      return tracks;

    } catch (error) {
      console.error('Error loading stem chain:', error);
      // Fallback to legacy loading on error
      return [await this.createTrackFromData(trackData)];
    }
  }

  createTrackFromStem(stemData) {
    const bufferKey = bufferRegistry.generateBufferKey(stemData.id, 'stem-region');

    // Store buffer in registry
    bufferRegistry.storeBuffer(bufferKey, stemData.buffer, {
      name: 'stem-region',
      trackId: stemData.id
    });

    const track = new Track(stemData.id, this.audioContext, [], stemData.title);
    track.setGain(stemData.gain);
    
    // Add regions if present, otherwise add a single region covering the full buffer
    if (stemData.regions && stemData.regions.length > 0) {
      // Add each region from the stem data
      stemData.regions.forEach(region => {
        track.addRegion(bufferKey, region.startTime, region.offset, region.endTime, 'stem-region');
      });
    } else {
      // Default: add a single region covering the full buffer
      track.addRegion(bufferKey, null, null, null, 'stem-region');
    }

    this.tracks.set(stemData.id, track);
    return track;
  }

  // Fallback method for legacy tracks
  async createTrackFromData(trackData) {
    const regionName = "region";
    const bufferKey = bufferRegistry.generateBufferKey(trackData.id, regionName);

    // Load buffer from S3
    const buffer = await getAudioBufferFromS3(trackData.combined_audio_url || trackData.audio_url, this.audioContext);

    // Store in registry
    bufferRegistry.storeBuffer(bufferKey, buffer, {
      name: regionName,
      trackId: trackData.id
    });

    const track = new Track(trackData.id, this.audioContext, [], trackData.title);
    track.setGain(1.0);
    track.addRegion(bufferKey, null, null, null, regionName);

    this.tracks.set(trackData.id, track);
    return track;
  }

  // Legacy method for backward compatibility
  async loadTrack(trackData) {
    return (await this.loadStemChain(trackData))[0];
  }

  // Load multiple tracks (legacy method)
  async loadAllTracks(tracksData) {
    const loadPromises = tracksData.map(trackData =>
      this.loadStemChain(trackData)
    );

    const trackArrays = await Promise.all(loadPromises);
    const allTracks = trackArrays.flat();

    const trackDurations = await Promise.all(allTracks.map(track => track.calculateTotalDuration()));
    const maxDuration = Math.max(...trackDurations);
    AudioState.dawDuration = maxDuration;
    eventBus.emit(DAW_EVENTS.PLAYBACK.DURATION_CHANGE, { duration: AudioState.dawDuration });

    return allTracks;
  }

  // Create an empty track for recording
  createEmptyTrack(id = 'recording-track') {
    if (!this.audioContext) {
      eventBus.emit(DAW_EVENTS.ERROR.AUDIO, 'Audio context not found');
      return null;
    }
    
    // Create an empty track with no regions
    const track = new Track(id, this.audioContext);
    
    this.tracks.set(id, track);
    eventBus.emit(DAW_EVENTS.TRACK.ADD, { track });
    
    return track;
  }
  
  getTrack(id) {
    return this.tracks.get(id);
  }
  
  getAllTracks() {
    return Array.from(this.tracks.values());
  }
  
  destroy() {
    // Cleanup tracks
    this.tracks.forEach(track => {
      if (track.destroy) {
        track.destroy();
      }
    });
    this.tracks.clear();
  }
}

export default TrackManager;