'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import api from '../lib/api';
import MiniTrack from './MiniTrack';
import CustomTabs from './CustomTabs';
import LoadingSpinner from './LoadingSpinner';
import TrackMeta from './TrackMeta';
import { useAudio } from '../lib/AudioContext';
import { trackTrackPlay, trackTrackPause, trackShare } from '../lib/analytics';
import { FaCheckCircle, FaCheck, FaHeart, FaRegHeart, FaRetweet, FaPlay, FaPause, FaHeadphones, FaShareAlt, FaCodeBranch, FaUsers, FaInfoCircle, FaMusic, FaEye, FaComment } from 'react-icons/fa';
import Image from 'next/image';
import TimeDisplay from './TimeDisplay';
import CommentSection from './CommentSection';
import { useUser } from '../contexts/UserContext';
import styles from './Track.module.css';
import { useMobile } from '../contexts/MobileContext';
export default function Track(
    { track, 
      allTracks, 
      setExpandedTrackId, 
      expandedTrackId,
      isTreeView = false, // Used in tree view
      setSelectedTrack, // Used in tree view
      trackTreeIds // Used in tree view
    }
  ) 
{
  const router = useRouter();
  const { isMobile } = useMobile();
  const [isExpanded, setIsExpanded] = useState(false);
  const [originalTrack, setOriginalTrack] = useState(null);
  const [collabTracks, setCollabTracks] = useState([]);
  const { currentTrack, isPlaying, playTrack, togglePlayPause } = useAudio();
  const [loadingRelated, setLoadingRelated] = useState(false);
  const [activeTab, setActiveTab] = useState('collabs');
  const [isLinkCopied, setIsLinkCopied] = useState(false);
  const { user: currentUser, isAuthenticated } = useUser();
  const [hasMoreTracks, setHasMoreTracks] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalTracks, setTotalTracks] = useState(0);

  useEffect(() => {
    setIsExpanded(expandedTrackId === track.id);
    if (expandedTrackId === track.id) {
      // Reset pagination state when track changes
      setCurrentPage(1);
      setCollabTracks([]);
      setOriginalTrack(null);
      setHasMoreTracks(false);
      
      const fetchRelatedTracks = async () => {
        try {
          setLoadingRelated(true);
          const response = await api.get(`/tracks/${track.id}/related`, {
            params: { page: 1, limit: 5 }
          });
          
          // Handle new API response format
          const { tracks, pagination } = response.data;
          
          // Set pagination info
          setHasMoreTracks(pagination?.hasMore || false);
          setTotalTracks(pagination?.total || 0);
          setCurrentPage(1);
          
          // Process tracks
          const original = tracks?.find(t => t.id === track.parent_track_id);
          const collabs = tracks?.filter(t => t.parent_track_id === track.id);
          
          setOriginalTrack(original || null);
          setCollabTracks(collabs || []);
        } catch (err) {
          console.error('Failed to fetch related tracks:', err);
        } finally {
          setLoadingRelated(false);
        }
      };
      fetchRelatedTracks();
    }
  }, [expandedTrackId, track.id, track.parent_track_id]);

  const loadMoreTracks = async () => {
    if (loadingMore || !hasMoreTracks) return;
    
    try {
      setLoadingMore(true);
      const nextPage = currentPage + 1;
      
      const response = await api.get(`/tracks/${track.id}/related`, {
        params: { page: nextPage, limit: 5 }
      });
      
      const { tracks, pagination } = response.data;
      
      // Filter just the new collab tracks
      const newCollabs = tracks?.filter(t => t.parent_track_id === track.id) || [];
      
      // Update state
      setCollabTracks(prev => [...prev, ...newCollabs]);
      setHasMoreTracks(pagination?.hasMore || false);
      setCurrentPage(nextPage);
    } catch (err) {
      console.error('Failed to load more tracks:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  const toggleExpand = () => {
    setExpandedTrackId(isExpanded ? null : track.id);
  };

  const handlePlayToggle = (e) => {
    e.stopPropagation();
    if (currentTrack?.id === track.id) {
      console.log('Toggling play/pause for:', track.title);
      if (isPlaying) {
        trackTrackPause(track.id, track.title, track.username);
      } else {
        trackTrackPlay(track.id, track.title, track.username);
      }
      togglePlayPause();
    } else {
      const currentIndex = allTracks.findIndex(t => t.id === track.id);
      const tracksToAdd = allTracks.slice(currentIndex + 1); // Exclude current track
      console.log('Playing with subsequent tracks:', tracksToAdd.map(t => t.title));
      trackTrackPlay(track.id, track.title, track.username);
      playTrack(track, tracksToAdd);
    }
  };

  const handleCopyLink = async (e) => {
    e.stopPropagation();
    
    const baseUrl = window.location.origin;
    let trackUrl = `${baseUrl}/track/${track.id}`;
    
    // If track is private, get the secret token from the API
    if (track.is_private && currentUser.id === track.user_id) {
      try {
        setIsLinkCopied(true); // Show loading state
        const response = await api.post(`/tracks/${track.id}/share`);
        trackUrl += `?secret=${response.data.secretToken}`;
      } catch (err) {
        console.error('Failed to generate share link:', err);
        alert('Failed to generate share link');
        setIsLinkCopied(false);
        return;
      }
    }
    
    navigator.clipboard.writeText(trackUrl)
      .then(() => {
        setIsLinkCopied(true);
        trackShare(track.id, track.title, track.username);
        setTimeout(() => setIsLinkCopied(false), 2000);
      })
      .catch(err => {
        console.error('Failed to copy link:', err);
        alert('Failed to copy link to clipboard');
        setIsLinkCopied(false);
      });
  };

  const navigateToUserProfile = (e) => {
    e.stopPropagation();
    router.push(`/user/${track.username}`);
  };

  const navigateToTrack = (e) => {
    e.stopPropagation();
    router.push(`/track/${track.id}`);
  };

  // Create tabs configuration
  const tabs = [
    { key: 'collabs', label: 'Collabs' },
    { key: 'comments', label: 'Comments' }
  ];

  return (
    <div className={`${styles.trackItem} ${isExpanded ? styles.expanded : ''}`}>
      {track.is_repost && track.reposted_by_username && (
        <div className={styles.repostBanner}>
          <FaRetweet className={styles.repostIcon} /> Reposted by {track.reposted_by_username}
        </div>
      )}
      
      <div className={`${styles.trackMain}`} onClick={toggleExpand}>
        <div className={styles.trackPlay} onClick={handlePlayToggle}>
          {currentTrack?.id === track.id && isPlaying ? <FaPause /> : <FaPlay />}
        </div>
        
        <div className={styles.trackArtist}>
            <Image 
              src={track?.profile_pic_url || '/avatar.svg'} 
              alt={track.username}
              width={24}
              height={24} 
              className="avatar hover:pointer mr-1" 
              onClick={navigateToUserProfile}
            />
            <div className={styles.artistName}>
              <span 
                className="link-underline" 
                onClick={navigateToUserProfile}
              >
                {track.username}
              </span>
              {track.verified && <FaCheckCircle className="verified-icon" />}
            </div>
          </div>

        <div className={styles.trackTitle}>
          <span className="title-text link-underline" onClick={navigateToTrack}>
            {track.title}
          </span>
          <div className={styles.trackLayerMessage}>
            {track?.parent_track_id ? 
            (
              <>
                <b>Layer {track.layer}</b> - Based on &quot;{track.original_title}&quot; by {track.original_username}
              </>) 
            : (<b>Original track</b>)}
          </div>
        </div>

        <TrackMeta 
          track={track}
          variant="default"
          className={styles.trackMetaSocial}
        />
        
        <div className={styles.trackMetaAudio}>

          
          {/* Display genres */}
          {track.genres && Array.isArray(track.genres) && track.genres.length > 0 && (
            <>
              {isMobile ? (
                // Mobile: show max 1 genre
                <>
                  {track.genres.length > 1 ? (
                    <span className="track-tag">
                      {typeof track.genres[0] === 'string' ? track.genres[0] : track.genres[0].name}+{track.genres.length - 1}
                    </span>
                  ) : (
                    <span className="track-tag">{typeof track.genres[0] === 'string' ? track.genres[0] : track.genres[0].name}</span>
                  )}
                </>
              ) : (
                // Desktop: show all genres
                track.genres.map((genre, index) => (
                  <span key={`genre-${index}`} className="track-tag">{typeof genre === 'string' ? genre : genre.name}</span>
                ))
              )}
            </>
          )}
          
          {/* Display instruments */}
          {track.instruments && Array.isArray(track.instruments) && track.instruments.length > 0 && (
            <>
              {isMobile ? (
                // Mobile: show max 1 instrument
                <>
                  {track.instruments.length > 1 ? (
                    <span className="track-tag">
                      {typeof track.instruments[0] === 'string' ? track.instruments[0] : track.instruments[0].name}+{track.instruments.length - 1}
                    </span>
                  ) : (
                    <span className="track-tag">{typeof track.instruments[0] === 'string' ? track.instruments[0] : track.instruments[0].name}</span>
                  )}
                </>
              ) : (
                // Desktop: show all instruments
                track.instruments.map((instrument, index) => (
                  <span key={`instrument-${index}`} className="track-tag">{typeof instrument === 'string' ? instrument : instrument.name}</span>
                ))
              )}
            </>
          )}
                      
          {track.metronome_bpm && (
            <>
              <div className={`meta-item ${styles.metronome}`}>
              <span>{track.metronome_bpm} BPM</span>
                <FaMusic /> 
              </div>
            </>
          )}
        </div>
        <div className={styles.trackActions}>
          <button 
            className={`${track.is_private ? 'share-btn-private' : 'share-btn'}`}
            onClick={handleCopyLink}
            title={isLinkCopied ? 'Link copied!' : 'Copy link to track'}
          >
            {isLinkCopied ? <FaCheck /> : <FaShareAlt />}
            {track.is_private && currentUser.id === track.user_id && <span className="share-text">Share</span>}
          </button>
          <button 
            className="pill-btn pink-btn sm" 
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/track/${track.id}`);
            }}
          >
            {track?.layer < 4 ? (<><FaUsers /> Collab</>) : (<><FaEye /> View Track</>)}
          </button>
        </div>

        <div className={styles.trackTimestamp}>
          {track.created_at && (
            <TimeDisplay timestamp={track.created_at} />
          )}
        </div>
      </div>

      {isExpanded && (
        <div className={styles.trackDetails}>
          <CustomTabs
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            variant="track"
          />
          
          {activeTab === 'collabs' && (
            <div className="track-tab-content">
              <div className={styles.relatedTracks}>
                {loadingRelated ? (
                  <div className="loading-container">
                    <LoadingSpinner size="medium" />
                    <span>Loading related tracks...</span>
                  </div>
                ) : (
                  <>
                    {originalTrack && !isTreeView && (
                      <>
                        <div className={styles.trackRelation}>Original</div>
                        <MiniTrack track={originalTrack} relatedTracks={collabTracks} />
                      </>
                    )}
                    
                    {collabTracks.length > 0 ? (
                      <>
                        <div className={styles.trackRelation}>Based on this</div>
                        {collabTracks.map(collab => (
                          <MiniTrack key={collab.id} track={collab} relatedTracks={collabTracks} isTreeView={isTreeView} setSelectedTrack={setSelectedTrack} trackTreeIds={trackTreeIds} />
                        ))}
                        
                        {hasMoreTracks && (
                          <div className="load-more-container">
                            <button 
                              className="load-more-btn" 
                              onClick={loadMoreTracks}
                              disabled={loadingMore}
                            >
                              {loadingMore ? (
                                <>
                                  <LoadingSpinner size="small" /> Loading...
                                </>
                              ) : (
                                `Load more (${collabTracks.length}/${totalTracks})`
                              )}
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {/* if tree view and no related tracks, show message */}
                        {(isTreeView || !originalTrack) && collabTracks.length === 0 && (
                          <div className={styles.noRelated}>There are no tracks based on this track</div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
          
          {activeTab === 'comments' && (
            <div className="track-tab-content">
              <CommentSection trackId={track.id} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}