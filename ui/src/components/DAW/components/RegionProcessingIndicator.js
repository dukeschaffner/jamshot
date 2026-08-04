'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowsRotate, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import Popover from '../../Popover';
import {
  isClipInFlight,
  isFailedClipStatus,
} from '../project/projectClipUpload';
import styles from './RegionProcessingIndicator.module.css';

const SYNC_MESSAGE = 'Syncing project changes...';
const FAILED_MESSAGE =
  'Failed to sync changes. This may be a temporary issue. Wait a moment and click to retry.';

export default function RegionProcessingIndicator({
  processingStatus,
  regionId,
  trackId,
  onRetry,
  canRetry = false,
}) {
  const helpId = useId();
  const [anchorEl, setAnchorEl] = useState(null);
  const [hoverOpen, setHoverOpen] = useState(false);
  const hoverCloseTimeoutRef = useRef(null);

  const isSyncing = isClipInFlight(processingStatus);
  const isFailed = isFailedClipStatus(processingStatus);
  const isVisible = isSyncing || isFailed;

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

  useEffect(() => {
    return () => {
      clearHoverCloseTimeout();
    };
  }, [clearHoverCloseTimeout]);

  const handleClick = (e) => {
    e.stopPropagation();
    if (!isFailed || !canRetry || !onRetry || isSyncing) return;
    onRetry(regionId, trackId);
  };

  if (!isVisible) {
    return null;
  }

  const message = isFailed ? FAILED_MESSAGE : SYNC_MESSAGE;
  const ariaLabel = isFailed ? 'Retry syncing project changes' : 'Syncing project changes';

  return (
    <div
      ref={setAnchorEl}
      className={styles.anchor}
      onMouseEnter={showHoverPopover}
      onMouseLeave={hideHoverPopover}
    >
      {isFailed ? (
        <button
          type="button"
          className={`${styles.iconButton} ${styles.iconButtonFailed}`}
          onClick={handleClick}
          disabled={!canRetry}
          aria-label={ariaLabel}
          aria-describedby={hoverOpen ? helpId : undefined}
        >
          <FontAwesomeIcon icon={faTriangleExclamation} className={styles.icon} />
        </button>
      ) : (
        <span
          className={`${styles.iconButton} ${styles.iconButtonSyncing}`}
          aria-label={ariaLabel}
          aria-describedby={hoverOpen ? helpId : undefined}
        >
          <FontAwesomeIcon icon={faArrowsRotate} className={`${styles.icon} ${styles.spinning}`} />
        </span>
      )}
      <Popover
        isVisible={hoverOpen}
        anchorElement={anchorEl}
        className={styles.popover}
        onMouseEnter={showHoverPopover}
        onMouseLeave={hideHoverPopover}
      >
        <p className={styles.popoverText} id={helpId}>
          {message}
        </p>
      </Popover>
    </div>
  );
}
