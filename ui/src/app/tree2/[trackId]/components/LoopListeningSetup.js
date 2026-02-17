'use client';

import { useEffect } from 'react';
import { useLoopListening } from '../utils/LoopListeningContext';

/**
 * Helper component to set up loop listening callbacks
 */
export default function LoopListeningSetup() {
  const { setOnTrackEnd } = useLoopListening();
  
  useEffect(() => {
    // Set up track end callback - for now just log
    setOnTrackEnd(() => {
      console.log('track ended');
    });
  }, [setOnTrackEnd]);
  
  return null;
}

