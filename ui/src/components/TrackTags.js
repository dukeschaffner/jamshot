'use client';
import { useState, useRef, useEffect } from 'react';
import { useMobile } from '../contexts/MobileContext';
import TagsPopover from './TagsPopover';
import styles from './TrackTags.module.css';

export default function TrackTags({ track, variant = 'light', showAllCategories = false, categories = null, className = '', enableTruncate = null }) {
  const { isMobile } = useMobile();
  const [showPopover, setShowPopover] = useState(false);
  const containerRef = useRef(null);
  const closeTimeoutRef = useRef(null);
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);
  
  if (!track) return null;
  
  const hasGenres = track.genres && Array.isArray(track.genres) && track.genres.length > 0;
  const hasInstruments = track.instruments && Array.isArray(track.instruments) && track.instruments.length > 0;
  const hasElements = track.elements && Array.isArray(track.elements) && track.elements.length > 0;
  const hasInstrumentRequests = track.instrument_requests && Array.isArray(track.instrument_requests) && track.instrument_requests.length > 0;
  const hasElementRequests = track.element_requests && Array.isArray(track.element_requests) && track.element_requests.length > 0;
  
  // If categories prop is provided, filter by those categories
  // Otherwise, for light/dark variants (collapsed/minitrack view), show genres, instruments, and elements (not requests)
  // If showAllCategories is true, show all categories
  const isCollapsedView = categories === null && !showAllCategories;
  const shouldShowGenres = hasGenres && (categories === null ? true : categories.includes('genres'));
  const shouldShowInstruments = hasInstruments && (categories === null ? true : categories.includes('instruments'));
  const shouldShowElements = hasElements && (categories === null ? true : categories.includes('elements'));
  const shouldShowInstrumentRequests = hasInstrumentRequests && (categories === null ? false : categories.includes('instrument_requests'));
  const shouldShowElementRequests = hasElementRequests && (categories === null ? false : categories.includes('element_requests'));
  
  if (!shouldShowGenres && !shouldShowInstruments && !shouldShowElements && !shouldShowInstrumentRequests && !shouldShowElementRequests) return null;
  
  // Determine CSS classes based on variant
  const tagClass = variant === 'dark' ? 'track-tag mini' : 'track-tag';
  const containerClass = `${styles.trackTagsContainer} track-tags ${className}`.trim();
  
  // Determine if truncation should be enabled
  // Default: enable truncation for collapsed views (light/dark variants when categories is null)
  const shouldTruncate = enableTruncate !== null ? enableTruncate : isCollapsedView;
  
  // Render tag with truncation support (works on both mobile and desktop)
  const renderTag = (item, index, shouldTruncateCategory = false, totalCount = 0) => {
    const name = typeof item === 'string' ? item : item.name;
    const key = item.id || index;
    
    if (shouldTruncateCategory && totalCount > 1 && index === 0) {
      return (
        <span key={key} className={tagClass}>
          {name}+{totalCount - 1}
        </span>
      );
    }
    
    if (shouldTruncateCategory && index > 0) {
      return null;
    }
    
    return (
      <span key={key} className={tagClass}>
        {name}
      </span>
    );
  };
  
  // Show popover on hover for collapsed views (to show all tags)
  const shouldShowPopover = isCollapsedView && !isMobile;
  
  const handleMouseEnter = () => {
    if (shouldShowPopover) {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
      setShowPopover(true);
    }
  };
  
  const handleMouseLeave = () => {
    if (shouldShowPopover) {
      // Small delay to allow mouse to move to popover
      closeTimeoutRef.current = setTimeout(() => {
        setShowPopover(false);
      }, 100);
    }
  };
  
  return (
    <>
      <div
        ref={containerRef}
        className={containerClass}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {shouldShowGenres && track.genres.map((genre, index) => 
          renderTag(genre, index, shouldTruncate, track.genres.length)
        )}
        
        {shouldShowInstruments && track.instruments.map((instrument, index) => 
          renderTag(instrument, index, shouldTruncate, track.instruments.length)
        )}

        {shouldShowElements && track.elements.map((element, index) => 
          renderTag(element, index, shouldTruncate, track.elements.length)
        )}

        {shouldShowInstrumentRequests && track.instrument_requests.map((instrument, index) => {
          const name = typeof instrument === 'string' ? instrument : instrument.name;
          // Don't show "Requested: " prefix when categories prop is provided (tags tab context)
          const displayName = categories !== null ? name : `Requested: ${name}`;
          return (
            <span key={`instrument-request-${instrument.id || index}`} className={tagClass}>
              {displayName}
            </span>
          );
        })}

        {shouldShowElementRequests && track.element_requests.map((element, index) => {
          const name = typeof element === 'string' ? element : element.name;
          // Don't show "Requested: " prefix when categories prop is provided (tags tab context)
          const displayName = categories !== null ? name : `Requested: ${name}`;
          return (
            <span key={`element-request-${element.id || index}`} className={tagClass}>
              {displayName}
            </span>
          );
        })}
      </div>
      
      {shouldShowPopover && (
        <TagsPopover
          track={track}
          isVisible={showPopover}
          onClose={() => {
            if (closeTimeoutRef.current) {
              clearTimeout(closeTimeoutRef.current);
              closeTimeoutRef.current = null;
            }
            setShowPopover(false);
          }}
          onMouseEnter={() => {
            if (closeTimeoutRef.current) {
              clearTimeout(closeTimeoutRef.current);
              closeTimeoutRef.current = null;
            }
          }}
          anchorElement={containerRef.current}
        />
      )}
    </>
  );
}
