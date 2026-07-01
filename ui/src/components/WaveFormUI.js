'use client';

import { useEffect, useRef } from 'react';
import { resolveCanvasColor } from './waveformCanvasUtils';
import styles from './Waveform.module.css';

/**
 * Pure waveform canvas renderer — no audio fetching or playback logic.
 *
 * @param {Object} props
 * @param {Array<[number, number]>|null} props.peaks - Normalized min/max pairs per bar
 * @param {number} [props.height=80]
 * @param {number} [props.progress=0] - Playback progress 0–1
 * @param {string} [props.barColor]
 * @param {string} [props.progressColor]
 * @param {boolean} [props.loading]
 * @param {string} [props.error]
 * @param {string} [props.className]
 */
export default function WaveFormUI({
  peaks,
  height = 80,
  progress = 0,
  barColor = 'var(--grey-3)',
  progressColor = 'var(--seafoam)',
  loading = false,
  error = null,
  className = '',
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!peaks?.length || !canvasRef.current) return;

    const drawWaveform = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const container = containerRef.current || canvas.parentElement;
      if (!container) return;

      const containerWidth = container.clientWidth;
      const containerHeight = height;
      if (containerWidth <= 0) return;

      canvas.width = containerWidth;
      canvas.height = containerHeight;

      const ctx = canvas.getContext('2d');
      const width = canvas.width;
      const canvasHeight = canvas.height;

      ctx.clearRect(0, 0, width, canvasHeight);

      const resolvedBarColor = resolveCanvasColor(barColor);
      const resolvedProgressColor = resolveCanvasColor(progressColor);
      const normalizedProgress = Math.min(Math.max(progress, 0), 1);
      const progressWidth = normalizedProgress * width;
      const barWidth = width / peaks.length;
      const centerY = canvasHeight / 2;

      peaks.forEach(([min, max], index) => {
        const x = index * barWidth;
        const barHeight = Math.abs(max - min) * canvasHeight * 0.8;
        const y = centerY - barHeight / 2;
        const isProgressBar = x < progressWidth;

        ctx.fillStyle = isProgressBar ? resolvedProgressColor : resolvedBarColor;
        ctx.fillRect(x, y, Math.max(1, barWidth - 1), barHeight);
      });
    };

    drawWaveform();

    const handleResize = () => drawWaveform();
    window.addEventListener('resize', handleResize);

    const container = containerRef.current || canvasRef.current?.parentElement;
    let resizeObserver;
    if (container && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(container);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver?.disconnect();
    };
  }, [peaks, height, progress, barColor, progressColor]);

  if (loading) {
    return (
      <div
        className={`${styles.waveformContainer} ${className}`.trim()}
        style={{ height }}
      >
        <div className={styles.loading}>Loading waveform...</div>
      </div>
    );
  }

  if (error || !peaks?.length) {
    return (
      <div
        className={`${styles.waveformContainer} ${className}`.trim()}
        style={{ height }}
      >
        <div className={styles.error}>{error || 'Waveform unavailable'}</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`${styles.waveformContainer} ${className}`.trim()}
      style={{ height }}
    >
      <canvas
        ref={canvasRef}
        width={800}
        height={height}
        className={styles.waveformCanvas}
      />
    </div>
  );
}
