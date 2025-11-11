'use client';

import { useState, useEffect, useRef } from 'react';
import styles from './Looper.module.css';
import { useDAW } from '../DAWContext';
import { eventBus } from '../misc/EventBus';
import { DAW_EVENTS } from '../misc/DAWEvents';
import { timeToPos } from '../misc/DAWUtils';
import DAWConfig from '../misc/DAWConfig';


export default function Looper() {

  const { isPlaying, isRecording, duration, metronomeBpm, tracksContainerWidth, gridLines } = useDAW();
  
  const [isLooping, setIsLooping] = useState(false);
  // Internal state for dragging
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);
  const [isDraggingRegion, setIsDraggingRegion] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [regionWidth, setRegionWidth] = useState(0);
  const [regionStartLeft, setRegionStartLeft] = useState(0);

  const [looperLeftPos, setLooperLeftPos] = useState(0);
  const [looperRightPos, setLooperRightPos] = useState(100);

  // Grid-related state
  const [snapToGridEnabled, setSnapToGridEnabled] = useState(true);
  const musicGridLinesRef = useRef([]);

  // Refs for DOM elements
  const looperRef = useRef(null);
  const leftHandleRef = useRef(null);
  const rightHandleRef = useRef(null);
  const regionRef = useRef(null);

  // Grid snapping constants
  const tracksContainerWidthRef = useRef(0);

  useEffect(() => {
    musicGridLinesRef.current = gridLines;
  }, [gridLines]);

  // Event listeners for grid updates
  useEffect(() => {
    const handleSnapToGridChange = (data) => {
      setSnapToGridEnabled(data.snapToGridEnabled);
    };

    // Listen for grid snap toggle events
    eventBus.on(DAW_EVENTS.AUDIO_SETTINGS.SNAP_TO_GRID_CHANGE, handleSnapToGridChange);

    return () => {
      eventBus.off(DAW_EVENTS.AUDIO_SETTINGS.SNAP_TO_GRID_CHANGE, handleSnapToGridChange);
    };
  }, []);

  useEffect(() => {
    tracksContainerWidthRef.current = tracksContainerWidth;
  }, [tracksContainerWidth]);


  // Snap to grid function
  const snapToGrid = (value) => {
    if (snapToGridEnabled && metronomeBpm && duration && duration > 0) {
      // If grid lines aren't generated yet, return the original value
      if (!musicGridLinesRef.current || musicGridLinesRef.current.length === 0) {
        return value;
      }

      // Find the closest grid line
      let closestGridLine = value;
      let minDistance = Infinity;

      const secondsPerBeat = 60 / metronomeBpm;
      const beatWidthPos = timeToPos(secondsPerBeat, duration);
      
      for (const gridLine of musicGridLinesRef.current) {
        const distance = Math.abs(gridLine.position - value);
        if (distance < minDistance) {
          minDistance = distance;
          closestGridLine = gridLine;
        }
      }

      if(minDistance === Infinity) {
        return value;
      }

      const distancePx = minDistance * tracksContainerWidthRef.current / 100;

      // Only snap if the distance is less than the threshold
      if (distancePx <= DAWConfig.ui.gridSnapThreshold) {
        return closestGridLine.position;
      }
    }

    return value;
  };

  useEffect(() => {
    // Emit loop toggle event when enabling/disabling loop
    eventBus.emit(DAW_EVENTS.LOOP.TOGGLE, {
      isLooping: isLooping
    });
  }, [isLooping]);

  useEffect(() => {
    // Emit loop boundaries set event when enabling loop
    const loopStart = looperLeftPos / 100 * duration;
    const loopEnd = looperRightPos / 100 * duration;
    eventBus.emit(DAW_EVENTS.LOOP.BOUNDARIES_SET, {
      loopStart: loopStart,
      loopEnd: loopEnd
    });
  }, [looperLeftPos, looperRightPos, duration]);

  // Mouse down handlers
  const handleLeftMouseDown = (e) => {
    e.stopPropagation();
    setIsDraggingLeft(true);
  };

  const handleRightMouseDown = (e) => {
    e.stopPropagation();
    setIsDraggingRight(true);
  };

  const handleRegionMouseDown = (e) => {
    e.stopPropagation();
    setIsDraggingRegion(true);
    setDragStartX(e.clientX);
    setRegionWidth(looperRightPos - looperLeftPos);
    setRegionStartLeft(looperLeftPos);
  };

  // Mouse event handlers
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDraggingLeft && !isDraggingRight && !isDraggingRegion) return;

      // Get container for mouse position calculation
      const container = looperRef.current?.parentElement;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const mousePos = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));

      // Dragging left handle
      if (isDraggingLeft) {
        const newLeftPos = Math.max(0, Math.min(looperRightPos - 5, mousePos));
        const snappedLeftPos = snapToGrid(newLeftPos);
        setLooperLeftPos(snappedLeftPos);
      }

      // Dragging right handle
      if (isDraggingRight) {
        const newRightPos = Math.max(looperLeftPos + 5, Math.min(100, mousePos));
        const snappedRightPos = snapToGrid(newRightPos);
        setLooperRightPos(snappedRightPos);
      }

      // Dragging entire region
      if (isDraggingRegion) {
        const deltaX = e.clientX - dragStartX;
        const deltaPercent = (deltaX / rect.width) * 100;

        // Calculate new positions
        let newLeftPos = regionStartLeft + deltaPercent;
        let newRightPos = newLeftPos + regionWidth;

        // Ensure the looper stays within bounds
        if (newLeftPos < 0) {
          newLeftPos = 0;
          newRightPos = regionWidth;
        }

        if (newRightPos > 100) {
          newRightPos = 100;
          newLeftPos = 100 - regionWidth;
        }

        // Apply grid snapping
        const snappedLeftPos = snapToGrid(newLeftPos);
        const snappedRightPos = snapToGrid(newRightPos);

        setLooperLeftPos(snappedLeftPos);
        setLooperRightPos(snappedRightPos);
      }
    };

    const handleMouseUp = (e) => {
      e.stopPropagation();
      setIsDraggingLeft(false);
      setIsDraggingRight(false);
      setIsDraggingRegion(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    isDraggingLeft,
    isDraggingRight,
    isDraggingRegion,
    looperLeftPos,
    looperRightPos,
    dragStartX,
    regionStartLeft,
    regionWidth,
    isPlaying,
    isRecording
  ]);

  return (
    <div
    className={`${styles.looper} ${!isLooping ? styles.disabled : ''}`}
    ref={looperRef}
    style={{ left: `${looperLeftPos}%`, width: `${looperRightPos - looperLeftPos}%`, cursor: 'grab' }}
  >
    <div 
      className={`${styles.looperHandle} ${styles.left}`} 
      ref={leftHandleRef}
      onMouseDown={handleLeftMouseDown}
    ></div>
    <div 
      className={styles.looperRegion} 
      ref={regionRef}
      onClick={(e) => {
        e.stopPropagation();
        setIsLooping(prev => !prev);
      }}
      onMouseDown={handleRegionMouseDown}
    ></div>
    <div 
      className={`${styles.looperHandle} ${styles.right}`} 
      ref={rightHandleRef}
      onMouseDown={handleRightMouseDown}
    ></div>
  </div>
  );
} 