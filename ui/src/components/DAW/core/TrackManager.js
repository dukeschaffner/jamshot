// ui/src/components/DAW/core/TrackManager.js
import { bufferRegistry } from './BufferRegistry.js';
import { getAudioBufferFromS3 } from '../DAWUtils.js';
import Track from './Track.js';
import { eventBus } from '../EventBus.js';
import { DAW_EVENTS } from '../DAWEvents.js';

class TrackManager {
  constructor(audioContext) {
    this.tracks = new Map(); // trackId -> Track instance
    this.audioContext = audioContext;
  }
  
  async loadTrack(trackData) {
    const regionName = "region";
    const bufferKey = bufferRegistry.generateBufferKey(trackData.id, regionName);
      
    let audioContext = this.audioContext;
    if (!audioContext) {
      eventBus.emit(DAW_EVENTS.ERROR.AUDIO, 'Audio context not found');
      return;
    }
    
    const buffer = await getAudioBufferFromS3(trackData.combined_audio_url, audioContext);
      
    // Store in registry
    bufferRegistry.storeBuffer(bufferKey, buffer, {
      name: regionName,
      trackId: trackData.id
    });
      
    // Create track with regions
    const track = new Track(trackData.id, audioContext); 
    track.addRegion(bufferKey, null, null, null, regionName);
    
    this.tracks.set(trackData.id, track);
    return track;
  }
  
  // Load multiple tracks
  async loadAllTracks(tracksData) {
    const loadPromises = tracksData.map(trackData => 
      this.loadTrack(trackData)
    );
    
    await Promise.all(loadPromises);
    return Array.from(this.tracks.values());
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