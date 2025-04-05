'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import api from '../lib/api';
import { useAudio } from '../lib/AudioContext';
import { FaCheckCircle, FaHeart, FaRegHeart, FaPlay, FaPause, FaHeadphones, FaShareAlt, FaCodeBranch, FaUsers, FaChevronDown, FaChevronUp, FaMusic, FaInfoCircle, FaRetweet, FaLock, FaLockOpen, FaCopy, FaCheck, FaTrash } from 'react-icons/fa';
import Cookies from 'js-cookie';
import TrackTags from './TrackTags';
import { formatDuration, formatDate } from '../lib/utils';
import Link from 'next/link';
import Image from 'next/image';

export default function TrackTreeNode({ 
  track, 
  expandedTrackId, 
  setExpandedTrackId, 
  onChildSelect, 
  isPlaying, 
  level,
  isCurrent = false,
  isSelected = false
}) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);
  const [childTracks, setChildTracks] = useState([]);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const { playTrack, togglePlayPause, currentTrack } = useAudio();
  const [isLiked, setIsLiked] = useState(track.is_liked || false);
  const [likeCount, setLikeCount] = useState(track.like_count || 0);
  const [isLikeInProgress, setIsLikeInProgress] = useState(false);
  const [isReposted, setIsReposted] = useState(track.is_reposted || false);
  const [isRepostInProgress, setIsRepostInProgress] = useState(false);
  const [isPrivate, setIsPrivate] = useState(track.is_private || false);
  const [isPrivacyToggleInProgress, setIsPrivacyToggleInProgress] = useState(false);
  const [isLinkCopied, setIsLinkCopied] = useState(false);
  const [isTrackOwner, setIsTrackOwner] = useState(false);
  const [isDeleteInProgress, setIsDeleteInProgress] = useState(false);

  // Check if current user is the track owner
  useEffect(() => {
    const checkOwnership = async () => {
      try {
        const token = Cookies.get('accessToken');
        if (!token) return;
        
        const response = await api.get('/users/me');
        setIsTrackOwner(response.data.id === track.user_id);
      } catch (err) {
        console.error('Error checking track ownership:', err);
      }
    };
    
    checkOwnership();
  }, [track.user_id]);

  // Wrap fetchChildTracks in useCallback to prevent it from changing on every render
  const fetchChildTracks = useCallback(async () => {
    try {
      const response = await api.get(`/tracks/${track.id}/children`);
      setChildTracks(response.data);
    } catch (error) {
      console.error('Error fetching child tracks:', error);
    }
  }, [track.id]);

  useEffect(() => {
    setIsExpanded(expandedTrackId === track.id);
    if (expandedTrackId === track.id && track.child_count > 0) {
      fetchChildTracks();
    }
  }, [expandedTrackId, track.id, fetchChildTracks, track.child_count]);

  useEffect(() => {
    // Update like state when track prop changes
    setIsLiked(track.is_liked || false);
    setLikeCount(track.like_count || 0);
    setIsReposted(track.is_reposted || false);
  }, [track.is_liked, track.like_count, track.is_reposted]);

  const toggleExpand = () => {
    setExpandedTrackId(isExpanded ? null : track.id);
  };

  const handlePlayToggle = (e) => {
    e.stopPropagation();
    if (currentTrack?.id === track.id) {
      togglePlayPause();
    } else {
      playTrack(track);
    }
  };

  const handleLikeToggle = async (e) => {
    e.stopPropagation();
    
    // Prevent action if already in progress
    if (isLikeInProgress) return;
    setIsLikeInProgress(true);
    
    try {
      const token = Cookies.get('accessToken');
      if (!token) {
        // Handle unauthenticated user
        console.log('Please log in to like tracks');
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
    } catch (err) {
      console.error('Failed to toggle like:', err);
      if (err.response && err.response.status === 401) {
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
    
    const token = Cookies.get('accessToken');
    if (!token) {
      alert('Please log in to repost tracks');
      return;
    }
    
    setIsRepostInProgress(true);
    
    try {
      if (isReposted) {
        await api.delete(`/tracks/${track.id}/repost`);
        setIsReposted(false);
      } else {
        await api.post(`/tracks/${track.id}/repost`);
        setIsReposted(true);
      }
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

  const handleCollaborate = (e) => {
    e.stopPropagation();
    router.push(`/track/${track.id}/collaborate`);
  };

  const handleChildClick = (childId) => {
    if (onChildSelect) {
      onChildSelect(childId);
    }
  };

  const handlePrivacyToggle = async (e) => {
    e.stopPropagation();
    
    if (!isTrackOwner || isPrivacyToggleInProgress) return;
    
    setIsPrivacyToggleInProgress(true);
    
    try {
      const response = await api.put(`/tracks/${track.id}/privacy`, {
        is_private: !isPrivate
      });
      
      setIsPrivate(!isPrivate);
      
      // Show a notification
      const message = !isPrivate 
        ? 'Track is now private. Only you and people with the private link can view it.' 
        : 'Track is now public.';
      alert(message);
    } catch (err) {
      console.error('Failed to toggle track privacy:', err);
      
      // Check for specific error about collaborations
      if (err.response && err.response.data && err.response.data.error === 'Cannot make track private because it has collaborations') {
        alert('Cannot make track private because it has collaborations. Tracks with collaborations must remain public.');
      } else {
        alert('Failed to update track privacy settings');
      }
    } finally {
      setIsPrivacyToggleInProgress(false);
    }
  };
  
  const handleCopyLink = async (e) => {
    e.stopPropagation();
    
    const baseUrl = window.location.origin;
    let trackUrl = `${baseUrl}/track/${track.id}`;
    
    // If track is private, get the secret token from the API
    if (isPrivate && isTrackOwner) {
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

  const handleDeleteTrack = async (e) => {
    e.stopPropagation();
    
    if (!isTrackOwner || isDeleteInProgress) return;
    
    // Confirm deletion with user
    const hasChildren = track.child_count > 0;
    let confirmMessage = 'Are you sure you want to delete this track?';
    
    if (hasChildren) {
      confirmMessage = 'This track has collaborations. Deleting it will remove your ownership, but the track will remain available for others. Continue?';
    }
    
    if (!window.confirm(confirmMessage)) {
      return;
    }
    
    setIsDeleteInProgress(true);
    
    try {
      const response = await api.delete(`/tracks/${track.id}`);
      
      // Show appropriate message based on deletion type
      if (response.data.soft_delete) {
        alert('Track has been removed from your profile but remains available for collaborations.');
      } else {
        alert('Track has been permanently deleted.');
      }
      
      // Redirect to home page or refresh the current page
      window.location.href = '/';
    } catch (err) {
      console.error('Failed to delete track:', err);
      alert('Failed to delete track. Please try again later.');
    } finally {
      setIsDeleteInProgress(false);
    }
  };

  return (
    <div className={`track-tree-node ${isExpanded ? 'expanded' : ''} ${isCurrent ? 'current' : ''} ${isSelected ? 'selected' : ''}`}>
      <div className="track-node-header" onClick={toggleExpand}>
        <div className="track-play" onClick={handlePlayToggle}>
          {currentTrack?.id === track.id && isPlaying ? <FaPause /> : <FaPlay />}
        </div>
        
        <div className="track-info">
          <div className="track-title-row">
            <div className="track-title">
              {track.title}
              {isPrivate && <FaLock className="private-icon" title="This track is private" />}
            </div>
            <div className="track-duration">{formatDuration(track.duration)}</div>
          </div>
          
          <div className="track-artist">
            <div className="artist-avatar">
              {track.profile_pic_url ? (
                <Image 
                  src={track.profile_pic_url} 
                  alt={track.username || 'Artist'} 
                  width={24} 
                  height={24}
                  style={{ borderRadius: '50%', objectFit: 'cover' }}
                />
              ) : (
                <div className="avatar-placeholder"></div>
              )}
            </div>
            <Link href={`/user/${track.username}`} onClick={(e) => e.stopPropagation()}>
              <div className="artist-name">
                {track.username}
                {track.verified && <FaCheckCircle className="verified-icon" />}
              </div>
            </Link>
          </div>
          
          <div className="track-meta">
            <div className="meta-item">
              <FaHeadphones /> 
              <span>{Number(track.play_count || 0).toLocaleString()}</span>
            </div>
            <div className="meta-item">
              <FaHeart /> 
              <span>{Number(likeCount).toLocaleString()}</span>
            </div>
            {track.child_count > 0 && (
              <div className="meta-item">
                <FaCodeBranch /> 
                <span>{Number(track.child_count).toLocaleString()}</span>
              </div>
            )}
            {track.metronome_bpm && (
              <div className="meta-item">
                <FaMusic /> 
                <span>{track.metronome_bpm} BPM</span>
              </div>
            )}
            <div className="meta-item">
              <FaInfoCircle /> 
              <span>{formatDate(track.created_at)}</span>
            </div>
          </div>
        </div>
        
        <div className="track-actions">
          {/* Share button - more prominent for private tracks */}
          <button 
            className={`action-btn ${isPrivate ? 'share-btn-private' : ''}`}
            onClick={handleCopyLink}
            title={isLinkCopied ? 'Link copied!' : 'Copy link to track'}
          >
            {isLinkCopied ? <FaCheck /> : <FaShareAlt />}
            {isPrivate && isTrackOwner && <span className="share-text">Share</span>}
          </button>
          
          <button 
            className="action-btn"
            onClick={handleCollaborate}
            title="Collaborate on this track"
          >
            <FaUsers />
          </button>
          
          <button 
            className={`like-btn ${isLiked ? 'active' : ''}`}
            onClick={handleLikeToggle}
            disabled={isLikeInProgress}
            title={isLiked ? 'Unlike' : 'Like'}
          >
            {isLiked ? <FaHeart /> : <FaRegHeart />}
          </button>
          
          <button 
            className={`action-btn ${isReposted ? 'active' : ''}`}
            onClick={handleRepostToggle}
            disabled={isRepostInProgress}
            title={isReposted ? 'Unrepost' : 'Repost'}
          >
            <FaRetweet />
          </button>
          
          {isTrackOwner && (
            <>
              <button 
                className="action-btn"
                onClick={handlePrivacyToggle}
                disabled={isPrivacyToggleInProgress}
                title={isPrivate ? 'Make track public' : 'Make track private'}
              >
                {isPrivate ? <FaLock /> : <FaLockOpen />}
              </button>
              
              <button 
                className="action-btn delete-btn"
                onClick={handleDeleteTrack}
                disabled={isDeleteInProgress}
                title="Delete track"
              >
                <FaTrash />
              </button>
            </>
          )}
          
          <button 
            className="expand-btn"
            onClick={toggleExpand}
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? <FaChevronUp /> : <FaChevronDown />}
          </button>
        </div>
      </div>
      
      {isExpanded && (
        <div className="track-details">
          {track.child_count > 0 ? (
            <div className="related-tracks">
              <div className="track-relation">Based on this</div>
              {loadingChildren ? (
                <div className="loading-spinner">Loading collaborations...</div>
              ) : (
                childTracks.map(child => (
                  <div 
                    key={child.id} 
                    className="related-track"
                    onClick={() => handleChildClick(child.id)}
                  >
                    <div className="related-play" onClick={(e) => {
                      e.stopPropagation();
                      playTrack(child);
                    }}>
                      {currentTrack?.id === child.id && isPlaying ? <FaPause /> : <FaPlay />}
                    </div>
                    <div className="related-info">
                      <div className="related-title">{child.title}</div>
                      <div className="related-artist">
                        {child.username}
                        {child.verified && <FaCheckCircle className="verified-icon" />}
                      </div>
                      <div className="related-stats">
                        <span><FaPlay /> {child.play_count || 0}</span>
                        <span><FaHeart /> {child.like_count || 0}</span>
                        <span><FaUsers /> {child.child_count || 0}</span>
                      </div>
                    </div>
                    <div className="related-actions">
                      <button className="related-action-btn" onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/track/${child.id}/collaborate`);
                      }}>
                        <FaUsers />
                      </button>
                      <button className="related-action-btn" onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/track/${child.id}`);
                      }}>
                        <FaInfoCircle />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="no-related">No collaborations yet</div>
          )}
        </div>
      )}
    </div>
  );
} 