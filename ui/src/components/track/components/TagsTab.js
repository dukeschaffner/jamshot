'use client';
import styles from '../../Track.module.css';
import TrackTags from '../../TrackTags';

export default function TagsTab({ track }) {

  return (
    <div className="track-tab-content">
      <div className={styles.tagsTabContent}>
        {/* Genres */}
        {track.genres && Array.isArray(track.genres) && track.genres.length > 0 && (
          <div className={styles.tagCategory}>
            <h3 className={styles.tagCategoryTitle}>Genres</h3>
            <TrackTags track={track} variant="dark" categories={['genres']} />
          </div>
        )}
        
        {/* Instruments */}
        {track.instruments && Array.isArray(track.instruments) && track.instruments.length > 0 && (
          <div className={styles.tagCategory}>
            <h3 className={styles.tagCategoryTitle}>Instruments</h3>
            <TrackTags track={track} variant="dark" categories={['instruments']} />
          </div>
        )}
        
        {/* Elements */}
        {track.elements && Array.isArray(track.elements) && track.elements.length > 0 && (
          <div className={styles.tagCategory}>
            <h3 className={styles.tagCategoryTitle}>Elements</h3>
            <TrackTags track={track} variant="dark" categories={['elements']} />
          </div>
        )}
        
        {/* Requested Instruments */}
        {track.instrument_requests && Array.isArray(track.instrument_requests) && track.instrument_requests.length > 0 && (
          <div className={styles.tagCategory}>
            <h3 className={styles.tagCategoryTitle}>Requested Instruments</h3>
            <TrackTags track={track} variant="dark" categories={['instrument_requests']} />
          </div>
        )}
        
        {/* Requested Elements */}
        {track.element_requests && Array.isArray(track.element_requests) && track.element_requests.length > 0 && (
          <div className={styles.tagCategory}>
            <h3 className={styles.tagCategoryTitle}>Requested Elements</h3>
            <TrackTags track={track} variant="dark" categories={['element_requests']} />
          </div>
        )}
        
        {/* Show message if no tags */}
        {(!track.genres || track.genres.length === 0) &&
          (!track.instruments || track.instruments.length === 0) &&
          (!track.elements || track.elements.length === 0) &&
          (!track.instrument_requests || track.instrument_requests.length === 0) &&
          (!track.element_requests || track.element_requests.length === 0) && (
          <div className={styles.noTags}>No tags available for this track</div>
        )}
      </div>
    </div>
  );
}

