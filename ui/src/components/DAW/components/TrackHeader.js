'use client';

import { useState, useEffect, useRef } from 'react';
import { useDAW } from '../DAWContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMicrophone, faHeadphones } from '@fortawesome/free-solid-svg-icons';
import styles from './TrackHeader.module.css';
import { eventBus } from '../EventBus';
import { DAW_EVENTS } from '../DAWEvents';

export default function TrackHeader({
  track
}) {
  const [faderValue, setFaderValue] = useState(0.8);
  const [isDraggingFader, setIsDraggingFader] = useState(false);
  const faderRef = useRef(null);

  const [isSolo, setIsSolo] = useState(false);
  const { isPlaying, isRecording } = useDAW();

  const [meterLevel, setMeterLevel] = useState(-60);
  const meterAnimationFrameRef = useRef(null);

  // Initialize fader value from track gain
  useEffect(() => {
    if (track && track.gain !== undefined) {
      setFaderValue(track.gain);
    }
  }, [track]);

  // Helper function to convert dB to meter width percentage
  const dbToPercent = (db) => {
    // Map -60dB to 0% and 0dB to 100%
    return Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
  };

  // Helper function to get meter color based on level
  const getMeterColor = (db) => {
    if (db > -6) return '#ff3b30'; // Red for high levels
    if (db > -12) return '#ff9500'; // Orange for medium-high levels
    if (db > -24) return '#34c759'; // Green for good levels
    return '#007aff'; // Blue for low levels
  };

  // Function to start the meter animation loop
  const startMeterAnimation = () => {
    // Use time-based throttling instead of frame counting
    let lastUpdateTime = 0;
    // Update interval in milliseconds (higher = less frequent updates)
    const updateInterval = 60; // Update every 60ms
    
    const updateMeter = () => {
      const currentTime = performance.now();
      const timeSinceLastUpdate = currentTime - lastUpdateTime;
      
      // Only process meter updates if enough time has passed
      if (timeSinceLastUpdate >= updateInterval) {
        lastUpdateTime = currentTime;
        
        // Get analyzer from track
        const analyzer = track?.getAnalyzer();
        
        if (analyzer && isPlaying && !isSolo) {
          const dataArray = new Uint8Array(analyzer.frequencyBinCount);
          analyzer.getByteFrequencyData(dataArray);
          
          // Calculate RMS value
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += (dataArray[i] / 255.0) ** 2;
          }
          const rms = Math.sqrt(sum / dataArray.length);
          
          // Convert to dB (with a floor of -60dB)
          const db = rms > 0 ? 20 * Math.log10(rms) : -60;
          setMeterLevel(Math.max(-60, db));
        } else if (!isPlaying) {
          // Gradually decrease level when not playing
          setMeterLevel(prevLevel => Math.max(-60, prevLevel - 3));
        }
      }
      
      meterAnimationFrameRef.current = requestAnimationFrame(updateMeter);
    };
    
    meterAnimationFrameRef.current = requestAnimationFrame(updateMeter);
  };

  // Start meter animation when component mounts
  useEffect(() => {
    startMeterAnimation();
    
    // Cleanup function
    return () => {
      if (meterAnimationFrameRef.current) {
        cancelAnimationFrame(meterAnimationFrameRef.current);
      }
    };
  }, [track, isPlaying, isSolo]);

  const handleFaderMouseDown = (e) => {
    e.stopPropagation();
    setIsDraggingFader(true);
  };

  // Mouse event handlers
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDraggingFader) return;

      // Get container for mouse position calculation
      const container = faderRef.current?.parentElement;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const mousePos = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));

      // Calculate the new gain value (0 to 1 range)
      const faderRect = faderRef.current.getBoundingClientRect();
      const newMousePos = Math.max(0, Math.min(100, ((e.clientX - faderRect.left) / faderRect.width) * 100));
      const newGain = Math.min(1, Math.max(0, newMousePos / 100));
      setFaderValue(newGain);
    };

    const handleMouseUp = (e) => {
      e.stopPropagation();
      setIsDraggingFader(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingFader]);

  const handleSoloClick = (e) => {
    e.stopPropagation();
    setIsSolo(prev => !prev);
  };

  useEffect(() => {
    eventBus.emit(DAW_EVENTS.TRACK.SOLO, { trackId: track.id, isSolo: isSolo });
  }, [isSolo]);

  // Listen for solo events from other tracks
  useEffect(() => {
    const handleSoloEvent = (data) => {
      const { trackId, isSolo } = data;
      
      // If another track is being soloed and this track is currently soloed
      if (trackId !== track.id && isSolo) {
        setIsSolo(false);
      }
    };

    eventBus.on(DAW_EVENTS.TRACK.SOLO, handleSoloEvent);

    return () => {
      eventBus.off(DAW_EVENTS.TRACK.SOLO, handleSoloEvent);
    };
  }, [track.id]);

  useEffect(() => {
    eventBus.emit(DAW_EVENTS.TRACK.VOLUME_CHANGE, { trackId: track.id, volume: faderValue });
  }, [faderValue]);

  return (
    <div className={styles.trackHeader}>
      <span className={styles.trackName}>{track.name || 'Track ' + (track.id || 1)}</span>
      
      <button 
        className={`${styles.soloButton} ${isSolo ? styles.active : ''}`}
        onClick={handleSoloClick}
        title="Solo track"
      >
        <FontAwesomeIcon icon={faHeadphones} />
        <span>Solo</span>
      </button>
      
      {isRecording && !track.readonly && (
        <div className={styles.recordingIndicator}>
          <FontAwesomeIcon icon={faMicrophone} />
          <span>Recording</span>
        </div>
      )}
      
      {/* Audio Meter */}
      <div 
        className={styles.audioMeterContainer} 
        ref={faderRef}
      >
        <div 
          className={styles.audioMeterBar} 
          style={{ 
            width: `${dbToPercent(meterLevel)}%`,
            backgroundColor: getMeterColor(meterLevel)
          }}
        ></div>
        
        {/* Fader handle - only shown if not recording and there's a track to control */}
        {!isRecording && track && (
          <>
            <div 
              className={`${styles.faderHandle} ${isDraggingFader ? styles.dragging : ''}`}
              style={{ 
                left: `${faderValue * 100}%`,
                backgroundColor: isDraggingFader ? 'var(--seafoam)' : 'rgba(255, 255, 255, 0.7)'
              }}
              onMouseDown={handleFaderMouseDown}
              title={`Volume: ${Math.round(faderValue * 100)}%`}
            ></div>
            <div className={styles.volumeIndicator} style={{ left: `${faderValue * 100}%` }}>
              {Math.round(faderValue * 100)}%
            </div>
          </>
        )}
      </div>
    </div>
  );
} 