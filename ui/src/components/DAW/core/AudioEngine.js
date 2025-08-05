import Track from './Track.js';
import Recorder from './Recorder.js';
import DAWConfig from '../DAWConfig.js';
import { eventBus } from '../EventBus.js';
import { DAW_EVENTS } from '../DAWEvents.js';
import { getPlaybackTime } from '../DAWUtils.js';

class AudioEngine {
  constructor() {
    this.context = null;
    this.tracks = new Map();
    this.processors = new Map();
    this.recorder = null;

    // Transport state
    this.isPlaying = false;
    this.currentTime = 0; // Playback time in seconds
    this.startTime = 0; // audioContext.currentTime when playback started
    this.isLooping = false;
    this.loopStart = 0;
    this.loopEnd = 100;
    
    // Playhead management
    this.playheadTimer = null;
    
    // Event bus and events (now imported at top)
    this.eventBus = eventBus;
    this.DAW_EVENTS = DAW_EVENTS;
    
    // Bind methods
    this.play = this.play.bind(this);
    this.pause = this.pause.bind(this);
    this.handleSeekEvent = this.handleSeekEvent.bind(this);
  }
  
  async initialize() {
    this.context = new (window.AudioContext || window.webkitAudioContext)();

    if(this.context.state === 'suspended') {
      this.context.resume();
    }
    
    // Initialize recorder
    this.recorder = new Recorder(this.context, this.eventBus);
    await this.recorder.initialize();
    
    // Listen for transport events
    this.eventBus.on(this.DAW_EVENTS.TRANSPORT.PLAY, this.play);
    this.eventBus.on(this.DAW_EVENTS.TRANSPORT.PAUSE, this.pause);
    this.eventBus.on(this.DAW_EVENTS.TRANSPORT.SEEK, this.handleSeekEvent);
  }
  
  play() {
    if (this.isPlaying) return;
    
    // Resume context if suspended
    if (this.context.state === 'suspended') {
      this.context.resume();
    }
    else if(this.context.state === 'closed') {
      this.eventBus.emit(this.DAW_EVENTS.ERROR.AUDIO, 'Audio context closed');
      this.context = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    this.isPlaying = true;
    this.startTime = this.context.currentTime + DAWConfig.audio.scheduleDelay;
    
    // Start all tracks synchronized
    this.tracks.forEach(track => {
      track.play(this.startTime, this.currentTime);
    });
    
    // Start playhead updates
    this.startPlayheadTimer();
    
    // Emit playback started event
    this.eventBus.emit(this.DAW_EVENTS.PLAYBACK.STARTED);
  }
  
  pause() {
    this.isPlaying = false;
    this.currentTime = getPlaybackTime(this.context, this.startTime, this.currentTime);
    
    this.tracks.forEach(track => track.pause());
    this.stopPlayheadTimer();
    
    // Emit playback paused event
    this.eventBus.emit(this.DAW_EVENTS.PLAYBACK.PAUSED);
  }
  
  handleSeekEvent(data) {
    this.seek(data.time);
  }
  
  // Recording proxy methods
  async startRecording() {
    if (this.recorder) {
      this.recorder.setRecordingOffset(this.currentTime);
      await this.recorder.startRecording();
    }
  }
  
  stopRecording() {
    if (this.recorder) {
      this.recorder.stopRecording();
    }
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
        const playbackTime = getPlaybackTime(this.context, this.startTime, this.currentTime);
        
        // Emit position update event
        this.eventBus.emit(this.DAW_EVENTS.PLAYBACK.POSITION_UPDATE, {
          time: playbackTime,
          position: playbackTime / this.getDuration()
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
    // Stop recording if active
    if (this.recorder) {
      this.recorder.destroy();
      this.recorder = null;
    }
    
    //this.pause();
    this.tracks.forEach(track => track.destroy());
    this.tracks.clear();
    
    // Remove event listeners
    if (this.eventBus && this.DAW_EVENTS) {
      this.eventBus.off(this.DAW_EVENTS.TRANSPORT.PLAY, this.play);
      this.eventBus.off(this.DAW_EVENTS.TRANSPORT.PAUSE, this.pause);
      this.eventBus.off(this.DAW_EVENTS.TRANSPORT.SEEK, this.handleSeekEvent);
    }
    
    if (this.context) {
      this.context.close();
    }
  }
}

export default AudioEngine;