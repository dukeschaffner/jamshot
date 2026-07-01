'use client';

import { useEffect } from 'react';
import styles from './MusicalGrid.module.css';
import { useDAW } from '../DAWContext';

function MusicalGrid() {
  const { timeSignature, metronomeBpm, duration, tracksContainerWidth, gridLines, updateGridLines } = useDAW();

  const beatsPerMeasure = parseInt(timeSignature.split('/')[0], 10);
  const secondsPerBeat = 60 / metronomeBpm;
  const secondsPerMeasure = secondsPerBeat * beatsPerMeasure;

  const height = 500;
  const minBeatPixelWidth = 10;

  useEffect(() => {
    const generateGridLines = () => {
      if(!timeSignature || !metronomeBpm || !duration || !secondsPerMeasure || !tracksContainerWidth) return [];

      const gridLines = [];
      const totalMeasures = Math.ceil(duration / secondsPerMeasure);

      for (let measure = 0; measure <= totalMeasures; measure++) {
        const measureTime = measure * secondsPerMeasure;
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

      const beatPixelWidth = secondsPerBeat / duration * tracksContainerWidth;
      if (beatPixelWidth < minBeatPixelWidth) {
        return gridLines;
      }

      const endBeat = beatsPerMeasure + Math.floor(duration / secondsPerBeat);

      for (let beat = beatsPerMeasure; beat <= endBeat; beat++) {
        if (beat % beatsPerMeasure !== 0) {
          const beatTime = (beat - beatsPerMeasure) * secondsPerBeat;
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
    updateGridLines(newGridLines);
  }, [metronomeBpm, timeSignature, duration, secondsPerMeasure, beatsPerMeasure, secondsPerBeat, tracksContainerWidth, updateGridLines]);

  return (
    <div className={styles.musicalGrid} style={{ height: `${height}px` }}>
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
