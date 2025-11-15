'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FaPlay, FaPause, FaMusic, FaUser, FaCodeBranch, FaCheckCircle } from 'react-icons/fa';
import { useAudio } from '../lib/AudioContext';
import TimeDisplay from './TimeDisplay';
import styles from './BeatCard.module.css';

export default function BeatCard({ beat, campId }) {
  const router = useRouter();
  const { currentTrack, isPlaying, playTrack, togglePlayPause } = useAudio();
  const [isHovered, setIsHovered] = useState(false);

  const isCurrentTrack = currentTrack?.id === beat.id;

  const handlePlayToggle = (e) => {
    e.stopPropagation();
    
    if (isCurrentTrack) {
      togglePlayPause();
    } else {
      playTrack(beat, []);
    }
  };

  const handleStartIdea = () => {
    // Navigate to track page with camp context
    router.push(`/track/${beat.id}?camp_id=${campId}`);
  };

  const handleCardClick = () => {
    // Navigate to beat details page
    router.push(`/track/${beat.id}`);
  };

  return (
    <div 
      className={styles.beatCard}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={styles.beatWaveform} onClick={handleCardClick}>
        {/* Placeholder for waveform visualization */}
        <div className={styles.waveformPlaceholder}>
          <FaMusic />
        </div>
        
        {/* Play button overlay */}
        <button 
          className={`${styles.playButton} ${(isHovered || isCurrentTrack && isPlaying) ? styles.visible : ''}`}
          onClick={handlePlayToggle}
        >
          {isCurrentTrack && isPlaying ? <FaPause /> : <FaPlay />}
        </button>
      </div>

      <div className={styles.beatInfo}>
        <div className={styles.beatHeader}>
          <h3 className={styles.beatTitle} onClick={handleCardClick}>
            {beat.title || 'Untitled Beat'}
          </h3>
        </div>

        <div className={styles.beatMeta}>
          <div className={styles.metaItem} onClick={() => router.push(`/user/${beat.username}`)}>
            <FaUser />
            <span>{beat.username}</span>
            {beat.verified && <FaCheckCircle className={styles.verified} />}
          </div>

          <div className={styles.metaRow}>
            {beat.metronome_bpm && (
              <span className={styles.metaChip}>
                {beat.metronome_bpm} BPM
              </span>
            )}
            {beat.key && (
              <span className={styles.metaChip}>
                {beat.key}
              </span>
            )}
            {beat.time_signature && (
              <span className={styles.metaChip}>
                {beat.time_signature}
              </span>
            )}
          </div>

          <div className={styles.metaStats}>
            <div className={styles.statItem}>
              <FaCodeBranch />
              <span>{beat.collab_count || 0} versions</span>
            </div>
            {/* <div className={styles.statItem}>
              <TimeDisplay seconds={beat.duration} />
            </div> */}
          </div>
        </div>

        <button onClick={handleStartIdea} className={styles.startButton}>
          <FaMusic />
          <span>Start Idea</span>
        </button>
      </div>
    </div>
  );
}

