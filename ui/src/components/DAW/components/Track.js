import React, { useRef, useState, useEffect } from 'react';
import styles from '../DAW.module.css';
import Waveform from '../waveform/Waveform';
import { eventBus } from '../EventBus';
import { DAW_EVENTS } from '../DAWEvents';


const Track = ({
  track,
  tracksScrollContainerRef
}) => {

  const trackRef = useRef(null);  
  const [regions, setRegions] = useState(track.regions);

  useEffect(() => {
    const handleRegionAdd = (data) => {
      if (data.trackId === track.id) {
        setRegions(prevRegions => [...prevRegions, data.region]);
      }
    };
    
    const handleRegionUpdate = (data) => {
      if (data.trackId === track.id) {
        setRegions(prevRegions => prevRegions.map(region => region.id === data.region.id ? data.region : region));
      }
    };

    eventBus.on(DAW_EVENTS.REGION.ADD, handleRegionAdd);
    eventBus.on(DAW_EVENTS.REGION.UPDATE, handleRegionUpdate);
    return () => {
      eventBus.off(DAW_EVENTS.REGION.ADD, handleRegionAdd);
      eventBus.off(DAW_EVENTS.REGION.UPDATE, handleRegionUpdate);
    };
  }, []);


  return (
    <div className={styles.track} ref={trackRef}>
        {regions.map((region, index) => (
            <div key={index} className={styles.region}>
                <Waveform 
                    bufferKey={region.key} 
                    trackRef={trackRef} 
                    track={track} 
                    tracksScrollContainerRef={tracksScrollContainerRef}
                />
            </div>
        ))}
    </div>
  );
};

export default Track;