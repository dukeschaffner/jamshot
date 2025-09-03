'use client';

import { useState, useEffect, useRef } from 'react';
import { useDAW, DAWProvider } from './DAWContext';
import { eventBus } from './misc/EventBus';
import { DAW_EVENTS } from './misc/DAWEvents';
import Waveform from './components/Region';
import Playhead from './components/Playhead';
import api from '../../lib/api';
import TransportControls from './components/TransportControls';
import ZoomSlider from './components/ZoomSlider';
import styles from './DAW.module.css';
import Track from './components/Track';
import Looper from './components/Looper';
import TrackHeader from './components/TrackHeader';
import MusicalGrid from './components/MusicalGrid';
import Takes from './components/Takes';

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
    metronomeOffset,
    duration,
    zoom,
    setZoomLevel,
    scrollLeft,
    setScrollLeftValue,
    tracksContainerWidth,
    setTracksContainerWidth,
  } = useDAW();

  const tracksAndTimelineRef = useRef(null);
  const tracksScrollContainerRef = useRef(null);
  const tracksContainerRef = useRef(null);

  // Add keyboard event listener for space and enter keys
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if user is typing in an input field, textarea, or contentEditable element
      if (
        e.target.tagName === 'INPUT' || 
        e.target.tagName === 'TEXTAREA' || 
        e.target.isContentEditable
      ) {
        return;
      }

      // Handle space key for play/pause
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault(); // Prevent space from scrolling the page
        
        if (isRecording) {
          // Stop recording if currently recording
          eventBus.emit(DAW_EVENTS.RECORDING.STOP);
        } else {
          // Toggle play/pause
          if (isPlaying) {
            eventBus.emit(DAW_EVENTS.TRANSPORT.PAUSE);
          } else {
            eventBus.emit(DAW_EVENTS.TRANSPORT.PLAY);
          }
        }
      }
      // Handle enter key for seek to time 0
      else if (e.code === 'Enter' || e.key === 'Enter') {
        e.preventDefault();
        eventBus.emit(DAW_EVENTS.TRANSPORT.SEEK, { time: 0 });
      }
    };

    // Add event listener to the window
    window.addEventListener('keydown', handleKeyDown);

    // Clean up the event listener when component unmounts
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPlaying, isRecording]); // Include dependencies

  const handleTimelineClick = (e) => {
    e.stopPropagation();
    if (isRecording) return;
    const rect = tracksAndTimelineRef.current.getBoundingClientRect();
    const time = (e.clientX - rect.left) / rect.width * duration;
    eventBus.emit(DAW_EVENTS.TRANSPORT.SEEK, { time: time });
  };

  const handleMetronomeOffsetChange = (newOffset) => {
    eventBus.emit(DAW_EVENTS.METRONOME.OFFSET_CHANGE, { offset: newOffset });
  };

  // Listen to track rect width changes
  useEffect(() => {
    if (!tracksContainerRef?.current) return;

    const updateTrackRectWidth = () => {
      if (tracksContainerRef.current) {
        const rect = tracksContainerRef.current.getBoundingClientRect();
        setTracksContainerWidth(rect.width);
      }
    };

    // Initial measurement
    updateTrackRectWidth();

    // Set up ResizeObserver to watch for width changes
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setTracksContainerWidth(entry.contentRect.width);
      }
    });

    resizeObserver.observe(tracksContainerRef.current);

    // Cleanup
    return () => {
      if (tracksContainerRef.current) {
        resizeObserver.unobserve(tracksContainerRef.current);
      }
      resizeObserver.disconnect();
    };
  }, [tracksContainerRef.current]);

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
        <div className={styles.tracks}>
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
                  <MusicalGrid
                    bpm={metronomeBpm}
                    timeSignature={timeSignature}
                    duration={duration}
                    metronomeOffset={metronomeOffset}
                    onMetronomeOffsetChange={handleMetronomeOffsetChange}
                    isPlaying={isPlaying}
                    zoom={zoom}
                  />
                  <Looper/>
                </div>
                <div className={styles.tracksContainer} ref={tracksContainerRef}>
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
        
        {/* Takes Component */}
        <Takes />
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