'use client';

import { useState, useEffect, useRef } from 'react';
import { useDAW } from '../DAWContext';
import styles from './TrackHeader.module.css';

export default function TrackHeader({
  track
}) {


  return (
    <div className={styles.trackHeader}>
      <span>{track.name || 'Track ' + (1)}</span>
    </div>
  );
} 