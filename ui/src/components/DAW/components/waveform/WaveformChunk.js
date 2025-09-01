'use client';

import { useEffect, useRef, useState } from 'react';
import { renderWaveform } from './WaveformUtils';

export default function WaveformChunk({ 
  bufferData, 
  height, 
  totalWidth, // total width of the waveform in pixels
  width, // width of the chunk in pixels
  offset, // offset of the chunk in pixels
  scrollLeft // scroll left of the waveform in pixels
}) {
  const canvasRef = useRef(null);
  const [isRendered, setIsRendered] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [pixelRatio, setPixelRatio] = useState(2);

  // Render the chunk when it becomes visible
  // useEffect(() => {
  //   if (!isVisible || isRendered) return;
    
  //   renderChunk();
  // }, [isVisible, isRendered]);

  // Cleanup when chunk becomes invisible
  useEffect(() => {
    if (isVisible || !isRendered) return;
    
    // Clear the canvas to free memory
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    
    setIsRendered(false);
  }, [isVisible, isRendered]);

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
    }
    renderChunk();
  }, [bufferData, width, height, offset, totalWidth]);



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
        left: offset,
        display: isRendered ? 'block' : 'block'
      }}
    />
  );
} 