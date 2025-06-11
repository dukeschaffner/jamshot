'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import api from '../lib/api';
import MiniTrack from './MiniTrack';
import TrackTags from './TrackTags';
import { useAudio } from '../lib/AudioContext';
import { FaCheckCircle, FaCheck, FaHeart, FaRegHeart, FaRetweet, FaPlay, FaPause, FaHeadphones, FaShareAlt, FaCodeBranch, FaUsers, FaInfoCircle, FaMusic, FaEye, FaComment, FaSpinner } from 'react-icons/fa';
import Image from 'next/image';
import TimeDisplay from './TimeDisplay';
import CommentSection from './CommentSection';
import { useUser } from '../contexts/UserContext';

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
  const [isExpanded, setIsExpanded] = useState(false);
  const [originalTrack, setOriginalTrack] = useState(null);
  const [collabTracks, setCollabTracks] = useState([]);
  const { currentTrack, isPlaying, playTrack, togglePlayPause } = useAudio();
  const [isLiked, setIsLiked] = useState(track.is_liked || false);
  const [likeCount, setLikeCount] = useState(Number(track.like_count) || 0);
  const [repostCount, setRepostCount] = useState(Number(track.repost_count) || 0);
  const [isLikeInProgress, setIsLikeInProgress] = useState(false);
  const [isReposted, setIsReposted] = useState(track.is_reposted || false);
  const [isRepostInProgress, setIsRepostInProgress] = useState(false);
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

  useEffect(() => {
    // Update like and repost state when track prop changes
    setIsLiked(track.is_liked || false);
    setLikeCount(Number(track.like_count) || 0);
    setIsReposted(track.is_reposted || false);
    setRepostCount(Number(track.repost_count) || 0);
  }, [track.is_liked, track.like_count, track.is_reposted, track.repost_count]);

  const toggleExpand = () => {
    setExpandedTrackId(isExpanded ? null : track.id);
  };

  const handlePlayToggle = (e) => {
    e.stopPropagation();
    if (currentTrack?.id === track.id) {
      console.log('Toggling play/pause for:', track.title);
      togglePlayPause();
    } else {
      const currentIndex = allTracks.findIndex(t => t.id === track.id);
      const tracksToAdd = allTracks.slice(currentIndex + 1); // Exclude current track
      console.log('Playing with subsequent tracks:', tracksToAdd.map(t => t.title));
      playTrack(track, tracksToAdd);
    }
  };

  const handleLikeToggle = async (e) => {
    e.stopPropagation();
    
    // Prevent action if already in progress
    if (isLikeInProgress) return;
    setIsLikeInProgress(true);
    
    try {
      if (!isAuthenticated) {
        // Handle unauthenticated user
        alert('Please log in to like tracks');
        return;
      }
      
      if (isLiked) {
        await api.delete(`/tracks/${track.id}/like`);
        setIsLiked(false);
        setLikeCount(prevCount => Math.max(0, Number(prevCount) - 1));
      } else {
        await api.post(`/tracks/${track.id}/like`);
        setIsLiked(true);
        setLikeCount(prevCount => Number(prevCount) + 1);
      }
      
      // Force re-render
      setExpandedTrackId(expandedTrackId);
    } catch (err) {
      console.error('Failed to toggle like:', err);
      // If there's an error, revert the UI state
      if (err.response && err.response.status === 401) {
        // User is not authenticated
        alert('Please log in to like tracks');
      }
    } finally {
      setIsLikeInProgress(false);
    }
  };

  const handleRepostToggle = async (e) => {
    e.stopPropagation();
    
    // Prevent action if already in progress
    if (isRepostInProgress) return;
    
    if (!isAuthenticated) {
      alert('Please log in to repost tracks');
      return;
    }
    
    setIsRepostInProgress(true);
    
    try {
      if (isReposted) {
        await api.delete(`/tracks/${track.id}/repost`);
        setIsReposted(false);
        setRepostCount(prevCount => Math.max(0, Number(prevCount) - 1));
      } else {
        await api.post(`/tracks/${track.id}/repost`);
        setIsReposted(true);
        setRepostCount(prevCount => Number(prevCount) + 1);
      }
      
      // Force re-render
      setExpandedTrackId(expandedTrackId);
    } catch (err) {
      console.error('Failed to toggle repost:', err);
      if (err.response && err.response.status === 400) {
        alert(err.response.data.error || 'Cannot repost this track');
      } else if (err.response && err.response.status === 401) {
        alert('Please log in to repost tracks');
      } else {
        alert('Failed to repost track');
      }
    } finally {
      setIsRepostInProgress(false);
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

  const atLeastOneTag = track.tags && track.tags.length > 0 || track.genres && track.genres.length > 0 || track.instruments && track.instruments.length > 0;

  return (
    <div className={`track-item ${isExpanded ? 'expanded' : ''}`}>
      {track.is_repost && track.reposted_by_username && (
        <div className="repost-banner">
          <FaRetweet className="repost-icon" /> Reposted by {track.reposted_by_username}
        </div>
      )}
      
      <div className="track-main" onClick={toggleExpand}>
        <div className="track-play" onClick={handlePlayToggle}>
          {currentTrack?.id === track.id && isPlaying ? <FaPause /> : <FaPlay />}
        </div>
        
        <div className="track-info">
          <div className="track-artist">
            <div className="artist-avatar" onClick={navigateToUserProfile}>
              <Image 
                src={track?.profile_pic_url || '/avatar.svg'} 
                alt={track.username} 
                width={40} 
                height={40}
                style={{ borderRadius: '50%', objectFit: 'cover', cursor: 'pointer' }}
              />
            </div>
            <div className="artist-name">
              <span 
                className="link-underline" 
                onClick={navigateToUserProfile}
              >
                {track.username}
              </span>
              {track.verified && <FaCheckCircle className="verified-icon" />}
            </div>
          </div>

          <div className="track-title">
            <span className="title-text link-underline" onClick={navigateToTrack}>
              {track.title}
            </span>
          </div>

          <div className="track-layer-message">
            {track?.parent_track_id ? 
            (
              <>
                <b>Layer {track.layer}</b> - Based on "{track.original_title}" by {track.original_username}
              </>) 
            : (<b>Original track</b>)}
          </div>

          <div className="track-meta">
            <div className="meta-item">
              <FaPlay /> 
              <span>{Number(track.play_count || 0).toLocaleString()}</span>
            </div>
            <div className="meta-item">
              <button 
                  className={`like-btn ${isLiked ? 'active' : ''}`} 
                  onClick={handleLikeToggle} 
                  disabled={!isAuthenticated || isLikeInProgress}
                  title={isAuthenticated ? (isLiked ? 'Unlike' : 'Like') : 'Log in to like tracks'}
                >
                {isLiked ? <FaHeart /> : <FaRegHeart />}
              </button>
              <span>{Number(likeCount).toLocaleString()}</span>
            </div>
            <div className="meta-item">
              <button 
                className={`repost-btn ${isReposted ? 'active' : ''}`} 
                onClick={handleRepostToggle}
                disabled={!isAuthenticated || isRepostInProgress}
                title={isAuthenticated ? (isReposted ? 'Unrepost' : 'Repost') : 'Log in to repost tracks'}
              >
                <FaRetweet />
              </button>
              <span>{Number(repostCount).toLocaleString()}</span>
            </div>
            <div className="meta-item">
              <FaCodeBranch />
              <span>{Number(track.collab_count).toLocaleString()}</span>
            </div>
          </div>
        </div>
        
        <div className="track-section-right">
          <div className="track-tags">
            {track.tags && Array.isArray(track.tags) && track.tags.map((tag, index) => (
              <span key={`tag-${index}`} className="track-tag">{typeof tag === 'string' ? tag : tag.name}</span>
            ))}
            
            {track.genres && Array.isArray(track.genres) && track.genres.map((genre, index) => (
              <span key={`genre-${index}`} className="track-tag">{typeof genre === 'string' ? genre : genre.name}</span>
            ))}
            
            {track.instruments && Array.isArray(track.instruments) && track.instruments.map((instrument, index) => (
              <span key={`instrument-${index}`} className="track-tag">{typeof instrument === 'string' ? instrument : instrument.name}</span>
            ))}
                        
            {track.metronome_bpm && (
              <>
                {atLeastOneTag && <div className="meta-item-separator text-secondary">|</div>}
                <div className="meta-item">
                  <FaMusic /> 
                  <span>{track.metronome_bpm} BPM</span>
                </div>
              </>
            )}
          </div>
          <div className="track-actions">
            <button 
              className={`${track.is_private ? 'share-btn-private' : 'share-btn'}`}
              onClick={handleCopyLink}
              title={isLinkCopied ? 'Link copied!' : 'Copy link to track'}
            >
              {isLinkCopied ? <FaCheck /> : <FaShareAlt />}
              {track.is_private && currentUser.id === track.user_id && <span className="share-text">Share</span>}
            </button>
            <button 
              className="collab-btn" 
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/track/${track.id}`);
              }}
            >
              {track?.layer < 4 ? (<><FaUsers /> Collab</>) : (<><FaEye /> View Track</>)}
            </button>
          </div>
          {track.created_at && (
            <TimeDisplay timestamp={track.created_at} />
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="track-details">
          <div className="track-tabs">
            <button 
              className={`track-tab ${activeTab === 'collabs' ? 'active' : ''}`}
              onClick={() => setActiveTab('collabs')}
            >
              Collabs
            </button>
            <button 
              className={`track-tab ${activeTab === 'comments' ? 'active' : ''}`}
              onClick={() => setActiveTab('comments')}
            >
              Comments
            </button>
          </div>
          
          {activeTab === 'collabs' && (
            <div className="track-tab-content">
              <div className="related-tracks">
                {loadingRelated ? (
                  <div className="loading-spinner">Loading related tracks...</div>
                ) : (
                  <>
                    {originalTrack && !isTreeView && (
                      <>
                        <div className="track-relation">Original</div>
                        <MiniTrack track={originalTrack} relatedTracks={collabTracks} />
                      </>
                    )}
                    
                    {collabTracks.length > 0 ? (
                      <>
                        <div className="track-relation">Based on this</div>
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
                                  <FaSpinner className="loading-spinner-icon" /> Loading...
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
                          <div className="no-related">There are no tracks based on this track</div>
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