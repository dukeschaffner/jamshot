import Track from './Track.js';
import Recorder from './Recorder.js';
import ChunkScheduler from './ChunkScheduler.js';
import DAWConfig from '../misc/DAWConfig.js';
import { eventBus } from '../misc/EventBus.js';
import { DAW_EVENTS } from '../misc/DAWEvents.js';
import { getPlaybackTime } from '../misc/DAWUtils.js';
import AudioState from './AudioStateStore.js';

class AudioEngine {
  constructor(audioContext, isCollab) {
    this.context = audioContext;
    this.trackManager = null;
    this.chunkScheduler = null;
    this.processors = new Map();
    this.recorder = null;
    this.instanceId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    AudioState.isCollab = isCollab;
    
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
    this.startRecording = this.startRecording.bind(this);
    this.stopRecording = this.stopRecording.bind(this);
    this.handleSeekEvent = this.handleSeekEvent.bind(this);
    this.handleTrackVolumeChange = this.handleTrackVolumeChange.bind(this);
    this.handleTrackSolo = this.handleTrackSolo.bind(this);
    this.handleTrackMute = this.handleTrackMute.bind(this);
    this.handleMetronomeToggle = this.handleMetronomeToggle.bind(this);
    this.handleMetronomeBPMChange = this.handleMetronomeBPMChange.bind(this);
    this.handleMetronomeVolumeChange = this.handleMetronomeVolumeChange.bind(this);
    this.handleTimeSignatureChange = this.handleTimeSignatureChange.bind(this);
    this.handleMetronomeOffsetChange = this.handleMetronomeOffsetChange.bind(this);
    this.handleCountInToggle = this.handleCountInToggle.bind(this);
    this.handleLoopStart = this.handleLoopStart.bind(this);
    this.handleLoopBoundariesSet = this.handleLoopBoundariesSet.bind(this);
    this.handleDurationChange = this.handleDurationChange.bind(this);

    // Input monitoring state
    this.monitorStream = null;
    this.monitorSource = null;
    this.isMonitoring = false;
    this.monitorMeterConnection = null; // Track connection to meterGainNode (always active)

    // Bind input monitoring handlers
    this.handleInputDeviceChange = this.handleInputDeviceChange.bind(this);
    this.handleMonitorToggle = this.handleMonitorToggle.bind(this);
  }
  
  async initialize(tm, metronomeBpm, timeSignature, metronomeOffset) {
    this.trackManager = tm;
    
    if(!this.context) {
      eventBus.emit(DAW_EVENTS.ERROR.AUDIO, 'Audio context not found');
      return;
    }

    if(this.context.state === 'suspended') {
      this.context.resume();
    }

    if(metronomeBpm) {
      this.metronomeBPM = metronomeBpm;
    }
    if(timeSignature) {
      this.timeSignature = timeSignature;
    }
    if(metronomeOffset) {
      this.metronomeOffset = metronomeOffset;
    }
    
    // Initialize chunk scheduler
    this.chunkScheduler = new ChunkScheduler(this.context, this.trackManager);
    
    // Initialize recorder
    this.recorder = new Recorder(this.context, this.eventBus);
    await this.recorder.initialize();
    
    // Create metronome sounds
    this.createMetronomeSounds();
    
    // Listen for transport events
    this.eventBus.on(this.DAW_EVENTS.TRANSPORT.PLAY, this.play);
    this.eventBus.on(this.DAW_EVENTS.TRANSPORT.PAUSE, this.pause);
    this.eventBus.on(this.DAW_EVENTS.TRANSPORT.SEEK, this.handleSeekEvent);
    this.eventBus.on(this.DAW_EVENTS.RECORDING.START, this.startRecording);
    this.eventBus.on(this.DAW_EVENTS.RECORDING.STOP, this.stopRecording);

    // Listen for audio settings events (input monitoring)
    this.eventBus.on(this.DAW_EVENTS.AUDIO_SETTINGS.INPUT_DEVICE_CHANGE, this.handleInputDeviceChange);
    this.eventBus.on(this.DAW_EVENTS.AUDIO_SETTINGS.MONITOR_TOGGLE, this.handleMonitorToggle);
    
    // Listen for track volume change events
    this.eventBus.on(this.DAW_EVENTS.TRACK.VOLUME_CHANGE, this.handleTrackVolumeChange);
    
    // Listen for track solo events
    this.eventBus.on(this.DAW_EVENTS.TRACK.SOLO, this.handleTrackSolo);

    // Listen for track mute events
    this.eventBus.on(this.DAW_EVENTS.TRACK.MUTE, this.handleTrackMute);
    
    // Listen for metronome events
    this.eventBus.on(this.DAW_EVENTS.METRONOME.TOGGLE, this.handleMetronomeToggle);
    this.eventBus.on(this.DAW_EVENTS.METRONOME.BPM_CHANGE, this.handleMetronomeBPMChange);
    this.eventBus.on(this.DAW_EVENTS.METRONOME.TIME_SIGNATURE_CHANGE, this.handleTimeSignatureChange);
    this.eventBus.on(this.DAW_EVENTS.METRONOME.OFFSET_CHANGE, this.handleMetronomeOffsetChange);
    this.eventBus.on(this.DAW_EVENTS.METRONOME.COUNT_IN_TOGGLE, this.handleCountInToggle);
    this.eventBus.on(this.DAW_EVENTS.AUDIO_SETTINGS.METRONOME_VOLUME_CHANGE, this.handleMetronomeVolumeChange);
    
    // Listen for loop events
    this.eventBus.on(this.DAW_EVENTS.LOOP.START, this.handleLoopStart);
    this.eventBus.on(this.DAW_EVENTS.LOOP.BOUNDARIES_SET, this.handleLoopBoundariesSet);

    // Listen for duration change events
    this.eventBus.on(this.DAW_EVENTS.PLAYBACK.DURATION_CHANGE, this.handleDurationChange);
  }
  
