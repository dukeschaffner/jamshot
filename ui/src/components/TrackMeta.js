'use client';

import { useState, useEffect } from 'react';
import { FaPlay, FaHeart, FaRegHeart, FaRetweet, FaCodeBranch, FaDownload } from 'react-icons/fa';
import api from '../lib/api';
import { useUser } from '../contexts/UserContext';
import { getLikeCountString } from '../lib/utils';
import { trackLike, trackUnlike, trackShare } from '../lib/analytics';
import UserListModal from './UserListModal';
import styles from './TrackMeta.module.css';

export default function TrackMeta({ 
  track,
  showDownload = false,
  variant = 'default',
  className = ''
}) {
  const { user: currentUser, isAuthenticated } = useUser();
  const [isLiked, setIsLiked] = useState(track.is_liked || false);
  const [likeCount, setLikeCount] = useState(Number(track.like_count) || 0);
  const [isReposted, setIsReposted] = useState(track.is_reposted || false);
  const [repostCount, setRepostCount] = useState(Number(track.repost_count) || 0);
  const [isLikeInProgress, setIsLikeInProgress] = useState(false);
  const [isRepostInProgress, setIsRepostInProgress] = useState(false);
  const [showLikesModal, setShowLikesModal] = useState(false);

  // Update state when track prop changes
  useEffect(() => {
    setIsLiked(track.is_liked || false);
    setLikeCount(Number(track.like_count) || 0);
    setIsReposted(track.is_reposted || false);
    setRepostCount(Number(track.repost_count) || 0);
  }, [track.is_liked, track.like_count, track.is_reposted, track.repost_count]);

  const handleLikeToggle = async (e) => {
    e.stopPropagation();
    
    if (isLikeInProgress) return;
    setIsLikeInProgress(true);
    
    try {
      if (!isAuthenticated) {
        alert('Please log in to like tracks');
        return;
      }
      
      if (isLiked) {
        await api.delete(`/tracks/${track.id}/like`);
        setIsLiked(false);
        setLikeCount(prevCount => Math.max(0, Number(prevCount) - 1));
        trackUnlike(track.id, track.title, track.username);
      } else {
        await api.post(`/tracks/${track.id}/like`);
        setIsLiked(true);
        setLikeCount(prevCount => Number(prevCount) + 1);
        trackLike(track.id, track.title, track.username);
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

  const handleLikeCountClick = (e) => {
    e.stopPropagation();
    if (likeCount > 0) {
      setShowLikesModal(true);
    }
  };

  const handleRepostToggle = async (e) => {
    e.stopPropagation();

    if (isRepostInProgress) return;

    if (!isAuthenticated) {
      alert('Please log in to repost tracks');
      return;
    }

    // Check if reposting is disabled for this track
    if (track.is_private) {
      alert('Cannot repost private tracks');
      return;
    }

    if (track.creator_is_private) {
      alert('Cannot repost tracks from private accounts');
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

  const handleDownload = async (e) => {
    e.stopPropagation();
    
    if (!track.allow_download) {
      return;
    }
    
    try {
        const response = await api.get(`/tracks/${track.id}/download`);
        const { download_url, filename } = response.data;
        
        const link = document.createElement('a');
        link.href = download_url;
        link.download = filename;
        link.target = '_blank';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (err) {
        console.error('Download error:', err);
        alert('Failed to download track');
    }
  };

  const getVariantClass = () => {
    switch (variant) {
      case 'mini':
        return `${styles.trackMetaSocial} ${styles.miniTrackMeta}`;
      default:
        return styles.trackMetaSocial;
    }
  };

  return (
    <div className={`${getVariantClass()} ${className}`}>
        <div className='meta-item'>
            <FaPlay /> 
            <span>{Number(track.play_count || 0).toLocaleString()}</span>
        </div>
        <div className='meta-item'>
            <button 
                className={`like-btn ${isLiked ? 'active' : ''}`}
                onClick={handleLikeToggle}
                disabled={!isAuthenticated || isLikeInProgress}
                title={isAuthenticated ? (isLiked ? 'Unlike' : 'Like') : 'Log in to like tracks'}
            >
                {isLiked ? <FaHeart /> : <FaRegHeart />}
            </button>
            <span 
                className={`${styles.likeCount} ${likeCount > 0 ? 'link-underline' : ''}`}
                onClick={handleLikeCountClick}
                title={likeCount > 0 ? 'View likes' : ''}
            >
                {getLikeCountString(likeCount)}
            </span>
        </div>
        <div className='meta-item'>
            <button
                className={`repost-btn ${isReposted ? 'active' : ''}`}
                onClick={handleRepostToggle}
                disabled={!isAuthenticated || isRepostInProgress || track.is_private || track.creator_is_private}
                title={
                  !isAuthenticated ? 'Log in to repost tracks' :
                  track.is_private ? 'Cannot repost private tracks' :
                  track.creator_is_private ? 'Cannot repost tracks from private accounts' :
                  isReposted ? 'Unrepost' : 'Repost'
                }
            >
                <FaRetweet />
            </button>
            <span>{Number(repostCount).toLocaleString()}</span>
        </div>
        <div className='meta-item'>
            <FaCodeBranch />
            <span>{Number(track.collab_count || 0).toLocaleString()}</span>
        </div>
        {showDownload && track.allow_download && (
            <div className='meta-item'>
                <button 
                className="download-btn" 
                onClick={handleDownload}
                title="Download audio file"
                >
                    <FaDownload />
                </button>
            </div>
        )}
      
        <UserListModal
            isOpen={showLikesModal}
            onClose={() => setShowLikesModal(false)}
            title="Likes"
            type="likes"
            trackId={track.id}
        />
    </div>
  );
} 