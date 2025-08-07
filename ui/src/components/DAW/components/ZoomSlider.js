import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearchMinus, faSearchPlus } from '@fortawesome/free-solid-svg-icons';
import styles from '../DAW.module.css';

const ZoomSlider = ({ zoom, onZoomChange }) => {
  const handleZoomChange = (e) => {
    const newZoom = parseFloat(e.target.value);
    onZoomChange(newZoom);
  };

  const handleZoomIn = () => {
    const newZoom = Math.min(10, zoom * 1.2);
    onZoomChange(newZoom);
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(1, zoom / 1.2);
    onZoomChange(newZoom);
  };

  return (
    <div className={styles.zoomControl}>
      <button
        className={styles.zoomButton}
        onClick={handleZoomOut}
        title="Zoom Out"
        disabled={zoom <= 0.1}
      >
        <FontAwesomeIcon icon={faSearchMinus} />
      </button>
      
      <div className={styles.zoomSliderContainer}>
        <input
          type="range"
          min="1"
          max="10"
          step="0.1"
          value={zoom}
          onChange={handleZoomChange}
          className={styles.zoomSlider}
          title={`Zoom: ${zoom.toFixed(1)}x`}
        />
        <span className={styles.zoomValue}>{zoom.toFixed(1)}x</span>
      </div>
      
      <button
        className={styles.zoomButton}
        onClick={handleZoomIn}
        title="Zoom In"
        disabled={zoom >= 10}
      >
        <FontAwesomeIcon icon={faSearchPlus} />
      </button>
    </div>
  );
};

export default ZoomSlider; 