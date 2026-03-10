'use client';

import { useState, useEffect, useRef } from 'react';
import { useAudio } from '../lib/AudioContext';
import styles from './Waveform.module.css';

/**
 * Simple SoundCloud-style waveform component
 * @param {Object} track - Track object with waveform_url and combined_waveform_url
 * @param {string} type - 'stem' or 'combined' to determine which waveform to show
 * @param {number} height - Height of the waveform in pixels (default: 80)
 */
export default function Waveform({ track, type = 'stem', height = 80 }) {
  const { currentTrack, progress, audioSourceType } = useAudio();
  const [peaks, setPeaks] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const canvasRef = useRef(null);

  const isCurrentTrack = currentTrack?.id === track.id && (audioSourceType === "audio" && type === "stem") || (audioSourceType === "combined" && type === "combined");
  const initialRenderRef = useRef(false);

  useEffect(() => {
    if (!track) return;

    const waveformUrl = type === 'stem' ? track.waveform_url : track.combined_waveform_url;
    
    if (!waveformUrl) {
      setLoading(false);
      return;
    }

    async function fetchPeaks() {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch(waveformUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch waveform: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Extract peaks for resolution 256 (default)
        if (data.peaks && data.peaks['256']) {
          setPeaks(data.peaks['256']);
        } else {
          throw new Error('Invalid waveform data format');
        }
      } catch (err) {
        console.error('Error loading waveform:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchPeaks();
  }, [track, type]);

  useEffect(() => {
    if (!peaks || !canvasRef.current) return;
    if (initialRenderRef.current && (!isCurrentTrack)) return;

    const drawWaveform = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const container = canvas.parentElement;
      if (!container) return;

      const containerWidth = container.clientWidth;
      const containerHeight = height;

      // Set canvas size to match container
      canvas.width = containerWidth;
      canvas.height = containerHeight;

      const ctx = canvas.getContext('2d');
      const width = canvas.width;
      const canvasHeight = canvas.height;

      // Clear canvas
      ctx.clearRect(0, 0, width, canvasHeight);

      // Calculate normalized progress (0-1)
      const normalizedProgress = currentTrack && currentTrack.duration ? Math.min(progress / currentTrack.duration, 1) : 0;
      const progressWidth = normalizedProgress * width;

      // Draw waveform bars
      const barWidth = width / peaks.length;
      const centerY = canvasHeight / 2;

      peaks.forEach(([min, max], index) => {
        const x = index * barWidth;
        const barHeight = Math.abs(max - min) * canvasHeight * 0.8; // Scale to 80% of height
        const y = centerY - (barHeight / 2);

        // Determine if this bar is in the progress portion
        const isProgressBar = x < progressWidth;

        // Set color based on progress - use a brighter seafoam for progress
        ctx.fillStyle = isProgressBar ? 'red' : 'black';

        // Draw vertical bar
        ctx.fillRect(x, y, Math.max(1, barWidth - 1), barHeight);
      });
    };

    // Initial draw
    drawWaveform();
    initialRenderRef.current = true;

    // Handle window resize
    const handleResize = () => {
      drawWaveform();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [peaks, height, progress, currentTrack]);

  if (loading) {
    return (
      <div className={styles.waveformContainer} style={{ height }}>
        <div className={styles.loading}>Loading waveform...</div>
      </div>
    );
  }

  if (error || !peaks) {
    return (
      <div className={styles.waveformContainer} style={{ height }}>
        <div className={styles.error}>Waveform unavailable</div>
      </div>
    );
  }

  return (
    <div className={styles.waveformContainer} style={{ height }}>
      <canvas
        ref={canvasRef}
        width={800}
        height={height}
        className={styles.waveformCanvas}
      />
    </div>
  );
}

