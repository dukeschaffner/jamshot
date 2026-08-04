import DAWConfig from '../misc/DAWConfig.js';

/**
 * AudioStateStore - Centralized state management for DAW audio state
 * Single source of truth for all audio-related state variables
 */
class AudioStateStore {
  constructor() {
    this.reset();
  }
  
  // Utility method to reset all state to defaults
  reset() {
    this.isPlaying = false;
    this.isRecording = false;
    this.currentTime = 0;
    this.startTime = 0;
    
    this.isLooping = false;
    this.loopStart = 0;
    this.loopEnd = 100;

    this.dawDuration = DAWConfig.project.defaultDuration;

    this.isCollab = false;
    this.armedTrackId = null;
    this.recordingTargetTrackId = null;

    // this.isMetronomeOn = false;
    // this.metronomeBPM = 120;
    // this.metronomeVolume = 0.8;
    // this.timeSignature = '4/4';
    // this.metronomeOffset = 0;
    // this.isCountInEnabled = true;
    // this.shouldCountIn = false;
    
    // this.recordingLatency = 0;
    // this.playbackStartTime = 0;
    // this.playbackTime = 0;
    
    // this.selectedAudioInputDevice = null;
    this.userLatencyCompensation = DAWConfig.recording.defaultLatencyCompensation;
    

  }
}

const AudioState = new AudioStateStore();

export default AudioState;
