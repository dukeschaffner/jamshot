// DAWConfig.js - Centralized configuration
const DAWConfig = {
    audio: {
      sampleRate: 48000,
      bitDepth: 24,
      channels: 1,
      bufferSize: 8192,
      maxRecordingDuration: 300, // 5 minutes
      scheduleDelay: 0.1, // seconds
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
    },
    
    effects: {
      enabled: false,
      defaultChain: ['eq', 'compressor'],
    },
    
    collaboration: {
      enabled: false,
      realTimeSync: false,
    }
};

// Environment-specific overrides
if (process.env.NODE_ENV === 'development') {
    DAWConfig.audio.sampleRate = 44100; // Lower for testing
    DAWConfig.ui.updateInterval = 50; // Slower updates
}

export default DAWConfig;