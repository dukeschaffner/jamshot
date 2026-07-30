'use client';

import { useMemo } from 'react';
import WaveformChunk from '../waveform/WaveformChunk';
import {
  getLoopTileBoundaryTimes,
  getRegionAudibleLength,
  isRegionLooped,
} from '../../core/regionLoopUtils';
import styles from './RegionLoop.module.css';

const MAX_CHUNK_WIDTH = 1000;
const MAX_VISIBLE_TILES = 200;

/**
 * Faded tiled waveforms for the loop area of a region (Logic Pro-style).
 */
export default function RegionLoopOverlay({
  bufferData,
  bufferDuration,
  startTime,
  endTime,
  loopEnd,
  duration,
  tracksContainerWidth,
  offset,
  onLoopHandleMouseDown,
  showLoopHandle,
}) {
  const audibleLength = getRegionAudibleLength({ startTime, endTime });
  const looped = isRegionLooped({ endTime, loopEnd });

  const tiles = useMemo(() => {
    if (!looped || audibleLength <= 0 || !duration || !tracksContainerWidth) {
      return [];
    }

    const result = [];
    let t = endTime;
    let i = 0;
    while (t < loopEnd && i < MAX_VISIBLE_TILES) {
      const tileDuration = Math.min(audibleLength, loopEnd - t);
      if (tileDuration <= 0) break;
      result.push({
        id: i,
        startTime: t,
        duration: tileDuration,
        leftPercentOfLoop: ((t - endTime) / (loopEnd - endTime)) * 100,
        widthPercentOfLoop: (tileDuration / (loopEnd - endTime)) * 100,
      });
      t += audibleLength;
      i += 1;
    }
    return result;
  }, [looped, audibleLength, duration, tracksContainerWidth, endTime, loopEnd]);

  const boundaryTimes = useMemo(() => {
    if (!looped) return [];
    return getLoopTileBoundaryTimes({ startTime, endTime, loopEnd });
  }, [looped, startTime, endTime, loopEnd]);

  const audibleWaveformWidthPx = useMemo(() => {
    if (!duration || !tracksContainerWidth || audibleLength <= 0) return 0;
    return (audibleLength / duration) * tracksContainerWidth;
  }, [duration, tracksContainerWidth, audibleLength]);

  const fullWaveformWidthPx = useMemo(() => {
    if (!duration || !tracksContainerWidth || !bufferDuration) return 0;
    return (bufferDuration / duration) * tracksContainerWidth;
  }, [duration, tracksContainerWidth, bufferDuration]);

  const waveformOffsetPx = useMemo(() => {
    if (!fullWaveformWidthPx || !bufferDuration) return 0;
    return (offset / bufferDuration) * fullWaveformWidthPx;
  }, [fullWaveformWidthPx, bufferDuration, offset]);

  const chunks = useMemo(() => {
    if (!audibleWaveformWidthPx) return [];
    const baseChunkWidth = Math.min(MAX_CHUNK_WIDTH, audibleWaveformWidthPx);
    const count = Math.ceil(audibleWaveformWidthPx / baseChunkWidth);
    const result = [];
    for (let i = 0; i < count; i += 1) {
      const startPixel = i * baseChunkWidth;
      const endPixel = Math.min(startPixel + baseChunkWidth, audibleWaveformWidthPx);
      result.push({
        id: i,
        width: endPixel - startPixel,
        offset: startPixel,
      });
    }
    return result;
  }, [audibleWaveformWidthPx]);

  if (!looped || tiles.length === 0 || !bufferData) {
    return null;
  }

  const loopAreaWidthPercent =
    duration > 0 ? ((loopEnd - endTime) / duration) * 100 : 0;
  // Position relative to the extended region container (which starts at startTime)
  const regionTotalDuration = loopEnd - startTime;
  const loopLeftWithinRegion =
    regionTotalDuration > 0
      ? ((endTime - startTime) / regionTotalDuration) * 100
      : 0;
  const loopWidthWithinRegion =
    regionTotalDuration > 0
      ? ((loopEnd - endTime) / regionTotalDuration) * 100
      : 0;

  void loopAreaWidthPercent;

  return (
    <div
      className={styles.overlay}
      style={{
        left: `${loopLeftWithinRegion}%`,
        width: `${loopWidthWithinRegion}%`,
      }}
    >
      {tiles.map((tile) => {
        const tileScale = tile.duration / audibleLength;
        const tileWaveformWidth = audibleWaveformWidthPx * tileScale;
        const timelineOffsetPx =
          duration > 0
            ? ((tile.startTime / duration) * tracksContainerWidth) - waveformOffsetPx
            : 0;

        return (
          <div
            key={tile.id}
            className={styles.tile}
            style={{
              left: `${tile.leftPercentOfLoop}%`,
              width: `${tile.widthPercentOfLoop}%`,
            }}
          >
            {/* Full-buffer container + negative margin matches the main region crop offset. */}
            <div
              className={styles.tileWaveform}
              style={{
                width: `${fullWaveformWidthPx}px`,
                marginLeft: `${-waveformOffsetPx}px`,
              }}
            >
              {chunks.map((chunk) => {
                const chunkWidth = Math.min(
                  chunk.width,
                  Math.max(0, tileWaveformWidth - chunk.offset)
                );
                if (chunkWidth <= 0) return null;
                return (
                  <WaveformChunk
                    key={`${tile.id}-${chunk.id}`}
                    bufferData={bufferData}
                    height={100}
                    totalWidth={fullWaveformWidthPx}
                    timelineOffset={timelineOffsetPx}
                    width={chunkWidth}
                    offset={waveformOffsetPx + chunk.offset}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      {boundaryTimes.map((time) => {
        const leftWithinLoop =
          loopEnd > endTime ? ((time - endTime) / (loopEnd - endTime)) * 100 : 0;
        return (
          <div
            key={`boundary-${time}`}
            className={styles.boundary}
            style={{ left: `${leftWithinLoop}%` }}
          />
        );
      })}

      {showLoopHandle && (
        <div
          className={styles.handle}
          onMouseDown={onLoopHandleMouseDown}
          title="Drag to loop region"
        />
      )}
    </div>
  );
}
