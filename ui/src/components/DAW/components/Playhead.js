'use client';

import { useState, useRef, useEffect } from 'react';
import { useDAW } from '../DAWContext';
import { eventBus } from '../misc/EventBus';
import { DAW_EVENTS } from '../misc/DAWEvents';
import { snapToGrid } from '../misc/DAWUtils';
import styles from '../DAW.module.css';

function Playhead({}) {
  const { playheadLocation, setViewportOffsetValue, duration, gridLines, tracksContainerWidth, snapStrength} = useDAW();
  const [isDragging, setIsDragging] = useState(false);
  const [snapToGridEnabled, setSnapToGridEnabled] = useState(true);
  const containerRef = useRef(null);

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


  // Handle mouse down on playhead
  const handleMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsDragging(true);
    
    // Emit drag start event
    eventBus.emit(DAW_EVENTS.UI.PLAYHEAD_DRAG_START, { time: playheadLocation.time });
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
        if(!isDragging) return;

        const rect = containerRef.current.getBoundingClientRect();
        let positionPercentage = (e.clientX - rect.left) / rect.width * 100;
        if (positionPercentage < 0) {
          positionPercentage = 0;
        } else if (positionPercentage > 100) {
          positionPercentage = 100;
        }

        // Apply grid snapping
        const snappedPosition = snapToGrid(positionPercentage, snapToGridEnabled, duration, gridLines, tracksContainerWidth, snapStrength);

        // Convert back to time
        const time = (snappedPosition / 100) * duration;
        eventBus.emit(DAW_EVENTS.TRANSPORT.SEEK, { time: time });
    }

      // Handle mouse up to end drag
    const handleMouseUp = () => {
        if (!isDragging) return;
        
        setIsDragging(false);
        
        // Remove global event listeners
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        
        // Emit drag end event
        eventBus.emit(DAW_EVENTS.UI.PLAYHEAD_DRAG_END, { time: playheadLocation.time });
    };

    // Add global mouse event listeners
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, snapToGridEnabled, duration, gridLines, tracksContainerWidth, snapStrength]);

  return (
    <div 
      ref={containerRef}
      className={styles.playheadContainer}
    >
      <div 
        className={`${styles.playhead} ${isDragging ? styles.playheadDragging : ''}`}
        style={{ 
          left: `${playheadLocation.position}%`,
          height: '100%'
        }}
        onMouseDown={handleMouseDown}
      />
    </div>
  );
}

export default Playhead; 