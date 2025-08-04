import Track from './Track.js';
import DAWConfig from '../DAWConfig.js';

class AudioEngine {
  constructor() {
    this.context = null;
    this.tracks = new Map();
    this.processors = new Map();

    // Transport state
    this.isPlaying = false;
    this.currentTime = 0;
    this.startTime = 0;
    this.isLooping = false;
    this.loopStart = 0;
    this.loopEnd = 100;
    
    // Playhead management
    this.playheadTimer = null;
    
    // Import event bus and events
    this.eventBus = null;
    this.DAW_EVENTS = null;
    
    // Bind methods
    this.handlePlayEvent = this.handlePlayEvent.bind(this);
    this.handlePauseEvent = this.handlePauseEvent.bind(this);
    this.handleSeekEvent = this.handleSeekEvent.bind(this);
  }
  
  async initialize() {
    this.context = new (window.AudioContext || window.webkitAudioContext)();
    
    // Import event bus and events dynamically
    const { eventBus } = await import('../EventBus');
    const { DAW_EVENTS } = await import('../DAWEvents');
    
    this.eventBus = eventBus;
    this.DAW_EVENTS = DAW_EVENTS;
    
    // Listen for transport events
    this.eventBus.on(this.DAW_EVENTS.TRANSPORT.PLAY, this.handlePlayEvent);
    this.eventBus.on(this.DAW_EVENTS.TRANSPORT.PAUSE, this.handlePauseEvent);
    this.eventBus.on(this.DAW_EVENTS.TRANSPORT.SEEK, this.handleSeekEvent);
  }
  
  handlePlayEvent() {
    if (this.isPlaying) return;
    
    // Resume context if suspended
    if (this.context.state === 'suspended') {
      this.context.resume();
    }
    
    this.isPlaying = true;
    this.startTime = this.context.currentTime - this.currentTime;
    
    // Start all tracks synchronized
    this.tracks.forEach(track => {
      //track.play(this.startTime, this.currentTime);
      track.play(0, 0);
    });
    
    // Start playhead updates
    this.startPlayheadTimer();
    
    // Emit playback started event
    this.eventBus.emit(this.DAW_EVENTS.PLAYBACK.STARTED);
  }
  
  handlePauseEvent() {
    this.isPlaying = false;
    this.currentTime = this.context.currentTime - this.startTime;
    
    this.tracks.forEach(track => track.pause());
    this.stopPlayheadTimer();
    
    // Emit playback paused event
    this.eventBus.emit(this.DAW_EVENTS.PLAYBACK.PAUSED);
  }
  
  handleSeekEvent(data) {
    this.seek(data.time);
  }
  
  createTrack(id, buffer) {
    const track = new Track(id, this.context, buffer);
    this.tracks.set(id, track);
    return track;
  }
  
  // Playhead timer
  startPlayheadTimer() {
    this.playheadTimer = setInterval(() => {
      if (this.isPlaying) {
        this.currentTime = this.context.currentTime - this.startTime;
        
        // Handle loop boundaries
        if (this.isLooping && this.currentTime >= this.loopEnd) {
          this.seek(this.loopStart);
        }
        
        // Emit position update event
        this.eventBus.emit(this.DAW_EVENTS.PLAYBACK.POSITION_UPDATE, {
          time: this.currentTime,
          position: this.currentTime / this.getDuration()
        });
      }
    }, DAWConfig.ui.updateInterval); // 50fps updates
  }
  
  stopPlayheadTimer() {
    if (this.playheadTimer) {
      clearInterval(this.playheadTimer);
      this.playheadTimer = null;
    }
  }
  
  seek(time) {
    this.currentTime = time;
    
    if (this.isPlaying) {
      // Restart playback at new position
      this.pause();
      this.play();
    }
  }
  
  // Utility methods
  getDuration() {
    let maxDuration = 0;
    this.tracks.forEach(track => {
      maxDuration = Math.max(maxDuration, track.duration);
    });
    return maxDuration || 1; // Prevent division by zero
  }
  
  // Cleanup
  destroy() {
    //this.pause();
    this.tracks.forEach(track => track.destroy());
    this.tracks.clear();
    
    // Remove event listeners
    if (this.eventBus && this.DAW_EVENTS) {
      this.eventBus.off(this.DAW_EVENTS.TRANSPORT.PLAY, this.handlePlayEvent);
      this.eventBus.off(this.DAW_EVENTS.TRANSPORT.PAUSE, this.handlePauseEvent);
      this.eventBus.off(this.DAW_EVENTS.TRANSPORT.SEEK, this.handleSeekEvent);
    }
    
    if (this.context) {
      this.context.close();
    }
  }
}

export default AudioEngine;