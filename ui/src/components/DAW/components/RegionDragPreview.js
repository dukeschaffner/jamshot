'use client';

import { useEffect, useState } from 'react';
import { bufferRegistry } from '../core/BufferRegistry';
import WaveformChunk from './waveform/WaveformChunk';
import regionStyles from './Region.module.css';
import styles from './Track.module.css';

const MAX_CHUNK_WIDTH = 1000;

export default function RegionDragPreview({
  preview,
  duration,
  tracksContainerWidth,
}) {
  const [buffer, setBuffer] = useState(null);
  const [bufferData, setBufferData] = useState(null);

  useEffect(() => {
    if (!preview?.bufferKey) return;
    const audioBuffer = bufferRegistry.getBuffer(preview.bufferKey);
    if (!audioBuffer) return;

    setBuffer(audioBuffer);
    const numChannels = audioBuffer.numberOfChannels;
    setBufferData(
      Array.from({ length: numChannels }, (_, i) => audioBuffer.getChannelData(i))
    );
  }, [preview?.bufferKey]);

  if (!preview || !duration || !tracksContainerWidth) return null;

  const clipDuration = preview.endTime - preview.startTime;
  const waveformWidthPx = buffer
    ? buffer.duration * (tracksContainerWidth / duration)
    : 0;
  const waveformLeftPos = buffer
    ? (-(preview.offset / clipDuration) * 100)
    : 0;
  const waveformTimelineOffsetPx =
    duration > 0
      ? ((preview.startTime - preview.offset) / duration) * tracksContainerWidth
      : 0;

  const chunks = [];
  if (buffer && waveformWidthPx > 0) {
    const baseChunkWidth = Math.min(MAX_CHUNK_WIDTH, waveformWidthPx);
    const chunksCount = Math.ceil(waveformWidthPx / baseChunkWidth);
    for (let i = 0; i < chunksCount; i += 1) {
      const startPixel = i * baseChunkWidth;
      const endPixel = Math.min(startPixel + baseChunkWidth, waveformWidthPx);
      chunks.push({
        id: i,
        width: endPixel - startPixel,
        offset: startPixel,
      });
    }
  }

  return (
    <div
      className={`${styles.crossTrackDragPreview} ${
        preview.isValid ? '' : styles.crossTrackDragPreviewInvalid
      }`}
      style={{
        left: `${preview.leftPercent}%`,
        width: `${preview.widthPercent}%`,
      }}
      aria-hidden
    >
      <div
        className={regionStyles.region}
        style={{ width: '100%', height: '100%' }}
      >
        <div
          className={regionStyles.waveformContainer}
          style={{
            width: `${waveformWidthPx}px`,
            height: '100%',
            left: `${waveformLeftPos}%`,
          }}
        >
          <div
            className={regionStyles.waveformContent}
            style={{ width: '100%', height: '100%', position: 'relative' }}
          >
            {chunks.map((chunk) => (
              <WaveformChunk
                key={chunk.id}
                bufferData={bufferData}
                height={100}
                totalWidth={waveformWidthPx}
                timelineOffset={waveformTimelineOffsetPx}
                width={chunk.width}
                offset={chunk.offset}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