  // #region metronome

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
    const currentPlaybackTime = getPlaybackTime(this.context, AudioState.startTime, AudioState.currentTime);
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
      if (!AudioState.isPlaying) {
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

  // #endregion

  // #region event handlers (play/pause...)
  
  play() {
    if (AudioState.isPlaying) return;

    // Resume context if suspended
    if (this.context.state === 'suspended') {
      this.context.resume();
    }
    else if(this.context.state === 'closed') {
      this.eventBus.emit(this.DAW_EVENTS.ERROR.AUDIO, 'Audio context closed');
      this.context = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    AudioState.isPlaying = true;

    if(AudioState.isLooping) {
      AudioState.currentTime = AudioState.loopStart;
    }
    
    // Calculate start time with count-in if enabled
    let scheduledStartTime = this.context.currentTime + DAWConfig.audio.scheduleDelay;
    
    if (this.shouldCountIn && this.isCountInEnabled && this.isMetronomeOn) {
      const beatsPerMeasure = parseInt(this.timeSignature.split('/')[0], 10);
      const secondsPerBeat = 60 / this.metronomeBPM;
      const secondsPerMeasure = secondsPerBeat * beatsPerMeasure;
      scheduledStartTime += secondsPerMeasure;
      this.shouldCountIn = false;
    }
    
    AudioState.startTime = scheduledStartTime;
    
    // Start chunk scheduler
    if (this.chunkScheduler) {
      this.chunkScheduler.start();
    }
    
    // Start metronome if enabled
    if (this.isMetronomeOn) {
      this.stopAndClearMetronomeClicks();
      this.startMetronomeScheduling();
    }
    
    // Start playhead updates
    this.startPlayheadTimer();
    
    // Emit playback started event
    this.eventBus.emit(this.DAW_EVENTS.PLAYBACK.STARTED, { audioContextTime: AudioState.startTime, playbackTime: AudioState.currentTime});
  }
  
  pause(currentTime = null) {
    AudioState.isPlaying = false;
    AudioState.currentTime = currentTime !== null ? currentTime : getPlaybackTime(this.context, AudioState.startTime, AudioState.currentTime);
    
    // Stop chunk scheduler
    if (this.chunkScheduler) {
      this.chunkScheduler.stop();
    }
    
    this.stopPlayheadTimer();
    
    // Stop metronome
    this.stopMetronomeScheduling();
    this.stopAndClearMetronomeClicks();
    
    // Emit playback paused event
    this.eventBus.emit(this.DAW_EVENTS.PLAYBACK.PAUSED);
  }

  async startRecording() {
    if (!this.monitorStream || !this.monitorSource) {
      await this.initializeInputMetering();
    }
    if (this.recorder) {
      await this.recorder.startRecording(this.monitorStream || undefined);
    }

    // Auto-start playback when recording begins (if not already playing)
    if (!AudioState.isPlaying) {
      // If count-in is enabled, set the flag for the next playback
      if (this.isCountInEnabled && this.isMetronomeOn) {
        this.setCountIn(true);
      }
      this.play();
    }
  }

  async initializeInputMetering() {
    // Create/get monitor source and stream for metering only (no monitoring output)
    const constraints = {
      audio: {
        sampleRate: DAWConfig.audio.sampleRate,
        channelCount: DAWConfig.audio.channels,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        ...(AudioState.selectedAudioInputDevice ? { deviceId: { exact: AudioState.selectedAudioInputDevice } } : {})
      }
    };
    if (!this.monitorStream) {
      this.monitorStream = await navigator.mediaDevices.getUserMedia(constraints);
    }
    if (!this.monitorSource) {
      this.monitorSource = this.context.createMediaStreamSource(this.monitorStream);
    }
    
    const recTrack = this.trackManager?.getTrack('recording-track');
    if (recTrack) {
      // Connect to meterGainNode only (for metering, not monitoring output)
      const meterGainNode = recTrack.getMeterGainNode();
      if (meterGainNode && !this.monitorMeterConnection) {
        try {
          this.monitorSource.connect(meterGainNode);
          this.monitorMeterConnection = true;
        } catch (e) {
          // Already connected, ignore
        }
      }
    }
  }

  async startInputMonitoring() {
    // Ensure input stream and source exist
    if (!this.monitorStream || !this.monitorSource) {
      await this.initializeInputMetering();
    }
    
    const recTrack = this.trackManager?.getTrack('recording-track');
    if (recTrack) {
      // Disconnect from meterGainNode to avoid doubling signal in analyzer
      const meterGainNode = recTrack.getMeterGainNode();
      if (meterGainNode && this.monitorMeterConnection) {
        try {
          this.monitorSource.disconnect(meterGainNode);
          this.monitorMeterConnection = false;
        } catch (e) {
          // Not connected, ignore
        }
      }
      
      // Connect to gainNode for monitoring output (this also feeds analyzer)
      if (recTrack.gainNode) {
        try {
          this.monitorSource.connect(recTrack.gainNode);
        } catch (e) {
          // Already connected, ignore
        }
      }
    }
    
    // Set monitoring state and emit event only if transitioning from disabled to enabled
    if (!this.isMonitoring) {
      this.isMonitoring = true;
      this.eventBus.emit(this.DAW_EVENTS.AUDIO_SETTINGS.MONITOR_STARTED);
    }
  }

  stopInputMonitoring() {
    if (!this.isMonitoring) return;
    try {
      if (this.monitorSource) {
        const recTrack = this.trackManager?.getTrack('recording-track');
        if (recTrack) {
          // Disconnect from gainNode (monitoring output)
          if (recTrack.gainNode) {
            try {
              this.monitorSource.disconnect(recTrack.gainNode);
            } catch (e) {
              // Not connected, ignore
            }
          }
          
          // Reconnect to meterGainNode for metering (without monitoring output)
          const meterGainNode = recTrack.getMeterGainNode();
          if (meterGainNode && !this.monitorMeterConnection) {
            try {
              this.monitorSource.connect(meterGainNode);
              this.monitorMeterConnection = true;
            } catch (e) {
              // Already connected, ignore
            }
          }
        }
      }
    } catch (_) { /* no-op */ }
    // Keep stream alive for reuse; don't stop tracks so recorder can reuse
    // Meter connection remains active to show input signal in meter
    this.isMonitoring = false;
    this.eventBus.emit(this.DAW_EVENTS.AUDIO_SETTINGS.MONITOR_STOPPED);
  }

  async handleInputDeviceChange(data) {
    AudioState.selectedAudioInputDevice = data?.deviceId || null;
    
    // Store current monitoring state before switching devices
    const wasMonitoring = this.isMonitoring;
    
    // If we have an existing monitor source, disconnect it before switching devices
    if (this.monitorSource) {
      try {
        const recTrack = this.trackManager?.getTrack('recording-track');
        if (recTrack) {
          // Disconnect from both meter and monitor paths
          const meterGainNode = recTrack.getMeterGainNode();
          if (meterGainNode) {
            try {
              this.monitorSource.disconnect(meterGainNode);
            } catch (e) {
              // Not connected, ignore
            }
            this.monitorMeterConnection = false;
          }
          if (recTrack.gainNode) {
            try {
              this.monitorSource.disconnect(recTrack.gainNode);
            } catch (e) {
              // Not connected, ignore
            }
          }
        }
        // Stop old stream
        if (this.monitorStream) {
          this.monitorStream.getTracks().forEach(track => track.stop());
          this.monitorStream = null;
        }
        this.monitorSource = null;
        this.isMonitoring = false;
      } catch (_) { /* no-op */ }
    }
    
    // Initialize input metering with new device (meter-only, no monitoring)
    if (data?.deviceId) {
      await this.initializeInputMetering().catch(() => {});
      
      // If monitoring was enabled before device change, re-enable it
      if (wasMonitoring) {
        await this.startInputMonitoring().catch(() => {});
      }
    }
  }

  handleMonitorToggle({ enabled } = {}) {
    if (enabled) {
      this.startInputMonitoring().catch(() => {});
    } else {
      this.stopInputMonitoring();
    }
  }
  
  stopRecording() {
    if (this.recorder) {
      this.recorder.stopRecording();
    }
    this.pause();
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

  handleTrackMute(data) {
    const { trackId, isMuted } = data;

    // Set the mute state for the target track
    const targetTrack = this.trackManager.getTrack(trackId);
    if (targetTrack) {
      // Apply mute logic - if muted, set gain to 0, otherwise set to track gain
      const targetGain = isMuted ? 0 : targetTrack.gain;
      targetTrack.gainNode.gain.setValueAtTime(targetGain, this.context.currentTime);
      targetTrack.gainNode.gain.linearRampToValueAtTime(targetGain, this.context.currentTime + 0.05);
    }
  }
  
  // Metronome event handlers
  handleMetronomeToggle(data) {
    const { isOn } = data || {};
    this.isMetronomeOn = isOn !== undefined ? isOn : !this.isMetronomeOn;
    
    if (AudioState.isPlaying && this.isMetronomeOn) {
      this.startMetronomeScheduling();
    } else {
      this.stopMetronomeScheduling();
      this.stopAndClearMetronomeClicks();
    }
  }

  handleCountInToggle(data) {
    const { isOn } = data || {};
    this.isCountInEnabled = isOn !== undefined ? isOn : !this.isCountInEnabled;
  }
  
  handleMetronomeBPMChange(data) {
    const { bpm } = data;
    this.metronomeBPM = bpm;
    
    // Restart metronome scheduling if currently playing
    if (AudioState.isPlaying && this.isMetronomeOn) {
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
    if (AudioState.isPlaying && this.isMetronomeOn) {
      this.stopAndClearMetronomeClicks();
      this.startMetronomeScheduling();
    }
  }
  
  handleMetronomeOffsetChange(data) {
    const { offset } = data;
    this.metronomeOffset = offset;
    
    // Restart metronome scheduling if currently playing
    if (AudioState.isPlaying && this.isMetronomeOn) {
      this.stopAndClearMetronomeClicks();
      this.startMetronomeScheduling();
    }
  }
  
  // Loop event handlers
  handleLoopStart() {
    // Restart metronome scheduling if currently playing and metronome is on
    if (AudioState.isPlaying && this.isMetronomeOn) {
      this.stopAndClearMetronomeClicks();
      this.startMetronomeScheduling();
    }
  }

  handleLoopBoundariesSet() {
    // Restart metronome scheduling if currently playing, metronome is on, and looping is enabled
    if (AudioState.isPlaying && this.isMetronomeOn && AudioState.isLooping) {
      this.stopAndClearMetronomeClicks();
      this.startMetronomeScheduling();
    }
  }

  handleDurationChange(data) {
    const { duration } = data;
    AudioState.dawDuration = duration;
  }

  // #endregion
  
  // Set count-in flag for next playback
  setCountIn(enabled) {
    this.shouldCountIn = enabled;
  }
  
  // Playhead timer
  startPlayheadTimer() {
    this.playheadTimer = setInterval(() => {
      if (AudioState.isPlaying) {
        let playbackTime = getPlaybackTime(this.context, AudioState.startTime, AudioState.currentTime);

        if(playbackTime > AudioState.dawDuration) {
          if(AudioState.isRecording) {
            this.stopRecording();
            AudioState.currentTime = 0;
            playbackTime = 0;
          }
          else if(!AudioState.isLooping) {
            console.log('stopping playback because we\'ve reached the end of the track and we\'re not looping');
            this.pause();
            AudioState.currentTime = 0;
            playbackTime = 0;
          }

        }
        else if(!AudioState.isCollab && AudioState.isRecording && playbackTime > AudioState.dawDuration - DAWConfig.singleTrackDAW.dawDurationExtensionLookahead) {
          AudioState.dawDuration = AudioState.dawDuration + 15;
          this.eventBus.emit(this.DAW_EVENTS.PLAYBACK.DURATION_CHANGE, { duration: AudioState.dawDuration });
        }

        // Emit position update event
        this.eventBus.emit(this.DAW_EVENTS.PLAYBACK.POSITION_UPDATE, {
          time: playbackTime,
          position: playbackTime / AudioState.dawDuration * 100
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
    AudioState.currentTime = time;
    console.log('seek', time);
    
    if (AudioState.isPlaying) {
      // Restart playback at new position
      this.pause(time);
      this.play();
    }
  }
  
  // Cleanup
  destroy() {
    // Stop chunk scheduler
    if (this.chunkScheduler) {
      this.chunkScheduler.destroy();
      this.chunkScheduler = null;
    }
    
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
      this.eventBus.off(this.DAW_EVENTS.TRANSPORT.PLAY, this.play);
      this.eventBus.off(this.DAW_EVENTS.TRANSPORT.PAUSE, this.pause);
      this.eventBus.off(this.DAW_EVENTS.RECORDING.START, this.startRecording);
      this.eventBus.off(this.DAW_EVENTS.RECORDING.STOP, this.stopRecording);
      this.eventBus.off(this.DAW_EVENTS.TRANSPORT.SEEK, this.handleSeekEvent);
      this.eventBus.off(this.DAW_EVENTS.TRACK.VOLUME_CHANGE, this.handleTrackVolumeChange);
      this.eventBus.off(this.DAW_EVENTS.TRACK.SOLO, this.handleTrackSolo);
    this.eventBus.off(this.DAW_EVENTS.TRACK.MUTE, this.handleTrackMute);
      this.eventBus.off(this.DAW_EVENTS.METRONOME.TOGGLE, this.handleMetronomeToggle);
      this.eventBus.off(this.DAW_EVENTS.METRONOME.COUNT_IN_TOGGLE, this.handleCountInToggle);
      this.eventBus.off(this.DAW_EVENTS.METRONOME.BPM_CHANGE, this.handleMetronomeBPMChange);
      this.eventBus.off(this.DAW_EVENTS.METRONOME.TIME_SIGNATURE_CHANGE, this.handleTimeSignatureChange);
      this.eventBus.off(this.DAW_EVENTS.METRONOME.OFFSET_CHANGE, this.handleMetronomeOffsetChange);
      this.eventBus.off(this.DAW_EVENTS.AUDIO_SETTINGS.METRONOME_VOLUME_CHANGE, this.handleMetronomeVolumeChange);
      this.eventBus.off(this.DAW_EVENTS.AUDIO_SETTINGS.INPUT_DEVICE_CHANGE, this.handleInputDeviceChange);
      this.eventBus.off(this.DAW_EVENTS.AUDIO_SETTINGS.MONITOR_TOGGLE, this.handleMonitorToggle);
      this.eventBus.off(this.DAW_EVENTS.LOOP.START, this.handleLoopStart);
      this.eventBus.off(this.DAW_EVENTS.LOOP.BOUNDARIES_SET, this.handleLoopBoundariesSet);
      this.eventBus.off(this.DAW_EVENTS.PLAYBACK.DURATION_CHANGE, this.handleDurationChange);
    }
    
    if (this.context) {
      this.context.close();
    }
  }
}

export default AudioEngine;