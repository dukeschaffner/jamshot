'use client';

import { useState, useRef, useEffect } from 'react';
import { eventBus } from '../misc/EventBus';
import { DAW_EVENTS } from '../misc/DAWEvents';
import styles from './ProjectEndOverlay.module.css';
import DAWConfig from '../misc/DAWConfig';

export default function ProjectEndOverlay({ containerRef, duration}) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState(null);
  const overlayRef = useRef(null);
  const startXRef = useRef(0);
  const startDurationRef = useRef(0);


  // Convert mouse position to time duration
  const positionToDuration = (mouseX) => {
    if (!containerRef?.current) return duration;
    
    const containerRect = containerRef.current.getBoundingClientRect();
    const relativeX = mouseX - containerRect.left;
    const containerWidth = containerRect.width;
    
    // Convert position to duration (assuming linear scaling)
    let newDuration = (relativeX / containerWidth) * (duration);
    if(newDuration > duration) {
        newDuration = duration + 30;
    }
    newDuration = Math.min(Math.max(1, newDuration), DAWConfig.audio.maxRecordingDuration);
    return newDuration;
  };

  const handleMouseDown = (e) => {
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
        setDragPosition(constrainedX);
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
        style={overlayStyle}
        onMouseDown={handleMouseDown}
        title="Drag to set project end"
      />
    </>
  );
}
