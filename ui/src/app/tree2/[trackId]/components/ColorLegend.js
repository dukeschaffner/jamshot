'use client';

import { useState } from 'react';
import { FaQuestionCircle } from 'react-icons/fa';
import { getTrackColor } from '../utils/trackColorUtils';
import styles from './ColorLegend.module.css';

/**
 * Color Legend Component
 * Displays the color scheme explanation for track popularity as a hover popover
 */
export default function ColorLegend() {
  const [isHovered, setIsHovered] = useState(false);

  // Create sample tracks for each color range to demonstrate colors
  const colorRanges = [
    {
      label: '0-50%',
      description: 'Low popularity',
      track: { like_count: 0, play_count: 1000 }, // Low popularity score
    },
    {
      label: '50-75%',
      description: 'Moderate popularity',
      track: { like_count: 5, play_count: 100 }, // ~0.065 popularity
    },
    {
      label: '75-90%',
      description: 'High popularity',
      track: { like_count: 8, play_count: 100 }, // ~0.08 popularity
    },
    {
      label: '90-99%',
      description: 'Very high popularity',
      track: { like_count: 12, play_count: 100 }, // ~0.12 popularity
    },
    {
      label: '99%+',
      description: 'Top tracks',
      track: { like_count: 20, play_count: 100 }, // ~0.20 popularity
    },
  ];

  return (
    <div
      className={styles['legend-container']}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button className={styles['legend-icon']} aria-label="Color legend">
        <FaQuestionCircle size={20} />
      </button>
      
      {isHovered && (
        <div className={styles.legend}>
          <div className={styles['legend-header']}>
            <span className={styles['legend-title']}>Popularity Colors</span>
            <span className={styles['legend-subtitle']}>
              Colors represent popularity percentile ranges
            </span>
          </div>
          
          <div className={styles['legend-items']}>
            {colorRanges.map((range, index) => {
              const color = getTrackColor(range.track);
              return (
                <div key={index} className={styles['legend-item']}>
                  <div
                    className={styles['legend-color']}
                    style={{ backgroundColor: color }}
                  />
                  <div className={styles['legend-text']}>
                    <span className={styles['legend-label']}>{range.label}</span>
                    <span className={styles['legend-description']}>{range.description}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className={styles['legend-saturation']}>
            <div className={styles['legend-saturation-header']}>
              <span className={styles['legend-saturation-title']}>Saturation</span>
            </div>
            <p className={styles['legend-saturation-text']}>
              Color intensity (saturation) increases with the number of plays. 
              Tracks with more plays appear more vibrant, while tracks with fewer plays appear more muted.
            </p>
            <div className={styles['legend-saturation-examples']}>
              <div className={styles['legend-saturation-example']}>
                <div
                  className={styles['legend-color']}
                  style={{ backgroundColor: getTrackColor({ like_count: 10, play_count: 0 }) }}
                />
                <span className={styles['legend-saturation-label']}>Few plays</span>
              </div>
              <div className={styles['legend-saturation-example']}>
                <div
                  className={styles['legend-color']}
                  style={{ backgroundColor: getTrackColor({ like_count: 10, play_count: 100000 }) }}
                />
                <span className={styles['legend-saturation-label']}>Many plays</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

