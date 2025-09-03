'use client';

import { useState, useEffect } from 'react';
import { useDAW } from '../DAWContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrash } from '@fortawesome/free-solid-svg-icons';
import { eventBus } from '../misc/EventBus';
import { DAW_EVENTS } from '../misc/DAWEvents';
import styles from './Takes.module.css';

export default function Takes() {
  const { 
    trackManagerRef, 
    isPlaying, 
    isRecording 
  } = useDAW();
  
  const [regions, setRegions] = useState([]);
  const [selectedRegion, setSelectedRegion] = useState(null);

  // Get regions from the recording track
  useEffect(() => {
    if (trackManagerRef.current) {
      const recordingTrack = trackManagerRef.current.getTrack('recording-track');
      if (recordingTrack) {
        const trackRegions = recordingTrack.getRegions();
        setRegions(trackRegions);
        
        // Find the active region
        const activeRegion = trackRegions.find(region => region.active);
        setSelectedRegion(activeRegion || null);
      }
    }
  }, [trackManagerRef.current]);

  // Listen for region updates
  useEffect(() => {
    const handleRegionUpdate = () => {
      if (trackManagerRef.current) {
        const recordingTrack = trackManagerRef.current.getTrack('recording-track');
        if (recordingTrack) {
          const trackRegions = recordingTrack.getRegions();
          setRegions(trackRegions);
          
          // Find the active region
          const activeRegion = trackRegions.find(region => region.active);
          setSelectedRegion(activeRegion || null);
        }
      }
    };

    eventBus.on(DAW_EVENTS.REGION.ADDED, handleRegionUpdate);
    eventBus.on(DAW_EVENTS.REGION.UPDATED, handleRegionUpdate);
    eventBus.on(DAW_EVENTS.REGION.REMOVED, handleRegionUpdate);
    return () => {
      eventBus.off(DAW_EVENTS.REGION.ADDED, handleRegionUpdate);
      eventBus.off(DAW_EVENTS.REGION.UPDATED, handleRegionUpdate);
      eventBus.off(DAW_EVENTS.REGION.REMOVED, handleRegionUpdate);
    };
  }, []);

  const handleRegionSelect = (region) => {
    if (isPlaying || isRecording) return;
    
    regions.forEach(r => {
      if(r.active) {
        r.active = false;
      }
      eventBus.emit(DAW_EVENTS.REGION.UPDATE, { region: r, trackId: 'recording-track' });
    });
    region.active = true;
    eventBus.emit(DAW_EVENTS.REGION.UPDATE, { region: region, trackId: 'recording-track' });
  };

  const handleRegionDelete = (regionToDelete) => {
    if (isPlaying || isRecording) return;
    eventBus.emit(DAW_EVENTS.REGION.REMOVE, { region: regionToDelete, trackId: 'recording-track' });
  };

  // Don't render if no regions
  if (regions.length === 0) {
    return null;
  }

  return (
    <div className={styles.takesContainer}>
      <h3>Your Takes</h3>
      <div className={styles.takesList}>
        {regions.map(region => (
          <div 
            key={region.id} 
            className={`${styles.takeItem} ${selectedRegion?.id === region.id ? styles.selected : ''}`}
            onClick={() => handleRegionSelect(region)}
          >
            <span className={styles.takeName}>{region.name}</span>
            <div className={styles.takeControls}>
              <button 
                className={styles.takeDelete} 
                onClick={(e) => {
                  e.stopPropagation();
                  handleRegionDelete(region);
                }}
                disabled={isPlaying || isRecording}
                title="Delete take"
              >
                <FontAwesomeIcon icon={faTrash} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
} 