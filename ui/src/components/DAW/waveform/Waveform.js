'use client';

import styles from './Waveform.module.css';
import { useState, useEffect, useRef, useCallback } from 'react';
import { bufferRegistry } from '../core/BufferRegistry';
import WaveformChunk from './WaveformChunk';
import { useDAW } from '../DAWContext';

export default function Waveform({ 
  bufferKey,
  trackRef,
  track,
  tracksScrollContainerRef
}) {
  const containerRef = useRef(null);
  const [chunks, setChunks] = useState([]);
  const [visibleChunks, setVisibleChunks] = useState(new Set());
  const [buffer, setBuffer] = useState(null);
  const [bufferData, setBufferData] = useState(null);
  const MAX_CHUNK_WIDTH = 2000;

  const [width, setWidth] = useState(0); // width of the waveform/region in pixels
  const [trackRectWidth, setTrackRectWidth] = useState(0); // width of the track rect

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
    const numChannels = audioBuffer.numberOfChannels;
    const bufferData = Array.from({ length: numChannels }, (_, i) => audioBuffer.getChannelData(i));
    setBufferData(bufferData);
  }, [bufferKey]);

  // Listen to track rect width changes
  useEffect(() => {
    if (!trackRef?.current) return;

    const updateTrackRectWidth = () => {
      if (trackRef.current) {
        const rect = trackRef.current.getBoundingClientRect();
        setTrackRectWidth(rect.width);
      }
    };

    // Initial measurement
    updateTrackRectWidth();

    // Set up ResizeObserver to watch for width changes
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setTrackRectWidth(entry.contentRect.width);
      }
    });

    resizeObserver.observe(trackRef.current);

    // Cleanup
    return () => {
      if (trackRef.current) {
        resizeObserver.unobserve(trackRef.current);
      }
      resizeObserver.disconnect();
    };
  }, [trackRef]);

  // On initial load, Set the width of the waveform based on the region
  useEffect(() => {
    if (!track || !bufferKey || !duration || !trackRectWidth) return;
    const region = track.regions.find(r => r.key === bufferKey);
    if (region) {
      setStartTime(region.startTime);
      setEndTime(region.endTime);
      setOffset(region.offset);
      const regionWidth = (region.endTime - region.startTime) / duration * trackRectWidth;
      setWidth(regionWidth);
    }
  }, [bufferKey, track, duration, trackRectWidth]);

  // #endregion

// #region render functions


  // Generate chunks based on peaks
  useEffect(() => {
    if (!buffer) return;
    
    const baseChunkWidth = Math.min(MAX_CHUNK_WIDTH, width);
    const chunksCount = Math.ceil(width / baseChunkWidth);
    const newChunks = [];
    
    for (let i = 0; i < chunksCount; i++) {
      const startPixel = i * baseChunkWidth;
      const endPixel = Math.min(startPixel + baseChunkWidth, width);
      const chunkWidth = endPixel - startPixel;

      newChunks.push({
        id: i,
        width: chunkWidth,
        offset: startPixel
      });
    }
    
    setChunks(newChunks);
  }, [buffer, width]);

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

  if (!buffer || !chunks) {
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
      style={{ width: `${width}px`, height: '100%' }}
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
            bufferData={bufferData}
            height={100}
            totalWidth={width}
            width={chunk.width}
            offset={chunk.offset}
            scrollLeft={scrollLeft}
          />
        ))}
      </div>
    </div>
  );
} 