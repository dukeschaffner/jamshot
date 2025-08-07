'use client';

import styles from './Waveform.module.css';

export default function Waveform({ 
  track,
  height = 100,
  width = '100%',
}) {


  return (
    <div className={styles.waveformContainer}>
      {/* <canvas
        ref={canvasRef}
        style={{
          width: width,
          height: height,
          borderRadius: '6px',
          overflow: 'hidden',
          cursor: isDragging ? 'grabbing' : 'grab'
        }}
        tabIndex={0}
        role="button"
        aria-label="Waveform - click to seek, scroll to zoom"
      /> */}
      
      {/* Debug info (remove in production) */}
      {/* {process.env.NODE_ENV === 'development' && (
        <div style={{ fontSize: '10px', color: '#666', marginTop: '4px' }}>
          Zoom: {currentZoom.toFixed(1)} | Ready: {isReady ? 'Yes' : 'No'} | Duration: {duration.toFixed(1)}s
        </div>
      )} */}
    </div>
  );
} 