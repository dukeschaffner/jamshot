'use client';

import { useState, useEffect, useRef } from 'react';
import { useDAW, DAWProvider } from './DAWContext';
import { eventBus } from './EventBus';
import { DAW_EVENTS } from './DAWEvents';
import WaveSurferWaveform from './WaveSurferWaveform';
import api from '../../lib/api';
import TransportControls from './components/TransportControls';
import styles from './DAW.module.css';

function DAWContent({ track }) {
  const { 
    trackManagerRef, 
    audioEngineRef, 
    isLoading, 
    error, 
    tracks,
    isPlaying,
    isRecording,
    playheadLocation,
    metronomeBpm,
    timeSignature,
    duration,
  } = useDAW();

  // Show loading state
  if (isLoading) {
    return (
      <div className={styles.dawContainer}>
        <div>Loading DAW...</div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className={styles.dawContainer}>
        <div>Error: {error}</div>
      </div>
    );
  }

  return (
    <div className={styles.dawContainer}>
        <TransportControls
          isRecording={isRecording}
          isPlaying={isPlaying}
          metronomeBpm={metronomeBpm}
          timeSignature={timeSignature}
        />
        <div className="transport-controls">
          
          <div className="time-display">
            {formatTime(playheadLocation.time)}
          </div>
        </div>
      
      <div className={styles.dawBody}>
        <div className="timeline">
          {/* Timeline content will go here */}
        </div>
        
        <div className="tracks-container">
          {tracks.length > 0 && (
            <div>
              <h3 style={{ marginBottom: '12px', color: '#ccc', fontSize: '14px' }}>
                Waveform Display
              </h3>
              <WaveSurferWaveform
                track={tracks[0]}
                height={200}
                waveColor="#93e9be"
                progressColor="#007acc"
                cursorColor="#ff6b6b"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper function to format time
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Main DAW component that provides the context
function DAW({ track }) {
  // Convert track data to the format expected by DAWContext
  const trackData = track ? [track] : [];
  
  return (
    <DAWProvider trackData={trackData}>
      <DAWContent track={track} />
    </DAWProvider>
  );
}

export default DAW;