'use client';

import styles from './Track.module.css';
import LoopIconWithPopover from './LoopIconWithPopover';
import TrackTags from './TrackTags';
import { FaClock, FaMusic } from 'react-icons/fa';
import { formatDuration } from '../lib/utils';

export default function TrackMetaAudio({ 
  track
}) {
  const hasDuration = track.duration !== null && track.duration !== undefined && track.duration !== '';
  const showMetronome = Boolean(track.metronome_bpm);
  const showLoop = Boolean(track.is_loop);

  const metaItems = [];

  if (hasDuration) {
    metaItems.push(
      <div key="duration" className="meta-item">
        <span>{formatDuration(Number(track.duration))}</span>
        <FaClock className="time-icon shrink-0" />
      </div>
    );
  }

  if (showMetronome) {
    metaItems.push(
      <div key="metronome" className={`meta-item ${styles.metronome}`}>
        <span style={{ whiteSpace: 'nowrap' }}>{track.metronome_bpm} BPM</span>
        <FaMusic className="shrink-0" />
      </div>
    );
  }

  if (showLoop) {
    metaItems.push(
      <LoopIconWithPopover
        key="loop"
        track={track}
        className={`meta-item ${styles.metronome}`}
      />
    );
  }

  return (
    <div className={styles.trackMetaAudio}>
      <TrackTags track={track} variant="light" />
      <div className="flex flex-row">
        {metaItems.map((item, index) => (
          <div key={`meta-item-${index}`} className="flex">
            {index > 0 && <span style={{ color: 'var(--grey-2)' }}>//</span>}
            {item}
          </div>
        ))}
      </div>
    </div>
  );
} 