import Track from './Track.js';
import Recorder from './Recorder.js';
import DAWConfig from '../misc/DAWConfig.js';
import { eventBus } from '../misc/EventBus.js';
import { DAW_EVENTS } from '../misc/DAWEvents.js';
import { getPlaybackTime } from '../misc/DAWUtils.js';

class AudioEngine {
  constructor(audioContext) {
    this.context = audioContext;
    this.trackManager = null;
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
    this.handleTrackVolumeChange = this.handleTrackVolumeChange.bind(this);
    this.handleTrackSolo = this.handleTrackSolo.bind(this);
  }
  
  async initialize(tm) {
    this.trackManager = tm;
    
    if(!this.context) {
      eventBus.emit(DAW_EVENTS.ERROR.AUDIO, 'Audio context not found');
      return;
    }

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
    
    // Listen for track volume change events
    this.eventBus.on(this.DAW_EVENTS.TRACK.VOLUME_CHANGE, this.handleTrackVolumeChange);
    
    // Listen for track solo events
    this.eventBus.on(this.DAW_EVENTS.TRACK.SOLO, this.handleTrackSolo);
  }
  
  play() {
    if (this.isPlaying) return;

    console.log('playing');
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
    this.trackManager.getAllTracks().forEach(track => {
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
    
    this.trackManager.getAllTracks().forEach(track => track.pause());
    this.stopPlayheadTimer();
    
    // Emit playback paused event
    this.eventBus.emit(this.DAW_EVENTS.PLAYBACK.PAUSED);
  }
  
  handleSeekEvent(data) {
    this.seek(data.time);
  }
  
  handleTrackVolumeChange(data) {
    const { trackId, volume } = data;
    const track = this.trackManager.getTrack(trackId);
    
    if (track) {
      track.setGain(volume);
    }
  }
  
  handleTrackSolo(data) {
    const { trackId, isSolo } = data;
    const allTracks = this.trackManager.getAllTracks();
    
    // If this track is being soloed, unsolo all other tracks first
    if (isSolo) {
      allTracks.forEach(track => {
        if (track.id !== trackId && track.isSolo) {
          track.setSolo(false);
        }
      });
    }
    
    // Set the solo state for the target track
    const targetTrack = this.trackManager.getTrack(trackId);
    if (targetTrack) {
      targetTrack.setSolo(isSolo);
    }
    
    // Check if any track is solo'd
    const hasSoloTrack = allTracks.some(track => track.isSolo);
    
    // Apply solo logic to all tracks
    allTracks.forEach(track => {
      if (hasSoloTrack) {
        // If any track is solo'd, only solo tracks should play
        const shouldPlay = track.isSolo;
        const targetGain = shouldPlay ? track.gain : 0;
        track.gainNode.gain.setValueAtTime(targetGain, this.context.currentTime);
        track.gainNode.gain.linearRampToValueAtTime(targetGain, this.context.currentTime + 0.05);
      } else {
        // If no tracks are solo'd, all tracks play normally
        track.gainNode.gain.setValueAtTime(track.gain, this.context.currentTime);
        track.gainNode.gain.linearRampToValueAtTime(track.gain, this.context.currentTime + 0.05);
      }
    });
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
  
  // Playhead timer
  startPlayheadTimer() {
    this.playheadTimer = setInterval(() => {
      if (this.isPlaying) {
        const playbackTime = getPlaybackTime(this.context, this.startTime, this.currentTime);
        
        // Emit position update event
        this.eventBus.emit(this.DAW_EVENTS.PLAYBACK.POSITION_UPDATE, {
          time: playbackTime,
          position: playbackTime / this.getDuration() * 100
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
    this.trackManager.getAllTracks().forEach(track => {
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
    
    // Remove event listeners
    if (this.eventBus && this.DAW_EVENTS) {
      this.eventBus.off(this.DAW_EVENTS.TRANSPORT.PLAY, this.play);
      this.eventBus.off(this.DAW_EVENTS.TRANSPORT.PAUSE, this.pause);
      this.eventBus.off(this.DAW_EVENTS.TRANSPORT.SEEK, this.handleSeekEvent);
      this.eventBus.off(this.DAW_EVENTS.TRACK.VOLUME_CHANGE, this.handleTrackVolumeChange);
      this.eventBus.off(this.DAW_EVENTS.TRACK.SOLO, this.handleTrackSolo);
    }
    
    if (this.context) {
      this.context.close();
    }
  }
}

export default AudioEngine;