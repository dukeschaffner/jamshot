// DAWConfig.js - Centralized configuration
const DAWConfig = {
    audio: {
      sampleRate: 48000,
      bitDepth: 24,
      channels: 1,
      bufferSize: 8192,
      maxRecordingDuration: 300, // 5 minutes
      scheduleDelay: 0.1, // seconds
      recordingBufferSize: 4096, // Buffer size for recording processor
      recordingLatencyCompensation: 0.02, // Additional latency compensation in seconds
      maxFileUploadDuration: 900, // 15 minutes
    },
    
    ui: {
      updateInterval: 20, // ms
      meterUpdateInterval: 60, // ms
      zoomLevels: { min: 1, max: 10, step: 0.1 },
      gridSnapThreshold: 0.1,
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
    }
};

// Environment-specific overrides
if (process.env.NODE_ENV === 'development') {
    DAWConfig.audio.sampleRate = 44100; // Lower for testing
    DAWConfig.ui.updateInterval = 50; // Slower updates
}

export default DAWConfig;