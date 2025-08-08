'use client';

import styles from './Waveform.module.css';
import { useState, useEffect, useRef, useCallback } from 'react';
import { bufferRegistry } from '../core/BufferRegistry';
import { peaksRegistry } from './PeaksRegistry';
import { virtualizedRenderer } from './VirtualizedRenderer';
import WaveformChunk from './WaveformChunk';

export default function Waveform({ 
  bufferKey,
  width = 800,
  height = 100,
  zoomLevel = 1,
  scrollLeft = 0,
  onScrollChange
}) {
  const containerRef = useRef(null);
  const [peaks, setPeaks] = useState(null);
  const [chunks, setChunks] = useState([]);
  const [visibleChunks, setVisibleChunks] = useState(new Set());
  const [buffer, setBuffer] = useState(null);
  const [chunkWidth] = useState(256); // Fixed chunk width for consistency
  const [samplesPerPixel, setSamplesPerPixel] = useState(100);

  // Calculate optimal zoom level and samples per pixel
  useEffect(() => {
    if (!buffer) return;
    
    const optimalSamplesPerPixel = peaksRegistry.getOptimalZoomLevel(
      width, 
      buffer.duration, 
      buffer.sampleRate
    );
    setSamplesPerPixel(optimalSamplesPerPixel * zoomLevel);
  }, [buffer, width, zoomLevel]);

  // Load buffer and calculate peaks
  useEffect(() => {
    if (!bufferKey) return;
    
    const audioBuffer = bufferRegistry.getBuffer(bufferKey);
    if (!audioBuffer) return;
    
    setBuffer(audioBuffer);
    
    // Calculate peaks for the current zoom level
    const peakData = peaksRegistry.calculatePeaks(audioBuffer, bufferKey, samplesPerPixel);
    setPeaks(peakData);
  }, [bufferKey, samplesPerPixel]);

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

  // Handle scroll events with throttling
  const handleScroll = useCallback((e) => {
    const newScrollLeft = e.target.scrollLeft;
    if (onScrollChange) {
      onScrollChange(newScrollLeft);
    }
  }, [onScrollChange]);

  // Throttled scroll handler for better performance
  const throttledScrollHandler = useCallback(
    (e) => {
      requestAnimationFrame(() => handleScroll(e));
    },
    [handleScroll]
  );

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

  if (!buffer || !peaks) {
    return (
      <div className={styles.waveformContainer} style={{ width, height }}>
        <div className={styles.loading}>Loading waveform...</div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className={styles.waveformContainer}
      style={{ width, height }}
      onScroll={throttledScrollHandler}
    >
      <div 
        className={styles.waveformContent}
        style={{ 
          width: peaks.length,
          height,
          position: 'relative'
        }}
      >
        {chunks.map(chunk => (
          <WaveformChunk
            key={chunk.id}
            chunk={chunk}
            height={height}
            isVisible={visibleChunks.has(chunk.id)}
            scrollLeft={scrollLeft}
          />
        ))}
      </div>
    </div>
  );
} 