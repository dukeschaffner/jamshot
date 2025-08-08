'use client';

import { useState, useEffect } from 'react';
import Waveform from './Waveform';
import { virtualizedRenderer } from './VirtualizedRenderer';
import { performanceMonitor } from './PerformanceMonitor';

export default function WaveformDemo() {
  const [scrollLeft, setScrollLeft] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [cacheStats, setCacheStats] = useState({});
  const [perfStats, setPerfStats] = useState({});

  // Generate sample buffer data for testing
  const generateSampleBuffer = () => {
    const sampleRate = 44100;
    const duration = 30; // 30 seconds
    const buffer = new AudioContext().createBuffer(1, sampleRate * duration, sampleRate);
    const channelData = buffer.getChannelData(0);
    
    // Generate some sample audio data
    for (let i = 0; i < channelData.length; i++) {
      // Create a simple sine wave with some variation
      const time = i / sampleRate;
      channelData[i] = Math.sin(2 * Math.PI * 440 * time) * 0.5 + 
                       Math.sin(2 * Math.PI * 880 * time) * 0.3 +
                       (Math.random() - 0.5) * 0.1;
    }
    
    return buffer;
  };

  // Store sample buffer in registry
  useEffect(() => {
    const { bufferRegistry } = require('../core/BufferRegistry');
    const sampleBuffer = generateSampleBuffer();
    bufferRegistry.storeBuffer('demo-track', sampleBuffer, { name: 'Demo Track' });
  }, []);

  // Update cache stats periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setCacheStats(virtualizedRenderer.getCacheStats());
      setPerfStats(performanceMonitor.getStats());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const handleScrollChange = (newScrollLeft) => {
    setScrollLeft(newScrollLeft);
  };

  const handleZoomChange = (e) => {
    setZoomLevel(parseFloat(e.target.value));
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h2>Virtualized Waveform Demo</h2>
      
      <div style={{ marginBottom: '20px' }}>
        <label>
          Zoom Level: 
          <input 
            type="range" 
            min="0.1" 
            max="10" 
            step="0.1" 
            value={zoomLevel} 
            onChange={handleZoomChange}
            style={{ marginLeft: '10px' }}
          />
          {zoomLevel.toFixed(1)}x
        </label>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <strong>Cache Stats:</strong> 
        Cached chunks: {cacheStats.size}/{cacheStats.maxSize} | 
        Offscreen supported: {cacheStats.offscreenSupported ? 'Yes' : 'No'}
      </div>

      <div style={{ marginBottom: '20px' }}>
        <strong>Performance Stats:</strong> 
        Avg render time: {perfStats.avgRenderTime}ms | 
        Cache hit rate: {perfStats.cacheHitRate}% | 
        Memory usage: {perfStats.memoryUsage}
      </div>

      <div style={{ marginBottom: '20px' }}>
        <strong>Scroll Position:</strong> {Math.round(scrollLeft)}px
      </div>

      <div style={{ border: '1px solid #ccc', borderRadius: '4px', padding: '10px' }}>
        <Waveform
          bufferKey="demo-track"
          width={800}
          height={120}
          zoomLevel={zoomLevel}
          scrollLeft={scrollLeft}
          onScrollChange={handleScrollChange}
        />
      </div>

      <div style={{ marginTop: '20px', fontSize: '14px', color: '#666' }}>
        <p><strong>Features:</strong></p>
        <ul>
          <li>Virtualized rendering - only visible chunks are rendered</li>
          <li>Offscreen canvas support for better performance</li>
          <li>Intelligent caching with LRU eviction</li>
          <li>Smooth scrolling with buffer chunks</li>
          <li>Memory efficient - dropped chunks are cleared</li>
        </ul>
      </div>
    </div>
  );
} 