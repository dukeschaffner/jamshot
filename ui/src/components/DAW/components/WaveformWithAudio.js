'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Howl } from 'howler';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPause, faPlay } from '@fortawesome/free-solid-svg-icons';
import { useAudio } from '@/lib/AudioContext';
import WaveFormUI from '@/components/WaveFormUI';
import { useWaveformPeaks } from '@/hooks/useWaveformPeaks';
import {
  clearAssetPreviewPlayback,
  pauseOtherAudioSources,
  registerAssetPreviewPlayback,
  stopAssetPreviewPlayback,
} from '../project/projectAssetPreviewPlayback';
import styles from './WaveformWithAudio.module.css';

/**
 * Mini waveform with local Howler preview playback.
 * Pauses DAW transport, global player, and other asset previews when playing.
 */
export default function WaveformWithAudio({
  audioUrl,
  waveformUrl,
  durationSeconds = null,
  height = 40,
  className = '',
}) {
  const { isPlaying: isGlobalPlaying, togglePlayPause } = useAudio();
  const howlRef = useRef(null);
  const soundIdRef = useRef(null);
  const durationRef = useRef(durationSeconds);
  const progressFrameRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    durationRef.current = durationSeconds;
  }, [durationSeconds]);

  const { peaks, loading, error } = useWaveformPeaks(waveformUrl);

  const stopProgressUpdates = useCallback(() => {
    if (progressFrameRef.current != null) {
      cancelAnimationFrame(progressFrameRef.current);
      progressFrameRef.current = null;
    }
  }, []);

  const stopPlayback = useCallback(() => {
    stopProgressUpdates();

    if (howlRef.current) {
      howlRef.current.off();
      howlRef.current.stop();
      howlRef.current.unload();
      howlRef.current = null;
    }

    soundIdRef.current = null;
    setIsPlaying(false);
    setProgress(0);
    clearAssetPreviewPlayback(stopPlayback);
  }, [stopProgressUpdates]);

  useEffect(() => () => stopPlayback(), [stopPlayback]);

  const startProgressUpdates = useCallback(() => {
    stopProgressUpdates();

    const tick = () => {
      const howl = howlRef.current;
      if (!howl) return;

      const seekPos = howl.seek();
      const duration =
        durationRef.current ||
        (howl.state() === 'loaded' ? howl.duration() : 0) ||
        1;

      const nextProgress =
        typeof seekPos === 'number' && duration > 0
          ? Math.min(Math.max(seekPos / duration, 0), 1)
          : 0;

      setProgress(nextProgress);
      progressFrameRef.current = requestAnimationFrame(tick);
    };

    progressFrameRef.current = requestAnimationFrame(tick);
  }, [stopProgressUpdates]);

  const handleTogglePlay = useCallback(() => {
    if (isPlaying) {
      stopPlayback();
      return;
    }

    if (!audioUrl) return;

    stopAssetPreviewPlayback();
    pauseOtherAudioSources({
      pauseGlobalPlayer: isGlobalPlaying ? togglePlayPause : undefined,
    });

    const howl = new Howl({
      src: [audioUrl],
      html5: true,
      onload: () => {
        const loadedDuration = howl.duration();
        if (loadedDuration && Number.isFinite(loadedDuration)) {
          durationRef.current = loadedDuration;
        }
      },
      onplay: (soundId) => {
        soundIdRef.current = soundId;
        setIsPlaying(true);
        startProgressUpdates();
      },
      onend: () => stopPlayback(),
      onloaderror: () => stopPlayback(),
      onplayerror: () => stopPlayback(),
    });

    howlRef.current = howl;
    registerAssetPreviewPlayback(stopPlayback);
    soundIdRef.current = howl.play();
  }, [
    audioUrl,
    isGlobalPlaying,
    isPlaying,
    startProgressUpdates,
    stopPlayback,
    togglePlayPause,
  ]);

  const canPlay = Boolean(audioUrl);
  const normalizedProgress = isPlaying ? progress : 0;

  return (
    <div className={`${styles.container} ${className}`.trim()}>
      <button
        type="button"
        className={styles.playButton}
        onClick={handleTogglePlay}
        disabled={!canPlay}
        aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
      >
        <FontAwesomeIcon icon={isPlaying ? faPause : faPlay} />
      </button>
      <div className={styles.waveform}>
        <WaveFormUI
          peaks={peaks}
          height={height}
          progress={normalizedProgress}
          loading={loading}
          error={error}
          barColor="#555555"
          progressColor="#93E9BE"
        />
      </div>
    </div>
  );
}
