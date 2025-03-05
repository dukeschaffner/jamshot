'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import api from '../lib/api';
import MiniTrack from './MiniTrack';
import TrackTags from './TrackTags';
import { useAudio } from '../lib/AudioContext';
import { FaCheckCircle, FaHeart, FaRegHeart, FaRetweet, FaPlay, FaPause, FaHeadphones, FaShareAlt, FaCodeBranch, FaUsers, FaInfoCircle, FaMusic } from 'react-icons/fa';
import Cookies from 'js-cookie';

export default function Track({ track, allTracks, setExpandedTrackId, expandedTrackId }) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);
  const [relatedTracks, setRelatedTracks] = useState([]);
  const { currentTrack, isPlaying, playTrack, togglePlayPause } = useAudio();
  const [isLiked, setIsLiked] = useState(track.is_liked || false);
  const [likeCount, setLikeCount] = useState(Number(track.like_count) || 0);
  const [isLikeInProgress, setIsLikeInProgress] = useState(false);
  const [isReposted, setIsReposted] = useState(track.is_reposted || false);
  const [isRepostInProgress, setIsRepostInProgress] = useState(false);
  const [loadingRelated, setLoadingRelated] = useState(false);

  useEffect(() => {
    setIsExpanded(expandedTrackId === track.id);
    if (expandedTrackId === track.id) {
      const fetchRelatedTracks = async () => {
        try {
          setLoadingRelated(true);
          const response = await api.get(`/tracks/${track.id}/related`);
          setRelatedTracks(response.data);
        } catch (err) {
          console.error('Failed to fetch related tracks:', err);
        } finally {
          setLoadingRelated(false);
        }
      };
      fetchRelatedTracks();
    }
  }, [expandedTrackId, track.id]);

  useEffect(() => {
    // Update like and repost state when track prop changes
    setIsLiked(track.is_liked || false);
    setLikeCount(Number(track.like_count) || 0);
    setIsReposted(track.is_reposted || false);
  }, [track.is_liked, track.like_count, track.is_reposted]);

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

  const originalTrack = relatedTracks.find(t => t.id === track.parent_track_id);
  const collabTracks = relatedTracks.filter(t => t.parent_track_id === track.id);

  return (
    <div className={`track-card ${isExpanded ? 'expanded' : ''}`}>
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
            </div>
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
              <span>{Number(track.collab_count || 0).toLocaleString()}</span>
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
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/track/${track.id}/collaborate`);
            }}
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
        </div>
      </div>

      {isExpanded && (
        <div className="track-details">
          <div className="related-tracks">
            {loadingRelated ? (
              <div className="loading-spinner">Loading related tracks...</div>
            ) : (
              <>
                {originalTrack && (
                  <>
                    <div className="track-relation">Original</div>
                    <MiniTrack track={originalTrack} relatedTracks={relatedTracks} />
                  </>
                )}
                
                {collabTracks.length > 0 && (
                  <>
                    <div className="track-relation">Based on this</div>
                    {collabTracks.map(collab => (
                      <MiniTrack key={collab.id} track={collab} relatedTracks={relatedTracks} />
                    ))}
                  </>
                )}
                
                {(!originalTrack && collabTracks.length === 0) && (
                  <div className="no-related">No related tracks found</div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}