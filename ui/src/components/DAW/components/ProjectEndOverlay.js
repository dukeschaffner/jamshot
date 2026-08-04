'use client';

import { useState, useRef, useEffect } from 'react';
import { useDAW } from '../DAWContext';
import { eventBus } from '../misc/EventBus';
import { DAW_EVENTS } from '../misc/DAWEvents';
import { snapToGrid } from '../misc/DAWUtils';
import styles from './ProjectEndOverlay.module.css';
import DAWConfig from '../misc/DAWConfig';

export default function ProjectEndOverlay({ containerRef, duration, canEdit = true }) {
  const { gridLines, tracksContainerWidth } = useDAW();
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState(null);
  const [snapToGridEnabled, setSnapToGridEnabled] = useState(true);
  const overlayRef = useRef(null);
  const startXRef = useRef(0);
  const startDurationRef = useRef(0);
  const musicGridLinesRef = useRef([]);
  const tracksContainerWidthRef = useRef(0);

  // Update grid lines ref when gridLines change
  useEffect(() => {
    musicGridLinesRef.current = gridLines;
  }, [gridLines]);

  // Update container width ref when tracksContainerWidth changes
  useEffect(() => {
    tracksContainerWidthRef.current = tracksContainerWidth;
  }, [tracksContainerWidth]);

  // Listen for snap-to-grid changes
  useEffect(() => {
    const handleSnapToGridChange = (data) => {
      setSnapToGridEnabled(data.snapToGridEnabled);
    };

    eventBus.on(DAW_EVENTS.AUDIO_SETTINGS.SNAP_TO_GRID_CHANGE, handleSnapToGridChange);

    return () => {
      eventBus.off(DAW_EVENTS.AUDIO_SETTINGS.SNAP_TO_GRID_CHANGE, handleSnapToGridChange);
    };
  }, []);

  // Convert mouse position to time duration with snap-to-grid
  const positionToDuration = (mouseX) => {
    if (!containerRef?.current) return duration;

    const containerRect = containerRef.current.getBoundingClientRect();
    const relativeX = mouseX - containerRect.left;
    const containerWidth = containerRect.width;

    // Convert position to percentage (0-100)
    let positionPercentage = (relativeX / containerWidth) * 100;

    // Apply snap-to-grid to the position percentage
    const snappedPositionPercentage = snapToGrid(
      positionPercentage,
      snapToGridEnabled,
      duration,
      musicGridLinesRef.current,
      tracksContainerWidthRef.current,
      DAWConfig.ui.gridSnapThreshold
    );

    // Convert snapped position back to duration
    let newDuration = (snappedPositionPercentage / 100) * duration;
    if(newDuration > duration) {
        newDuration = duration + 30;
    }
    newDuration = Math.min(Math.max(1, newDuration), DAWConfig.audio.maxRecordingDuration);
    return newDuration;
  };

  const handleMouseDown = (e) => {
    if (!canEdit) return;
    e.preventDefault();
    e.stopPropagation();
    
    setIsDragging(true);
    startXRef.current = e.clientX;
    startDurationRef.current = duration;
  };

  // Cleanup on unmount
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e) => {
        if (!isDragging || !containerRef?.current) return;

        const containerRect = containerRef.current.getBoundingClientRect();
        const relativeX = e.clientX - containerRect.left;

        // Constrain to container bounds
        const constrainedX = Math.max(0, Math.min(relativeX, containerRect.width - 2));

        // Apply snap-to-grid for visual feedback
        const snappedDuration = positionToDuration(e.clientX);
        const snappedX = (snappedDuration / duration) * containerRect.width;
        const finalX = Math.max(0, Math.min(snappedX, containerRect.width - 2));

        setDragPosition(finalX);
    };
    
    const handleMouseUp = (e) => {
        if (!isDragging) return;
        
        setIsDragging(false);
        setDragPosition(null);
        
        // Calculate new duration based on final position
        const newDuration = positionToDuration(e.clientX);
        
        // Emit duration change event
        eventBus.emit(DAW_EVENTS.PLAYBACK.DURATION_CHANGE, { duration: newDuration });
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const overlayStyle = {
    left: isDragging && dragPosition !== null ? `${dragPosition}px` : `calc(100% - 2px)`,
    transition: isDragging ? 'none' : 'left 0.2s ease'
  };

  const overlayBackgroundStyle = {
    left: isDragging && dragPosition !== null ? `${dragPosition}px` : `calc(100% - 2px)`,
    transition: isDragging ? 'none' : 'all 0.2s ease'
  };

  return (
    <>
      {/* Transparent overlay background when dragging */}
      <div 
        className={`${styles.projectEndOverlayBackground} ${isDragging ? styles.dragging : ''}`}
        style={overlayBackgroundStyle} 
      />
      
      {/* Draggable line */}
      <div
        ref={overlayRef}
        className={`${styles.projectEndOverlay} ${isDragging ? styles.dragging : ''}`}
        style={{
          ...overlayStyle,
          cursor: canEdit ? undefined : 'default',
        }}
        onMouseDown={handleMouseDown}
        title={canEdit ? 'Drag to set project end' : 'Editor access required to change duration'}
      />
    </>
  );
}
