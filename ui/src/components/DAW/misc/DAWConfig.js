// DAWConfig.js - Centralized configuration
const DAWConfig = {
    project: {
      defaultDuration: 10, // seconds
    },

    audio: {
      sampleRate: 44100,
      bitDepth: 24,
      channels: 1,
      bufferSize: 8192,
      maxRecordingDuration: 300, // 5 minutes
      scheduleDelay: 0.1, // seconds
      recordingBufferSize: 4096, // Buffer size for recording processor
      recordingLatencyCompensation: 0.02, // Additional latency compensation in seconds
      maxFileUploadDuration: 900, // 15 minutes
    },

    recording:{
      defaultLatencyCompensation: 15, // Additional latency compensation in ms
    },
    
    ui: {
      updateInterval: 20, // ms
      meterUpdateInterval: 60, // ms
      zoomLevels: { min: 1, max: 10, step: 0.1 },
      // Pixel-delta multiplier for Ctrl+wheel / trackpad pinch timeline zoom.
      // Higher = faster zoom; tuned for frequent small trackpad pinch deltas.
      wheelZoomSensitivity: 0.012,
      // Clamp a single wheel event so large mouse-wheel ticks don't jump too far.
      wheelZoomMaxDelta: 40,
      gridSnapThreshold: 5, // pixels
      regionRenderBuffer: 200, // pixels beyond the visible DAW viewport
      // Right-edge hover zone for crop (bottom) / loop (top) handles
      loopHandleZonePx: 15,
      // After recording, snap region start/end to nearby beat gridlines within this window
      recordSnapThresholdMs: 40,
    },
    
    metronome: {
      defaultBPM: 120,
      defaultVolume: 0.7,
      clickDuration: 0.05, // seconds
      highClickFrequency: 1600, // Hz for downbeat
      lowClickFrequency: 900, // Hz for other beats
      highClickDecay: 5, // Decay factor for high click
      lowClickDecay: 10, // Decay factor for low click
      scheduleInterval: 100, // ms between scheduling checks
      lookAheadMeasures: 2, // Number of measures to schedule ahead
      defaultTimeSignature: '4/4',
      defaultOffset: 0, // Default offset as percentage of measure
    },

    timeSignature: {
      options: ['4/4', '3/4', '2/4', '2/2', '6/8', '9/8', '12/8', '5/4', '7/8', '3/8'],
    },
    
    effects: {
      enabled: false,
      defaultChain: ['eq', 'compressor'],
    },
    
    collaboration: {
      enabled: false,
      realTimeSync: false,
    },

    segments: {
      lookAheadWindow: 0.1, // seconds
      segmentDuration: 2, // seconds
      crossfadeDuration: 0.01, // seconds
      scheduleInterval: 50, // ms
      maxConcurrentSegments: 50,
      segmentOverlapThreshold: 0.1, // seconds
    },

    logging: {
      eventBus: false,
    },

    singleTrackDAW: {
      dawDurationExtensionLookahead: 2, // seconds
    }
};

// Environment-specific overrides
if (process.env.NODE_ENV === 'development') {
    DAWConfig.audio.sampleRate = 44100; // Lower for testing
    DAWConfig.ui.updateInterval = 50; // Slower updates
}

export default DAWConfig;