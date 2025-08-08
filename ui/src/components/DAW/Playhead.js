'use client';

import { useState, useRef, useEffect } from 'react';
import { useDAW } from './DAWContext';
import { eventBus } from './EventBus';
import { DAW_EVENTS } from './DAWEvents';
import styles from './DAW.module.css';

function Playhead({}) {
  const { playheadLocation, setViewportOffsetValue, duration} = useDAW();
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);


  // Handle mouse down on playhead
  const handleMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsDragging(true);
    console.log('playhead mouse down');
    
    // Emit drag start event
    eventBus.emit(DAW_EVENTS.UI.PLAYHEAD_DRAG_START, { time: playheadLocation.time });
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
        if(!isDragging) return;

        const rect = containerRef.current.getBoundingClientRect();
        let time = (e.clientX - rect.left) / rect.width * duration;
        if (time < 0) {
          time = 0;
        } else if (time > duration) {
          time = duration;
        }
        console.log('time', time);
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
  }, [isDragging]);

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