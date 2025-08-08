'use client';

import { useEffect, useRef, useState } from 'react';
import { virtualizedRenderer } from './VirtualizedRenderer';

export default function WaveformChunk({ 
  chunk, 
  height, 
  isVisible, 
  scrollLeft 
}) {
  const canvasRef = useRef(null);
  const [isRendered, setIsRendered] = useState(false);

  // Render the chunk when it becomes visible
  useEffect(() => {
    if (!isVisible || isRendered) return;
    
    renderChunk();
  }, [isVisible, isRendered]);

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

  const renderChunk = () => {
    if (!chunk.peaks || chunk.peaks.length === 0) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Get cached or render new chunk
    const renderedCanvas = virtualizedRenderer.getCachedChunk(chunk.id, chunk, height);
    
    // Copy the rendered canvas to our canvas
    canvas.width = renderedCanvas.width;
    canvas.height = renderedCanvas.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(renderedCanvas, 0, 0);
    
    setIsRendered(true);
  };

  if (!isVisible) {
    return (
      <div 
        style={{
          position: 'absolute',
          left: chunk.left,
          width: chunk.width,
          height,
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
        left: chunk.left,
        width: chunk.width,
        height,
        display: isRendered ? 'block' : 'none'
      }}
    />
  );
} 