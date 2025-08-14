'use client';

import { useState, useEffect, useRef } from 'react';
import { useDAW, DAWProvider } from './DAWContext';
import { eventBus } from './EventBus';
import { DAW_EVENTS } from './DAWEvents';
import Waveform from './waveform/Waveform';
import Playhead from './Playhead';
import api from '../../lib/api';
import TransportControls from './components/TransportControls';
import ZoomSlider from './components/ZoomSlider';
import styles from './DAW.module.css';
import Track from './components/Track';
import Looper from './components/Looper';
import TrackHeader from './components/TrackHeader';

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
    zoom,
    setZoomLevel,
    scrollLeft,
    setScrollLeftValue
  } = useDAW();

  const tracksAndTimelineRef = useRef(null);
  const tracksScrollContainerRef = useRef(null);

  const handleTimelineClick = (e) => {
    e.stopPropagation();
    if (isRecording) return;
    const rect = tracksAndTimelineRef.current.getBoundingClientRect();
    const time = (e.clientX - rect.left) / rect.width * duration;
    eventBus.emit(DAW_EVENTS.TRANSPORT.SEEK, { time: time });
  };

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
        <div className={styles.dawControls}>
          <TransportControls
            isRecording={isRecording}
            isPlaying={isPlaying}
            metronomeBpm={metronomeBpm}
            timeSignature={timeSignature}
          />
          <ZoomSlider
            zoom={zoom}
            onZoomChange={setZoomLevel}
          />
        </div>
        <div className="transport-controls">
          
          <div className="time-display">
            {formatTime(playheadLocation.time)}
          </div>
        </div>
      
      <div className={styles.dawBody}>
        <div className={styles.tracksHeaders}>
          {tracks.map((track, index) => (
            <TrackHeader key={index} track={track}/>
          ))}
        </div>
        <div 
          className={styles.tracksScrollContainer} 
          onScroll={(e) => setScrollLeftValue(e.currentTarget.scrollLeft)} 
          ref={tracksScrollContainerRef}
        >
          {tracks.length > 0 && (
            <>
              <div 
                className={styles.tracksAndTimelineContainer}
                ref={tracksAndTimelineRef}
                onClick={handleTimelineClick}
                style={{
                  width: `${Math.max(100, zoom * 100)}%`,
                  minWidth: `${Math.max(100, zoom * 100)}%`,
                }}
              >
                <div className={styles.timeline}>
                  <Looper/>
                </div>
                <div className={styles.tracksContainer}>
                  {tracks.map((track, index) => (
                    <Track key={index} track={track} tracksScrollContainerRef={tracksScrollContainerRef}/>
                  ))}
                  <Playhead/>
                </div>
                
              </div>
              {zoom > 1 && (
                <div className={styles.zoomIndicator}>
                  Zoom: {zoom.toFixed(1)}x
                </div>
              )}
            </>
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