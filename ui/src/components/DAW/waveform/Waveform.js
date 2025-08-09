'use client';

import styles from './Waveform.module.css';
import { useState, useEffect, useRef, useCallback } from 'react';
import { bufferRegistry } from '../core/BufferRegistry';
import { peaksRegistry } from './PeaksRegistry';
import { virtualizedRenderer } from './VirtualizedRenderer';
import WaveformChunk from './WaveformChunk';
import { useDAW } from '../DAWContext';

export default function Waveform({ 
  bufferKey,
  trackRef,
  track
}) {
  const containerRef = useRef(null);
  const [peaks, setPeaks] = useState(null);
  const [chunks, setChunks] = useState([]);
  const [visibleChunks, setVisibleChunks] = useState(new Set());
  const [buffer, setBuffer] = useState(null);
  const [chunkWidth] = useState(256); // Fixed chunk width for consistency
  const [samplesPerPixel, setSamplesPerPixel] = useState(100);

  const [width, setWidth] = useState(50);

  const [startTime, setStartTime] = useState(0); // start time of the waveform in the track
  const [endTime, setEndTime] = useState(0); // end time of the waveform in the track
  const [offset, setOffset] = useState(0); // start time relative to buffer start

  const { scrollLeft, duration, zoom } = useDAW();

  // #region initial load

  // On initial load, load the buffer
  useEffect(() => {
    if (!bufferKey) return;
    
    const audioBuffer = bufferRegistry.getBuffer(bufferKey);
    if (!audioBuffer) return;
    
    setBuffer(audioBuffer);
  }, [bufferKey]);

  // On initial load, Set the width of the waveform based on the region
  useEffect(() => {
    if (!track || !bufferKey || !duration) return;
    const region = track.regions.find(r => r.key === bufferKey);
    if (region) {
      setStartTime(region.startTime);
      setEndTime(region.endTime);
      setOffset(region.offset);
      const regionWidth = (region.endTime - region.startTime) / duration * 100;
      setWidth(regionWidth);
    }
  }, [bufferKey, track, duration]);

  // #endregion

// #region render functions

  // Calculate optimal zoom level and samples per pixel
  useEffect(() => {
    if (!buffer) return;
    
    const optimalSamplesPerPixel = peaksRegistry.getOptimalZoomLevel(
      width, 
      buffer.duration, 
      buffer.sampleRate
    );
    setSamplesPerPixel(optimalSamplesPerPixel * zoom);
  }, [buffer, width, zoom]);

  // Load buffer and calculate peaks
  useEffect(() => {    
    // Calculate peaks for the current zoom level
    if (!buffer) return;
    const peakData = peaksRegistry.calculatePeaks(buffer, bufferKey, samplesPerPixel);
    setPeaks(peakData);
  }, [buffer, bufferKey, samplesPerPixel]);

  // Generate chunks based on peaks
  useEffect(() => {
    if (!peaks || !buffer) return;
    
    const totalPixels = peaks.length;
    const chunksCount = Math.ceil(totalPixels / chunkWidth);
    const newChunks = [];
    
    for (let i = 0; i < chunksCount; i++) {
      const startPixel = i * chunkWidth;
      const endPixel = Math.min(startPixel + chunkWidth, totalPixels);
      const chunkPeaks = peaks.slice(startPixel, endPixel);
      
      newChunks.push({
        id: i,
        startPixel,
        endPixel,
        peaks: chunkPeaks,
        left: startPixel,
        width: chunkPeaks.length
      });
    }
    
    setChunks(newChunks);
  }, [peaks, buffer, chunkWidth]);

  // Calculate which chunks are visible
  const calculateVisibleChunks = useCallback(() => {
    if (!containerRef.current || chunks.length === 0) return;
    
    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    const viewportWidth = containerRect.width;
    const totalWidth = peaks ? peaks.length : 0;
    
    // Use virtualized renderer to calculate visible chunks
    const visible = virtualizedRenderer.calculateVisibleChunks(scrollLeft, viewportWidth, totalWidth);
    setVisibleChunks(visible);
  }, [chunks, scrollLeft, peaks]);

  // Update visible chunks when scroll changes
  useEffect(() => {
    calculateVisibleChunks();
  }, [calculateVisibleChunks]);

  // Cleanup offscreen canvases when chunks become invisible
  useEffect(() => {
    const cleanup = () => {
      chunks.forEach(chunk => {
        if (!visibleChunks.has(chunk.id)) {
          // Trigger cleanup in WaveformChunk component
          // This will be handled by the component's useEffect
        }
      });
    };
    
    cleanup();
  }, [visibleChunks, chunks]);

  // #endregion

  if (!buffer || !peaks) {
    return (
      <div className={styles.waveformContainer} style={{ width: `${width}%`, height: '100%' }}>
        <div className={styles.loading}>Loading waveform...</div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className={styles.waveformContainer}
      style={{ width: `${width}%`, height: '100%' }}
      // onScroll={throttledScrollHandler}
    >
      <div 
        className={styles.waveformContent}
        style={{ 
          width: '100%',
          height: '100%',
          position: 'relative'
        }}
      >
        {chunks.map(chunk => (
          <WaveformChunk
            key={chunk.id}
            chunk={chunk}
            height={100}
            isVisible={visibleChunks.has(chunk.id)}
            scrollLeft={scrollLeft}
          />
        ))}
      </div>
    </div>
  );
} 