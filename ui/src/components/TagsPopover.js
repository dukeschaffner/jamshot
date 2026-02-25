'use client';
import { useRef, useEffect, useState } from 'react';
import styles from './TagsPopover.module.css';

export default function TagsPopover({ track, isVisible, onClose, onMouseEnter, anchorElement }) {
  const popoverRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!isVisible || !anchorElement) return;

    const updatePosition = () => {
      if (!popoverRef.current) {
        // Wait for next frame if popover isn't rendered yet
        requestAnimationFrame(updatePosition);
        return;
      }

      const rect = anchorElement.getBoundingClientRect();
      const popoverRect = popoverRef.current?.getBoundingClientRect();
      
      if (!popoverRect) return;

      // Position above the anchor element, centered horizontally
      const top = rect.top - popoverRect.height - 8;
      const left = rect.left + (rect.width / 2) - (popoverRect.width / 2);

      // Ensure popover stays within viewport
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      let finalLeft = left;
      let finalTop = top;

      // Adjust if popover goes off screen horizontally
      if (finalLeft < 8) {
        finalLeft = 8;
      } else if (finalLeft + popoverRect.width > viewportWidth - 8) {
        finalLeft = viewportWidth - popoverRect.width - 8;
      }

      // If not enough space above, position below
      if (finalTop < 8) {
        finalTop = rect.bottom + 8;
      }

      setPosition({ top: finalTop, left: finalLeft });
    };

    // Small delay to ensure popover is rendered
    const timeoutId = setTimeout(updatePosition, 0);
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isVisible, anchorElement]);

  if (!isVisible || !track) return null;

  const hasGenres = track.genres && Array.isArray(track.genres) && track.genres.length > 0;
  const hasInstruments = track.instruments && Array.isArray(track.instruments) && track.instruments.length > 0;
  const hasElements = track.elements && Array.isArray(track.elements) && track.elements.length > 0;
  const hasInstrumentRequests = track.instrument_requests && Array.isArray(track.instrument_requests) && track.instrument_requests.length > 0;
  const hasElementRequests = track.element_requests && Array.isArray(track.element_requests) && track.element_requests.length > 0;

  const hasAnyTags = hasGenres || hasInstruments || hasElements || hasInstrumentRequests || hasElementRequests;
  if (!hasAnyTags) return null;


  return (
    <div
      ref={popoverRef}
      className={styles.popover}
      style={{
        position: 'fixed',
        top: `${position.top}px`,
        left: `${position.left}px`,
        zIndex: 10000,
      }}
      onMouseEnter={onMouseEnter} // Keep popover open when hovering over it
      onMouseLeave={onClose}
    >
      <div className={styles.popoverContent}>
        {hasGenres && (
          <div className={styles.category}>
            <div className={styles.categoryTitle}>Genres</div>
            <div className={styles.tags}>
              {track.genres.map((genre, index) => (
                <span key={`genre-${index}`} className={styles.tag}>
                  {typeof genre === 'string' ? genre : genre.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {hasInstruments && (
          <div className={styles.category}>
            <div className={styles.categoryTitle}>Instruments</div>
            <div className={styles.tags}>
              {track.instruments.map((instrument, index) => (
                <span key={`instrument-${index}`} className={styles.tag}>
                  {typeof instrument === 'string' ? instrument : instrument.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {hasElements && (
          <div className={styles.category}>
            <div className={styles.categoryTitle}>Elements</div>
            <div className={styles.tags}>
              {track.elements.map((element, index) => (
                <span key={`element-${index}`} className={styles.tag}>
                  {typeof element === 'string' ? element : element.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {hasInstrumentRequests && (
          <div className={styles.category}>
            <div className={styles.categoryTitle}>Requested Instruments</div>
            <div className={styles.tags}>
              {track.instrument_requests.map((instrument, index) => (
                <span key={`instrument-request-${index}`} className={styles.tag}>
                  {typeof instrument === 'string' ? instrument : instrument.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {hasElementRequests && (
          <div className={styles.category}>
            <div className={styles.categoryTitle}>Requested Elements</div>
            <div className={styles.tags}>
              {track.element_requests.map((element, index) => (
                <span key={`element-request-${index}`} className={styles.tag}>
                  {typeof element === 'string' ? element : element.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

