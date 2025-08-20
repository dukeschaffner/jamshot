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
    this.instanceId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.log('AudioEngine created with instance ID:', this.instanceId);

    // Transport state
    this.isPlaying = false;
    this.currentTime = 0; // Playback time in seconds
    this.startTime = 0; // audioContext.currentTime when playback started
    this.isLooping = false;
    this.loopStart = 0;
    this.loopEnd = 100;
    
    // Playhead management
    this.playheadTimer = null;
    
    // Metronome state
    this.isMetronomeOn = false;
    this.metronomeBPM = DAWConfig.metronome.defaultBPM;
    this.metronomeVolume = DAWConfig.metronome.defaultVolume;
    this.timeSignature = DAWConfig.metronome.defaultTimeSignature;
    this.metronomeOffset = DAWConfig.metronome.defaultOffset; // Offset as a percentage of one measure
    this.isCountInEnabled = true;
    
    // Metronome audio buffers and nodes
    this.metronomeHighClickBuffer = null;
    this.metronomeLowClickBuffer = null;
    this.metronomeGainNode = null;
    this.metronomeSources = [];
    this.lastScheduledBeat = 0;
    this.metronomeScheduleInterval = null;
    
    // Count-in state
    this.shouldCountIn = false;
    
    // Event bus and events (now imported at top)
    this.eventBus = eventBus;
    this.DAW_EVENTS = DAW_EVENTS;
    
    // Bind methods
    this.play = this.play.bind(this);
    this.pause = this.pause.bind(this);
    this.handleSeekEvent = this.handleSeekEvent.bind(this);
    this.handleTrackVolumeChange = this.handleTrackVolumeChange.bind(this);
    this.handleTrackSolo = this.handleTrackSolo.bind(this);
    this.handleMetronomeToggle = this.handleMetronomeToggle.bind(this);
    this.handleMetronomeBPMChange = this.handleMetronomeBPMChange.bind(this);
    this.handleMetronomeVolumeChange = this.handleMetronomeVolumeChange.bind(this);
    this.handleTimeSignatureChange = this.handleTimeSignatureChange.bind(this);
    this.handleMetronomeOffsetChange = this.handleMetronomeOffsetChange.bind(this);
    this.handleCountInToggle = this.handleCountInToggle.bind(this);
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
    
    // Create metronome sounds
    this.createMetronomeSounds();
    
    // Listen for transport events
    this.eventBus.on(this.DAW_EVENTS.TRANSPORT.PLAY, this.play);
    this.eventBus.on(this.DAW_EVENTS.TRANSPORT.PAUSE, this.pause);
    this.eventBus.on(this.DAW_EVENTS.TRANSPORT.SEEK, this.handleSeekEvent);
    
    // Listen for track volume change events
    this.eventBus.on(this.DAW_EVENTS.TRACK.VOLUME_CHANGE, this.handleTrackVolumeChange);
    
    // Listen for track solo events
    this.eventBus.on(this.DAW_EVENTS.TRACK.SOLO, this.handleTrackSolo);
    
    // Listen for metronome events
    this.eventBus.on(this.DAW_EVENTS.METRONOME.START, this.handleMetronomeToggle);
    this.eventBus.on(this.DAW_EVENTS.METRONOME.STOP, this.handleMetronomeToggle);
    this.eventBus.on(this.DAW_EVENTS.METRONOME.BPM_CHANGE, this.handleMetronomeBPMChange);
    this.eventBus.on(this.DAW_EVENTS.METRONOME.TIME_SIGNATURE_CHANGE, this.handleTimeSignatureChange);
    this.eventBus.on(this.DAW_EVENTS.METRONOME.OFFSET_CHANGE, this.handleMetronomeOffsetChange);
  }
  
  // Create metronome click sounds
  createMetronomeSounds() {
    if (!this.context) return;
    
    // Create high click (downbeat)
    this.metronomeHighClickBuffer = this.context.createBuffer(1, this.context.sampleRate * 0.05, this.context.sampleRate);
    const highClickChannel = this.metronomeHighClickBuffer.getChannelData(0);
    
    // Create sine wave with quick decay for high click (downbeat)
    for (let i = 0; i < this.metronomeHighClickBuffer.length; i++) {
      const frequency = DAWConfig.metronome.highClickFrequency;
      const decay = Math.exp(-DAWConfig.metronome.highClickDecay * i / this.metronomeHighClickBuffer.length);
      highClickChannel[i] = Math.sin(2 * Math.PI * frequency * i / this.context.sampleRate) * decay;
    }
    
    // Create low click (other beats)
    this.metronomeLowClickBuffer = this.context.createBuffer(1, this.context.sampleRate * 0.03, this.context.sampleRate);
    const lowClickChannel = this.metronomeLowClickBuffer.getChannelData(0);
    
    // Create sine wave with quick decay for low click (other beats)
    for (let i = 0; i < this.metronomeLowClickBuffer.length; i++) {
      const frequency = DAWConfig.metronome.lowClickFrequency;
      const decay = Math.exp(-DAWConfig.metronome.lowClickDecay * i / this.metronomeLowClickBuffer.length);
      lowClickChannel[i] = Math.sin(2 * Math.PI * frequency * i / this.context.sampleRate) * decay;
    }
    
    // Create gain node for metronome volume control
    this.metronomeGainNode = this.context.createGain();
    this.metronomeGainNode.gain.value = this.metronomeVolume;
    this.metronomeGainNode.connect(this.context.destination);
  }
  
  // Schedule metronome clicks for the next few beats
  scheduleMetronomeClicks() {
    if (!this.isMetronomeOn || !this.context) return;
    
    const beatsPerMeasure = parseInt(this.timeSignature.split('/')[0], 10);
    const secondsPerBeat = 60 / this.metronomeBPM;
    const secondsPerMeasure = secondsPerBeat * beatsPerMeasure;
    const offsetSeconds = this.metronomeOffset * secondsPerMeasure;
    
    // Calculate the current beat based on playhead position, adjusting for the offset
    const currentPlaybackTime = getPlaybackTime(this.context, this.startTime, this.currentTime);
    const adjustedTime = currentPlaybackTime + (secondsPerMeasure - offsetSeconds);
    const nextPlayheadBeat = Math.ceil(adjustedTime * this.metronomeBPM / 60);
    
    if (this.lastScheduledBeat > nextPlayheadBeat + 2) {
      return; // Don't schedule if already scheduled ahead
    }
    
    const firstBeatToSchedule = nextPlayheadBeat >= this.lastScheduledBeat ? nextPlayheadBeat : this.lastScheduledBeat + 1;
    const firstBeatToScheduleTime = this.context.currentTime + (firstBeatToSchedule * secondsPerBeat - adjustedTime);
    
    // Schedule several beats ahead (look-ahead window)
    const beatsToSchedule = beatsPerMeasure * DAWConfig.metronome.lookAheadMeasures;
    
    for (let i = 0; i < beatsToSchedule; i++) {
      const beatNumber = (firstBeatToSchedule + i) % beatsPerMeasure;
      const beatTime = firstBeatToScheduleTime + (i * secondsPerBeat);
      
      // Use high click for first beat of measure, low click for others
      const clickBuffer = beatNumber === 0 ? this.metronomeHighClickBuffer : this.metronomeLowClickBuffer;
      
      if (!clickBuffer) continue;
      
      // Create source and schedule it
      const clickSource = this.context.createBufferSource();
      clickSource.buffer = clickBuffer;
      clickSource.connect(this.metronomeGainNode);
      clickSource.start(beatTime);
      
      // Store reference to stop later if needed
      this.metronomeSources.push(clickSource);
      
      // Update the next scheduled beat
      this.lastScheduledBeat = firstBeatToSchedule + i;
    }
  }
  
  // Stop and clear all metronome sources
  stopAndClearMetronomeClicks() {
    this.metronomeSources.forEach(source => {
      try {
        source.stop();
        source.disconnect();
      } catch (error) {
        // Source may have already stopped
      }
    });
    this.metronomeSources = [];
    this.lastScheduledBeat = 0;
  }
  
  // Start metronome scheduling
  startMetronomeScheduling() {
    if (!this.isMetronomeOn) return;
    
    this.metronomeScheduleInterval = setInterval(() => {
      if (!this.isPlaying) {
        clearInterval(this.metronomeScheduleInterval);
        return;
      }
      this.scheduleMetronomeClicks();
    }, DAWConfig.metronome.scheduleInterval); // Check based on config
  }
  
  // Stop metronome scheduling
  stopMetronomeScheduling() {
    if (this.metronomeScheduleInterval) {
      clearInterval(this.metronomeScheduleInterval);
      this.metronomeScheduleInterval = null;
    }
  }
  
  play() {
    if (this.isPlaying) return;

    console.log('AudioEngine instance', this.instanceId, 'playing. tm id:', this.trackManager.id);
    // Resume context if suspended
    if (this.context.state === 'suspended') {
      this.context.resume();
    }
    else if(this.context.state === 'closed') {
      this.eventBus.emit(this.DAW_EVENTS.ERROR.AUDIO, 'Audio context closed');
      this.context = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    this.isPlaying = true;
    
    // Calculate start time with count-in if enabled
    let scheduledStartTime = this.context.currentTime + DAWConfig.audio.scheduleDelay;
    
    if (this.shouldCountIn && this.isCountInEnabled) {
      const beatsPerMeasure = parseInt(this.timeSignature.split('/')[0], 10);
      const secondsPerBeat = 60 / this.metronomeBPM;
      const secondsPerMeasure = secondsPerBeat * beatsPerMeasure;
      scheduledStartTime += secondsPerMeasure;
      this.shouldCountIn = false;
    }
    
    this.startTime = scheduledStartTime;
    
    // Start all tracks synchronized
    this.trackManager.getAllTracks().forEach(track => {
      track.play(this.startTime, this.currentTime);
    });
    
    // Start metronome if enabled
    if (this.isMetronomeOn) {
      this.stopAndClearMetronomeClicks();
      this.startMetronomeScheduling();
    }
    
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
    
    // Stop metronome
    this.stopMetronomeScheduling();
    this.stopAndClearMetronomeClicks();
    
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
  
  // Metronome event handlers
  handleMetronomeToggle(data) {
    const { isOn } = data || {};
    this.isMetronomeOn = isOn !== undefined ? isOn : !this.isMetronomeOn;
    
    if (this.isPlaying && this.isMetronomeOn) {
      this.startMetronomeScheduling();
    } else {
      this.stopMetronomeScheduling();
      this.stopAndClearMetronomeClicks();
    }
  }
  
  handleMetronomeBPMChange(data) {
    const { bpm } = data;
    this.metronomeBPM = bpm;
    
    // Restart metronome scheduling if currently playing
    if (this.isPlaying && this.isMetronomeOn) {
      this.stopAndClearMetronomeClicks();
      this.startMetronomeScheduling();
    }
  }
  
  handleMetronomeVolumeChange(data) {
    const { volume } = data;
    this.metronomeVolume = volume;
    
    if (this.metronomeGainNode) {
      this.metronomeGainNode.gain.value = volume;
    }
  }
  
  handleTimeSignatureChange(data) {
    const { timeSignature } = data;
    this.timeSignature = timeSignature;
    
    // Restart metronome scheduling if currently playing
    if (this.isPlaying && this.isMetronomeOn) {
      this.stopAndClearMetronomeClicks();
      this.startMetronomeScheduling();
    }
  }
  
  handleMetronomeOffsetChange(data) {
    const { offset } = data;
    this.metronomeOffset = offset;
    
    // Restart metronome scheduling if currently playing
    if (this.isPlaying && this.isMetronomeOn) {
      this.stopAndClearMetronomeClicks();
      this.startMetronomeScheduling();
    }
  }
  
  handleCountInToggle(data) {
    const { isEnabled } = data || {};
    this.isCountInEnabled = isEnabled !== undefined ? isEnabled : !this.isCountInEnabled;
  }
  
  // Set count-in flag for next playback
  setCountIn(enabled) {
    this.shouldCountIn = enabled;
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
    console.log('AudioEngine instance destroyed:', this.instanceId);
    // Stop recording if active
    if (this.recorder) {
      this.recorder.destroy();
      this.recorder = null;
    }
    
    // Stop metronome
    this.stopMetronomeScheduling();
    this.stopAndClearMetronomeClicks();
    
    // Remove event listeners
    if (this.eventBus && this.DAW_EVENTS) {
      console.log('Removing event listeners for AudioEngine instance:', this.instanceId);
      this.eventBus.off(this.DAW_EVENTS.TRANSPORT.PLAY, this.play);
      this.eventBus.off(this.DAW_EVENTS.TRANSPORT.PAUSE, this.pause);
      this.eventBus.off(this.DAW_EVENTS.TRANSPORT.SEEK, this.handleSeekEvent);
      this.eventBus.off(this.DAW_EVENTS.TRACK.VOLUME_CHANGE, this.handleTrackVolumeChange);
      this.eventBus.off(this.DAW_EVENTS.TRACK.SOLO, this.handleTrackSolo);
      this.eventBus.off(this.DAW_EVENTS.METRONOME.START, this.handleMetronomeToggle);
      this.eventBus.off(this.DAW_EVENTS.METRONOME.STOP, this.handleMetronomeToggle);
      this.eventBus.off(this.DAW_EVENTS.METRONOME.BPM_CHANGE, this.handleMetronomeBPMChange);
      this.eventBus.off(this.DAW_EVENTS.METRONOME.TIME_SIGNATURE_CHANGE, this.handleTimeSignatureChange);
      this.eventBus.off(this.DAW_EVENTS.METRONOME.OFFSET_CHANGE, this.handleMetronomeOffsetChange);
    }
    
    if (this.context) {
      this.context.close();
    }
  }
}

export default AudioEngine;