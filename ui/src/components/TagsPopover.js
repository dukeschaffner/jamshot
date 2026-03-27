'use client';
import Popover from './Popover';
import styles from './TagsPopover.module.css';

export default function TagsPopover({ track, isVisible, onClose, onMouseEnter, anchorElement }) {
  if (!isVisible || !track) return null;

  const hasGenres = track.genres && Array.isArray(track.genres) && track.genres.length > 0;
  const hasInstruments = track.instruments && Array.isArray(track.instruments) && track.instruments.length > 0;
  const hasElements = track.elements && Array.isArray(track.elements) && track.elements.length > 0;
  const hasInstrumentRequests = track.instrument_requests && Array.isArray(track.instrument_requests) && track.instrument_requests.length > 0;
  const hasElementRequests = track.element_requests && Array.isArray(track.element_requests) && track.element_requests.length > 0;

  const hasAnyTags = hasGenres || hasInstruments || hasElements || hasInstrumentRequests || hasElementRequests;
  if (!hasAnyTags) return null;

  return (
    <Popover
      isVisible={isVisible}
      anchorElement={anchorElement}
      className={styles.popover}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onClose}
    >
      <div>
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
    </Popover>
  );
}

