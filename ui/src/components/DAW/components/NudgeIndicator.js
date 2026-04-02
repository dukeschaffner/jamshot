'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import Popover from '../../Popover';
import styles from './NudgeIndicator.module.css';
import { eventBus } from '../misc/EventBus';
import { DAW_EVENTS } from '../misc/DAWEvents';

const INTRO_SEEN_KEY = 'jamshot.daw.nudgeIndicatorIntroSeen';

/** Avoid stacking multiple first-run intros if several nudged regions mount together. */
let introSlotClaimed = false;

export default function NudgeIndicator({ region, trackId }) {
  const helpId = useId();
  const [anchorEl, setAnchorEl] = useState(null);
  const [hoverOpen, setHoverOpen] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  const hoverCloseTimeoutRef = useRef(null);
  const introTimeoutRef = useRef(null);

  const clearHoverCloseTimeout = useCallback(() => {
    if (hoverCloseTimeoutRef.current) {
      clearTimeout(hoverCloseTimeoutRef.current);
      hoverCloseTimeoutRef.current = null;
    }
  }, []);

  const showHoverPopover = useCallback(() => {
    clearHoverCloseTimeout();
    setHoverOpen(true);
  }, [clearHoverCloseTimeout]);

  const hideHoverPopover = useCallback(() => {
    hoverCloseTimeoutRef.current = setTimeout(() => {
      setHoverOpen(false);
      hoverCloseTimeoutRef.current = null;
    }, 120);
  }, []);

  const dismissIntro = useCallback(() => {
    if (introTimeoutRef.current) {
      clearTimeout(introTimeoutRef.current);
      introTimeoutRef.current = null;
    }
    try {
      localStorage.setItem(INTRO_SEEN_KEY, '1');
    } catch {
      /* ignore */
    }
    setIntroOpen(false);
  }, []);

  useEffect(() => {
    if (!region?.isNudged) return undefined;

    let cancelled = false;
    let claimedHere = false;
    try {
      if (typeof window !== 'undefined' && !localStorage.getItem(INTRO_SEEN_KEY)) {
        if (introSlotClaimed) return undefined;
        introSlotClaimed = true;
        claimedHere = true;
        setIntroOpen(true);
        introTimeoutRef.current = setTimeout(() => {
          introTimeoutRef.current = null;
          if (!cancelled) dismissIntro();
        }, 5000);
      }
    } catch {
      /* ignore */
    }

    return () => {
      cancelled = true;
      if (introTimeoutRef.current) {
        clearTimeout(introTimeoutRef.current);
        introTimeoutRef.current = null;
      }
      try {
        if (
          claimedHere &&
          typeof window !== 'undefined' &&
          !localStorage.getItem(INTRO_SEEN_KEY)
        ) {
          introSlotClaimed = false;
        }
      } catch {
        /* ignore */
      }
    };
  }, [region?.isNudged, dismissIntro]);

  useEffect(() => {
    return () => {
      clearHoverCloseTimeout();
    };
  }, [clearHoverCloseTimeout]);

  if (!region?.isNudged) return null;

  const handleClick = (e) => {
    e.stopPropagation();
    // audio file start time = start time - offset
    // latency diff = old audio file start time - new audio file start time
    const oldAudioFileStartTime = region.originalStartTime - region.originalOffset;
    const newAudioFileStartTime = region.startTime - region.offset;
    const latencyDiff = oldAudioFileStartTime - newAudioFileStartTime;
    const oldUserCompensation = region.latencyData.userCompensation || 0;
    const autoLatency = region.latencyData.autoLatency || 0;
    let newUserCompensation = oldUserCompensation + latencyDiff - autoLatency;

    const maxLatency = 0.1; // 100ms
    newUserCompensation = Math.max(0, Math.min(maxLatency, newUserCompensation));

    const newUserLatencyCompensationMs = Math.round(newUserCompensation * 1000);
    eventBus.emit(DAW_EVENTS.AUDIO_SETTINGS.LATENCY_COMPENSATION_SET, {
      latencyCompensation: newUserLatencyCompensationMs
    });

    eventBus.emit(DAW_EVENTS.REGION.UPDATE, {
      region: {
        ...region,
        isNudged: false
      },
      trackId
    });
  };

  const popoverVisible = introOpen || hoverOpen;

  return (
    <div
      ref={setAnchorEl}
      className={styles.anchor}
      onMouseEnter={showHoverPopover}
      onMouseLeave={hideHoverPopover}
    >
      <button
        type="button"
        className={styles.nudgedIndicator}
        onClick={handleClick}
        aria-label="Apply nudge to latency compensation"
        aria-describedby={popoverVisible ? helpId : undefined}
      />
      <Popover
        isVisible={popoverVisible}
        anchorElement={anchorEl}
        className={styles.nudgePopover}
        onMouseEnter={showHoverPopover}
        onMouseLeave={hideHoverPopover}
      >
        <div
          className={`${styles.nudgePopoverInner}${introOpen ? ` ${styles.nudgePopoverInnerWithClose}` : ''}`}
          id={helpId}
        >
          {introOpen && (
            <button
              type="button"
              className={styles.nudgePopoverClose}
              onClick={(e) => {
                e.stopPropagation();
                dismissIntro();
              }}
              aria-label="Dismiss tip"
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          )}
          <p className={styles.nudgePopoverText}>
            Region nudge detected. Click the dot to set your latency compensation to the nudge value. This will help keep recording and playback aligned.
          </p>
        </div>
      </Popover>
    </div>
  );
}
