import React, { useRef, useState, useEffect } from 'react';
import styles from '../DAW.module.css';
import Waveform from '../waveform/Waveform';


const Track = ({
  track
}) => {

  const trackRef = useRef(null);  


  return (
    <div className={styles.track} ref={trackRef}>
        {track.regions.map((region, index) => (
            <div key={index} className={styles.region}>
                <Waveform bufferKey={region.key} trackRef={trackRef} track={track}/>
            </div>
        ))}
    </div>
  );
};

export default Track;