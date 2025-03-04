'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '../lib/api';
import { useAudio } from '../lib/AudioContext';
import { FaCheckCircle, FaHeart, FaRegHeart, FaPlay, FaPause, FaHeadphones, FaShareAlt, FaCodeBranch, FaUsers, FaChevronDown, FaChevronUp, FaMusic } from 'react-icons/fa';
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
  }, [track.is_liked, track.like_count]);

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

  const handleCollaborate = (e) => {
    e.stopPropagation();
    router.push(`/collaborate/${track.id}`);
  };

  const handleChildClick = (childId) => {
    if (onChildSelect) {
      onChildSelect(childId);
    }
  };

  return (
    <div className={`track-tree-node ${isExpanded ? 'expanded' : ''} ${isCurrent ? 'current' : ''} ${isSelected ? 'selected' : ''}`}>
      <div className="track-node-main" onClick={toggleExpand}>
        <div className="track-play" onClick={handlePlayToggle}>
          {isPlaying ? <FaPause /> : <FaPlay />}
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
        </div>
        
        <div className="track-stats">
          <div className="track-stat">
            <FaHeadphones /> {track.play_count || 0}
          </div>
          <div className="track-stat">
            <FaUsers /> {track.child_count || 0}
          </div>
          {track.metronome_bpm && (
            <div className="track-stat metronome">
              <FaMusic /> {track.metronome_bpm} BPM
            </div>
          )}
        </div>
        
        <div className="track-actions">
          <button 
            className={`action-btn ${isLiked ? 'active' : ''}`} 
            onClick={handleLikeToggle}
            disabled={isLikeInProgress}
          >
            {isLiked ? <FaHeart /> : <FaRegHeart />} {likeCount}
          </button>
          
          <button className="action-btn" onClick={handleCollaborate}>
            <FaCodeBranch /> Collab
          </button>
          
          <button className="expand-btn" onClick={toggleExpand}>
            {isExpanded ? <FaChevronUp /> : <FaChevronDown />}
            {isExpanded ? ' Hide' : ' Show'} {track.child_count > 0 ? track.child_count : ''} {track.child_count === 1 ? 'Child' : 'Children'}
          </button>
        </div>
      </div>
      
      {isExpanded && (
        <div className="track-node-details">
          {track.child_count > 0 ? (
            <div className="child-tracks">
              <h3>Collaborations</h3>
              {loadingChildren ? (
                <div className="loading">Loading collaborations...</div>
              ) : (
                <div className="child-tracks-list">
                  {childTracks.map(child => (
                    <div 
                      key={child.id} 
                      className="child-track-item"
                      onClick={() => handleChildClick(child.id)}
                      title={`View details for "${child.title}" by ${child.username}`}
                    >
                      <div className="child-track-play" onClick={(e) => {
                        e.stopPropagation();
                        playTrack(child);
                      }}>
                        {currentTrack?.id === child.id && isPlaying ? <FaPause /> : <FaPlay />}
                      </div>
                      <div className="child-track-info">
                        <div className="child-track-title">{child.title}</div>
                        <div className="child-track-artist">
                          {child.username}
                          {child.verified && <FaCheckCircle className="verified-icon" />}
                        </div>
                      </div>
                      <div className="child-track-view">
                        View
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="no-children">No collaborations yet</div>
          )}
        </div>
      )}
    </div>
  );
} 