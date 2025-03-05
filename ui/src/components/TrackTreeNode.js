'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '../lib/api';
import { useAudio } from '../lib/AudioContext';
import { FaCheckCircle, FaHeart, FaRegHeart, FaPlay, FaPause, FaHeadphones, FaShareAlt, FaCodeBranch, FaUsers, FaChevronDown, FaChevronUp, FaMusic, FaInfoCircle, FaRetweet } from 'react-icons/fa';
import Cookies from 'js-cookie';
import TrackTags from './TrackTags';

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
  const [likeCount, setLikeCount] = useState(Number(track.like_count) || 0);
  const [isLikeInProgress, setIsLikeInProgress] = useState(false);
  const [isReposted, setIsReposted] = useState(track.is_reposted || false);
  const [isRepostInProgress, setIsRepostInProgress] = useState(false);

  useEffect(() => {
    setIsExpanded(expandedTrackId === track.id);
    if (expandedTrackId === track.id && track.child_count > 0) {
      fetchChildTracks();
    }
  }, [expandedTrackId, track.id]);

  useEffect(() => {
    // Update like state when track prop changes
    setIsLiked(track.is_liked || false);
    setLikeCount(Number(track.like_count) || 0);
    setIsReposted(track.is_reposted || false);
  }, [track.is_liked, track.like_count, track.is_reposted]);

  const fetchChildTracks = async () => {
    if (childTracks.length > 0 || track.child_count === 0) return;
    
    try {
      setLoadingChildren(true);
      const response = await api.get(`/tracks/${track.id}/tree`);
      setChildTracks(response.data.children);
    } catch (err) {
      console.error('Failed to fetch child tracks:', err);
    } finally {
      setLoadingChildren(false);
    }
  };

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
      const token = Cookies.get('token');
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
    
    const token = Cookies.get('token');
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

  return (
    <div className={`track-card ${isExpanded ? 'expanded' : ''} ${isCurrent ? 'current' : ''} ${isSelected ? 'selected' : ''}`}>
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
          <div className="track-title">
            {track.title}
            <TrackTags track={track} />
          </div>
          
          <div className="track-artist">
            <div className="artist-avatar">
              {track.profile_pic_url ? (
                <img src={track.profile_pic_url} alt={track.username} />
              ) : (
                <div className="avatar-placeholder"></div>
              )}
            </div>
            <div className="artist-name">
              {track.username}
              {track.verified && <FaCheckCircle className="verified-icon" />}
            </div>
          </div>
          
          {track.layer > 0 && (
            <div className="track-layer">Layer: {track.layer} (Based on: {track.original_title})</div>
          )}
          
          <div className="track-meta">
            <div className="meta-item">
              <FaPlay /> 
              <span>{Number(track.play_count || 0).toLocaleString()}</span>
            </div>
            <div className="meta-item">
              <FaHeart /> 
              <span>{Number(likeCount).toLocaleString()}</span>
            </div>
            <div className="meta-item">
              <FaUsers /> 
              <span>{Number(track.child_count || 0).toLocaleString()}</span>
            </div>
            {track.metronome_bpm && (
              <div className="meta-item">
                <FaMusic /> 
                <span>{track.metronome_bpm} BPM</span>
              </div>
            )}
          </div>
        </div>
        
        <div className="track-actions">
          <button 
            className="collab-btn"
            onClick={handleCollaborate}
          >
            <FaUsers /> Collab
          </button>
          
          <button 
            className={`like-btn ${isLiked ? 'active' : ''}`}
            onClick={handleLikeToggle}
            disabled={!Cookies.get('token') || isLikeInProgress}
            title={Cookies.get('token') ? (isLiked ? 'Unlike' : 'Like') : 'Log in to like tracks'}
          >
            {isLiked ? <FaHeart /> : <FaRegHeart />}
          </button>
          
          <button 
            className={`action-btn ${isReposted ? 'active' : ''}`}
            onClick={handleRepostToggle}
            disabled={!Cookies.get('token') || isRepostInProgress}
            title={Cookies.get('token') ? (isReposted ? 'Unrepost' : 'Repost') : 'Log in to repost tracks'}
          >
            <FaRetweet />
          </button>
          
          <button className="share-btn">
            <FaShareAlt />
          </button>
          
          <button className="action-btn" onClick={(e) => {
            e.stopPropagation();
            router.push(`/track/${track.id}`);
          }}>
            <FaInfoCircle /> Details
          </button>
          
          {track.child_count > 0 && (
            <button className="expand-btn" onClick={toggleExpand}>
              {isExpanded ? <FaChevronUp /> : <FaChevronDown />}
            </button>
          )}
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