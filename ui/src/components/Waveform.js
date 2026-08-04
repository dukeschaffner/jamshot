'use client';

import { useMemo } from 'react';
import { useAudio } from '../lib/AudioContext';
import WaveFormUI from './WaveFormUI';
import { useWaveformPeaks } from '../hooks/useWaveformPeaks';

/**
 * SoundCloud-style waveform with global player progress overlay.
 *
 * @param {Object} track - Track object with waveform_url and combined_waveform_url
 * @param {string} type - 'stem' or 'combined'
 * @param {number} height - Height in pixels (default: 80)
 */
export default function Waveform({ track, type = 'stem', height = 80 }) {
  const { currentTrack, progress, audioSourceType } = useAudio();

  const waveformUrl =
    track && (type === 'stem' ? track.waveform_url : track.combined_waveform_url);

  const { peaks, loading, error } = useWaveformPeaks(waveformUrl);

  const isCurrentTrack =
    currentTrack?.id === track?.id &&
    ((audioSourceType === 'audio' && type === 'stem') ||
      (audioSourceType === 'combined' && type === 'combined'));

  const normalizedProgress = useMemo(() => {
    if (!isCurrentTrack || !currentTrack?.duration) return 0;
    return Math.min(progress / currentTrack.duration, 1);
  }, [isCurrentTrack, currentTrack?.duration, progress]);

  if (!track) {
    return <WaveFormUI peaks={null} height={height} error="Waveform unavailable" />;
  }

  if (!waveformUrl) {
    return <WaveFormUI peaks={null} height={height} />;
  }

  return (
    <WaveFormUI
      peaks={peaks}
      height={height}
      progress={normalizedProgress}
      loading={loading}
      error={error}
    />
  );
}
