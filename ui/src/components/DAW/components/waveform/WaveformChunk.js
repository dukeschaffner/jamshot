'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { renderWaveform } from './WaveformUtils';
import { useDAW } from '../../DAWContext';

export default function WaveformChunk({ 
  bufferData, 
  height, 
  totalWidth, // total width of the waveform in pixels
  timelineOffset, // waveform start position in timeline pixels
  width, // width of the chunk in pixels
  offset, // offset of the chunk in pixels
}) {
  const canvasRef = useRef(null);
  const [isRendered, setIsRendered] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [pixelRatio, setPixelRatio] = useState(2);

  const { scrollLeft, viewWidth, zoom } = useDAW();

  const virtualRenderBuffer = 100;

  const setVisibility = useCallback((isZoomChange = false) => {
    const chunkLeft = timelineOffset + offset;
    const isNearViewport = (chunkLeft + width + virtualRenderBuffer > scrollLeft) && (chunkLeft - virtualRenderBuffer < scrollLeft + viewWidth);
    if(isNearViewport && !isVisible) {
      setIsVisible(true);
    }
    else if(!isNearViewport && isVisible && (!isRendered || isZoomChange)) {
      setIsVisible(false);
    }
  }, [scrollLeft, viewWidth, timelineOffset, offset, width, isVisible, isRendered]);

  useEffect(() => {
    setVisibility(true);
  }, [zoom, setVisibility]);


  // Render the chunk when it becomes visible
  useEffect(() => {
    setVisibility();
  }, [scrollLeft, viewWidth, timelineOffset, offset, width, setVisibility]);

  useEffect(() => {
    const renderChunk = () => {
      if (!canvasRef.current || !bufferData || !width || !height || !totalWidth) return;
      canvasRef.current.width = Math.round(width * pixelRatio)
      canvasRef.current.height = Math.round(height * pixelRatio)
  
      const ctx = canvasRef.current.getContext('2d')

      ctx.fillStyle = 'gray';
  
      const data = bufferData.map((channel) => {
        const start = Math.floor((offset / totalWidth) * channel.length)
        const end = Math.floor(((offset + width) / totalWidth) * channel.length)
        return channel.slice(start, end)
      })
  
      renderWaveform(data, ctx)
      setIsRendered(true);
    }
    renderChunk();
  }, [bufferData, width, height, offset, totalWidth, isVisible]);



  if (!isVisible) {
    return (
      <div 
        style={{
          position: 'absolute',
          width: width,
          height: height,
          left: offset,
          backgroundColor: '#f0f0f0'
        }}
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        width: width,
        height: height,
        left: offset
      }}
    />
  );
} 