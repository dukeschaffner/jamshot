'use client';
import React, { useState, useEffect, useRef } from 'react';
import { useAudio } from '../lib/AudioContext';
import { FaPlay, FaPause, FaHeart, FaRegHeart, FaRetweet, FaCheckCircle, FaMusic } from 'react-icons/fa';
import Cookies from 'js-cookie';
import api from '../lib/api';
import { useRouter, usePathname } from 'next/navigation';
import TimeDisplay from './TimeDisplay';
import UserListModal from './UserListModal';
import TrackMeta from './TrackMeta';
import { useUser } from '../contexts/UserContext';
import { getLikeCountString } from '../lib/utils';
import { useMobile } from '../contexts/MobileContext';
import styles from './MiniTrack.module.css';
import TrackTags from './TrackTags';
import {
  captureTrackPlayPressed,
  captureTrackSurfaceViewed,
  deriveDiscoveryMethod,
  deriveSiteSection,
} from '../lib/posthogAnalytics';

export function MiniPlayButton({ isPlaying, isCurrentTrack, handleToggle }) {
  return (
    <div className={styles.miniTrackPlay} onClick={handleToggle}>
      {isPlaying && isCurrentTrack ? <FaPause /> : <FaPlay />}
    </div>
  );
}

export default function MiniTrack(
  { 
    track, 
    relatedTracks = [], 
    view = 'default', // Used in tree view, competition view, or default
    trackTreeIds, // Used in tree view
    placement = null, // e.g. expanded_collabs_original — clarifies nested UI when pathname alone is ambiguous
  }
) {
  const router = useRouter();
  const pathname = usePathname();
  const { isMobile } = useMobile();
  const { currentTrack, isPlaying, togglePlayPause, playTrack, setDiscoveryMethod } = useAudio();
  const isCurrentTrack = currentTrack?.id === track.id;
  const { user: currentUser, isAuthenticated } = useUser();
  const miniSurfaceRef = useRef(null);
  const miniViewRecordedRef = useRef(false);

  useEffect(() => {
    miniViewRecordedRef.current = false;
  }, [track.id]);

  useEffect(() => {
    const el = miniSurfaceRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || miniViewRecordedRef.current) return;
        miniViewRecordedRef.current = true;
        captureTrackSurfaceViewed({
          component_type: 'minitrack',
          track_id: track.id,
          track_guid: track.guid,
          track_title: track.title,
          site_section: deriveSiteSection(pathname),
          view,
          placement: placement || undefined,
        });
      },
      { threshold: 0.35, rootMargin: '0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [track.id, track.guid, track.title, pathname, view, placement]);
  
  const handlePlayToggle = (e) => {
    e.stopPropagation();

    const discoveryMethod = deriveDiscoveryMethod(pathname || (typeof window !== 'undefined' ? window.location.pathname : ''));
    setDiscoveryMethod(discoveryMethod);

    const playPayload = {
      component_type: 'minitrack',
      track_id: track.id,
      track_guid: track.guid,
      track_title: track.title,
      site_section: deriveSiteSection(pathname),
      view,
      placement: placement || undefined,
    };

    if (isCurrentTrack) {
      if (!isPlaying) {
        captureTrackPlayPressed({ ...playPayload, is_resume: true });
      }
      togglePlayPause();
    } else {
      captureTrackPlayPressed({ ...playPayload, is_resume: false });
      const currentIndex = relatedTracks.findIndex(t => t.id === track.id);
      const tracksToAdd = currentIndex >= 0 ? relatedTracks.slice(currentIndex + 1) : [];
      playTrack(track, tracksToAdd);
    }
  };
  
  const handleSelectTrack = (e) => {
    if(view === 'tree') {
      e.stopPropagation();
      router.push(`/tree/${track.id}`);
    }
  };
  
  const navigateToUserProfile = (e) => {
    e.stopPropagation();
    router.push(`/user/${track.username}`);
  };
  
  const navigateToTrack = (e) => {
    e.stopPropagation();
    router.push(`/track/${track.guid}`);
  };
  
  return (
    <div 
      ref={miniSurfaceRef}
      className={`${styles.miniTrackTrack} ${view === 'tree' && trackTreeIds && trackTreeIds.includes(track.id) ? styles.selected : 'cursor-pointer'}`}
      onClick={handleSelectTrack}
    >
      <MiniPlayButton isPlaying={isPlaying} isCurrentTrack={isCurrentTrack} handleToggle={handlePlayToggle} />
      <div className={styles.miniTrackTitleContainer}>
          <div className={styles.miniTrackTitle}>
            <span className="link-underline" onClick={navigateToTrack}>
              {track.title}
            </span>
          </div>
          {(track.tags?.length > 0 || track.genres?.length > 0 || track.instruments?.length > 0) && (
            <div className={styles.miniTrackTags}>
              <TrackTags track={track} variant="dark" />
            </div>
          )}
      </div>
      <div className={styles.miniTrackArtist}>
        <span 
          className="link-underline artist-name"
          onClick={navigateToUserProfile}
        >
          {track.username || 'Unknown Artist'}
          {track.verified && <FaCheckCircle className="verified-icon" />}
        </span>
      </div>
      {track.created_at && (
        <TimeDisplay className={styles.miniTrackTime} timestamp={track.created_at} />
      )}
      <TrackMeta 
        className={styles.miniTrackMeta}
        track={track}
        variant='mini'
      />
    </div>
  );
}

export { MiniPlayButton };