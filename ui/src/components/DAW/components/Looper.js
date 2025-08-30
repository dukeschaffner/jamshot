'use client';

import { useState, useEffect, useRef } from 'react';
import styles from './Looper.module.css';
import { useDAW } from '../DAWContext';
import { eventBus } from '../misc/EventBus';
import { DAW_EVENTS } from '../misc/DAWEvents';

export default function Looper({
  snapToGridEnabled = false
}) {

  const { isPlaying, isRecording, duration, bpm, timeSignature } = useDAW();
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

  // Refs for DOM elements
  const looperRef = useRef(null);
  const leftHandleRef = useRef(null);
  const rightHandleRef = useRef(null);
  const regionRef = useRef(null);

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
    if (isPlaying || isRecording) return;
    setIsDraggingLeft(true);
  };

  const handleRightMouseDown = (e) => {
    e.stopPropagation();
    if (isPlaying || isRecording) return;
    setIsDraggingRight(true);
  };

  const handleRegionMouseDown = (e) => {
    e.stopPropagation();
    if (isPlaying || isRecording) return;
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
        setLooperLeftPos(newLeftPos);
      }

      // Dragging right handle
      if (isDraggingRight) {
        const newRightPos = Math.max(looperLeftPos + 5, Math.min(100, mousePos));
        setLooperRightPos(newRightPos);
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
        // const snappedLeftPos = snapToGridFn(newLeftPos);
        // const snappedRightPos = snapToGridFn(newRightPos);

        setLooperLeftPos(newLeftPos);
        setLooperRightPos(newRightPos);
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
    style={{ left: `${looperLeftPos}%`, width: `${looperRightPos - looperLeftPos}%`, cursor: isPlaying || isRecording ? 'not-allowed' : 'grab' }}
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