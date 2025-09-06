'use client';

import React from 'react';
import { useDAW } from '../DAWContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMusic, faClock } from '@fortawesome/free-solid-svg-icons';
import styles from './TimeDisplay.module.css';

const TimeDisplay = ({ className = '' }) => {
  const { 
    playheadLocation, 
    duration, 
    metronomeBpm,
    timeSignature 
  } = useDAW();

  // Format time as MM:SS
  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Format time as bars and beats
  const formatBarsBeats = (seconds) => {
    const [beatsPerBar] = timeSignature.split('/').map(Number);
    const beatsPerSecond = metronomeBpm / 60;
    const totalBeats = seconds * beatsPerSecond;
    
    const bars = Math.floor(totalBeats / beatsPerBar) + 1;
    const beats = Math.floor(totalBeats % beatsPerBar) + 1;
    
    return `${bars.toString().padStart(2, '0')}:${beats.toString().padStart(2, '0')}`;
  };

  const currentTime = playheadLocation.time || 0;
  const currentTimeFormatted = formatTime(currentTime);
  const totalTimeFormatted = formatTime(duration);
  const currentBeatsFormatted = formatBarsBeats(currentTime);

  return (
    <div className={`${styles.timeDisplay} ${className}`}>
      {/* Beats Section */}
      <div className={styles.section}>
        {/* <div className={styles.sectionLabel}>Beats</div> */}
        <div className={styles.sectionContent}>
          <FontAwesomeIcon icon={faMusic} className={styles.icon} />
          <span className={styles.currentValue}>{currentBeatsFormatted}</span>
        </div>
      </div>

      {/* Time Section */}
      <div className={styles.section}>
        {/* <div className={styles.sectionLabel}>Time</div> */}
        <div className={styles.sectionContent}>
          <FontAwesomeIcon icon={faClock} className={styles.icon} />
          <span className={styles.currentValue}>{currentTimeFormatted}</span>
          <span className={styles.separator}>/</span>
          <span className={styles.totalValue}>{totalTimeFormatted}</span>
        </div>
      </div>
    </div>
  );
};

export default TimeDisplay;
