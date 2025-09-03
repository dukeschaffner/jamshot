'use client';

import { useState, useEffect, useRef } from 'react';
import styles from './MusicalGrid.module.css';
import { useDAW } from '../DAWContext';
import { eventBus } from '../misc/EventBus';
import { DAW_EVENTS } from '../misc/DAWEvents';

function MusicalGrid() {
  const { isPlaying, metronomeOffset, timeSignature, metronomeBpm, duration } = useDAW();

  const [isDraggingOffset, setIsDraggingOffset] = useState(false);
  const offsetHandleRef = useRef(null);

  // Calculate seconds per beat and measure
  const beatsPerMeasure = parseInt(timeSignature.split('/')[0], 10);
  const secondsPerBeat = 60 / metronomeBpm;
  const secondsPerMeasure = secondsPerBeat * beatsPerMeasure;
  
  // Calculate offset position in percentage
  const offsetSeconds = metronomeOffset * secondsPerMeasure;
  const offsetPosition = (offsetSeconds / duration) * 100;

  const [gridLines, setGridLines] = useState([]);

  const height = 500;

  // Generate musical grid lines
  useEffect(() => {
  const generateGridLines = () => {
    if(!timeSignature || !metronomeBpm || !duration || !secondsPerMeasure) return [];
    
    const gridLines = [];
    const offsetSeconds = metronomeOffset * secondsPerMeasure;
    
    // Calculate how many measures fit in the track
    const totalMeasures = Math.ceil((duration - offsetSeconds) / secondsPerMeasure);
    
    // Generate measure lines (strong grid lines)
    for (let measure = 0; measure <= totalMeasures; measure++) {
      const measureTime = measure * secondsPerMeasure + offsetSeconds;
      if (measureTime <= duration) {
        const position = (measureTime / duration) * 100;
        gridLines.push({
          type: 'measure',
          position,
          time: measureTime,
          measure: measure + 1
        });
      }
    }

    // Calculate beat positions
    const startBeat = beatsPerMeasure - Math.floor(offsetSeconds / secondsPerBeat);
    const startBeatOffset = offsetSeconds % secondsPerBeat;
    const endBeat = startBeat + Math.floor((duration - startBeatOffset) / secondsPerBeat);
    
    // Generate beat lines (weaker grid lines)
    for (let beat = startBeat; beat <= endBeat; beat++) {
      // Skip beats that fall on measure boundaries (already covered by measure lines)
      if (beat % beatsPerMeasure !== 0) {
        const beatTime = (beat - startBeat) * secondsPerBeat + startBeatOffset;
        if (beatTime <= duration) {
          const position = (beatTime / duration) * 100;
          gridLines.push({
            type: 'beat',
            position,
            time: beatTime,
            beat: (beat % beatsPerMeasure) + 1
          });
        }
      }
    }
      return gridLines;
    };

    const newGridLines = generateGridLines();
    setGridLines(newGridLines);
    
    eventBus.emit(DAW_EVENTS.GRID.LINES_UPDATE, { gridLines: newGridLines });
  }, [metronomeBpm, timeSignature, metronomeOffset, duration, secondsPerMeasure]);

  // Handle metronome offset dragging
  const handleOffsetMouseDown = (e) => {
    e.stopPropagation();
    if (isPlaying) return;
    setIsDraggingOffset(true);
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDraggingOffset || !offsetHandleRef.current) return;
      
      const rect = offsetHandleRef.current.parentElement.getBoundingClientRect();
      const mousePos = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      
      // Limit the drag to be within 0% and one measure
      const measurePosition = (secondsPerMeasure / duration) * 100;
      const newOffsetPos = Math.max(0, Math.min(measurePosition, mousePos));
      
      // Convert position back to offset percentage
      const offsetPercent = Math.min(Math.max(parseFloat(newOffsetPos / measurePosition), 0), 1);
      
      eventBus.emit(DAW_EVENTS.METRONOME.OFFSET_CHANGE, {offset: offsetPercent});
    };
    
    const handleMouseUp = () => {
      setIsDraggingOffset(false);
    };
    
    if (isDraggingOffset) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingOffset, secondsPerMeasure, duration]);

  return (
    <div className={styles.musicalGrid} style={{ height: `${height}px` }}>
      {/* Metronome offset handle */}
      <div 
        className={styles.metronomeOffsetHandle}
        ref={offsetHandleRef}
        style={{ 
          left: `${offsetPosition}%`,
          cursor: isPlaying ? 'not-allowed' : 'ew-resize',
          opacity: isDraggingOffset ? 1 : 0.8
        }}
        onMouseDown={handleOffsetMouseDown}
        title={`Metronome offset: ${Math.round(metronomeOffset * 100)}%`}
      />
      
      {/* Grid lines */}
      {gridLines.map((line, index) => (
        <div
          key={`${line.type}-${index}`}
          className={`${styles.gridLine} ${styles[line.type + 'Line']}`}
          style={{ left: `${line.position}%` }}
          title={line.type === 'measure' ? `Measure ${line.measure}` : `Beat ${line.beat}`}
        />
      ))}
    </div>
  );
}

export default MusicalGrid; 