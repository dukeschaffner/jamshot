'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { trackApi } from '@/lib/api';
import Image from 'next/image';
import api from '@/lib/api';
import CommentSection from '@/components/CommentSection';
import CustomTabs from '@/components/CustomTabs';
import LoadingSpinner from '@/components/LoadingSpinner';
import TrackMeta from '@/components/TrackMeta';
import './collaborate.css';
import styles from '@/components/Track.module.css';
import { FaCheckCircle, FaShareAlt, FaProjectDiagram, FaLock, FaLockOpen, FaTrash, FaDesktop, FaUserPlus} from 'react-icons/fa';
import { useUser } from '../../../contexts/UserContext';
import { useMobile } from '../../../contexts/MobileContext';
import DAW from '@/components/DAW/DAW';

// Component that uses useSearchParams, wrapped in Suspense
function TrackContent() {
  const { trackId } = useParams();
  const searchParams = useSearchParams();
  const secret = searchParams.get('secret');
  const [track, setTrack] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('collab');
  const { user, isAuthenticated } = useUser();
  const { isMobile } = useMobile();
  const [isTrackOwner, setIsTrackOwner] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [isPrivacyToggleInProgress, setIsPrivacyToggleInProgress] = useState(false);
  const [isDeleteInProgress, setIsDeleteInProgress] = useState(false);
  const [isLinkCopied, setIsLinkCopied] = useState(false);
  const [isInviteLinkCopied, setIsInviteLinkCopied] = useState(false);

  useEffect(() => {
    async function loadTrack() {
      try {
        setLoading(true);
        const response = await trackApi.getTrack(trackId, secret);
        const data = response.data;
        console.log('Track data loaded:', data);
        // Since trackApi.getTrack returns an array, we take the first track
        const mainTrack = Array.isArray(data) && data.length > 0 ? data[0] : null;
        if (!mainTrack) {
          throw new Error('Track not found');
        }
        setTrack(mainTrack);
        setIsPrivate(mainTrack.is_private || false);
        setLoading(false);
      } catch (err) {
        console.error('Error loading track:', err);
        if (err.response && err.response.status === 403) {
          setError('This track is private. You do not have permission to view it.');
        } else {
          setError('Failed to load track. Please try again later.');
        }
        setLoading(false);
      }
    }

    if (trackId) {
      loadTrack();
    }
  }, [trackId, secret]);

  // Check if current user is the track owner
  useEffect(() => {
    const checkOwnership = async () => {
      try {
        if (!isAuthenticated || !user || !track) return;
        
        setIsTrackOwner(user.id === track.user_id);
      } catch (err) {
        console.error('Error checking track ownership:', err);
      }
    };
    
    checkOwnership();
  }, [track, user, isAuthenticated]);

  const handlePrivacyToggle = async () => {
    if (!isTrackOwner || isPrivacyToggleInProgress) return;
    
    setIsPrivacyToggleInProgress(true);
    
    try {
      const response = await api.put(`/tracks/${trackId}/privacy`, {
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

  const handleCopyLink = async () => {
    const baseUrl = window.location.origin;
    let trackUrl = `${baseUrl}/track/${trackId}`;
    
    // If track is private, get the secret token from the API
    if (isPrivate && isTrackOwner) {
      try {
        setIsLinkCopied(true); // Show loading state
        const response = await api.post(`/tracks/${trackId}/share`);
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

  const handleCopyInviteLink = () => {
    const currentUrl = window.location.href;
    
    navigator.clipboard.writeText(currentUrl)
      .then(() => {
        setIsInviteLinkCopied(true);
        setTimeout(() => setIsInviteLinkCopied(false), 2000);
      })
      .catch(err => {
        console.error('Failed to copy link:', err);
        alert('Failed to copy link to clipboard');
        setIsInviteLinkCopied(false);
      });
  };

  const handleDeleteTrack = async () => {    
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
      const response = await api.delete(`/tracks/${trackId}`);
      
      // Show appropriate message based on deletion type
      if (response.data.soft_delete) {
        alert('Track has been removed from your profile but remains available for collaborations.');
      } else {
        alert('Track has been permanently deleted.');
      }
      
      // Redirect to home page
      window.location.href = '/';
    } catch (err) {
      console.error('Failed to delete track:', err);
      alert('Failed to delete track. Please try again later.');
    } finally {
      setIsDeleteInProgress(false);
    }
  };



  // Create tabs configuration
  const tabs = [
    { key: 'collab', label: 'Collab' },
    { key: 'comments', label: 'Comments' },
    ...(isTrackOwner ? [{ key: 'edit', label: 'Edit' }] : [])
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="text-red-500 mb-4">{error}</div>
        <Link href="/" className="text-primary hover:underline">
          Return to Home
        </Link>
      </div>
    );
  }

  if (!track) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="mb-4">Track not found</div>
        <Link href="/" className="text-primary hover:underline">
          Return to Home
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full">
        <div className="track-header">
         <div className="track-info">
          <div className="track-artist">
              <Image 
                className="avatar"
                src={track?.profile_pic_url || '/avatar.svg'} 
                alt={track.username}
                width={40}
                height={40} 
              />
             <span className="artist-name ml-2">{track?.username || 'Unknown Artist'}</span>
             {track?.verified && <FaCheckCircle className="verified-icon" />}
           </div>
           <div>
            <div className={styles.trackTitle}>
                <span className="title-text link-underline">
                  {track.title}
                </span>
                <div className={styles.trackLayerMessage}>
                  {track?.parent_track_id ? 
                  (
                    <>
                      <b>Layer {track.layer}</b> - Based on &quot;{track.original_title}&quot; by {track.original_username ? track.original_username : "Unknown Artist"}
                    </>) 
                  : (<b>Original track</b>)}
                </div>
              </div>
           </div>

           
           <TrackMeta 
             track={track}
             showDownload={true}
           />
         </div>
         <div className="track-controls">
           <Link href={`/tree/${trackId}`} className="pill-btn">
             <FaProjectDiagram className="explore-icon" />
             <span>Explore</span>
           </Link>
           {isTrackOwner && !isPrivate && (
             <button 
               className="pill-btn"
               onClick={handleCopyInviteLink}
             >
               <FaUserPlus className="explore-icon" />
               <span>{isInviteLinkCopied ? 'Link Copied!' : 'Invite collaborators'}</span>
             </button>
           )}
         </div>
      </div>
      <CustomTabs
             tabs={tabs}
             activeTab={activeTab}
             onTabChange={setActiveTab}
             variant="default"
           />
      <div style={{display: activeTab === 'collab' ? 'block' : 'none'}}>
        {isMobile ? (
          <div className="mobile-collab-message">
            <FaDesktop className="mobile-collab-icon" />
            <h3>Desktop Required</h3>
            <p>Use Desktop version to record or upload file to collaborate</p>
          </div>
        ) : (
          <DAW track={track}/>
        )}
      </div>
      {activeTab === 'comments' && (
        <div className="comments-container">
          <CommentSection trackId={trackId} />
        </div>
      )}
      {activeTab === 'edit' && isTrackOwner && (
        <div className="edit-track-container">
          <div className="edit-track-panel">
            <h3>Track Settings</h3>
            
            <div className="edit-track-section">
              <h4>Privacy Settings</h4>
              <div className="privacy-toggle">
                <button 
                  className={`pill-btn w-min`}
                  onClick={handlePrivacyToggle}
                  disabled={isPrivacyToggleInProgress || (track.child_count > 0 && !track.is_private)}
                >
                  {isPrivate ? (
                    <>
                      <FaLock className="btn-icon" />
                      <span>Private</span>
                    </>
                  ) : (
                    <>
                      <FaLockOpen className="btn-icon" />
                      <span>Public</span>
                    </>
                  )}
                </button>
                <p className="privacy-description">
                  {isPrivate 
                    ? 'This track is private. Only you and people with the link can view it.' 
                    : 'This track is public. Anyone can view and collaborate on it.'}
                </p>
              </div>
              
              {isPrivate && (
                <div className="share-link-section">
                  <button 
                    className="edit-track-share-btn"
                    onClick={handleCopyLink}
                  >
                    <FaShareAlt className="btn-icon" />
                    <span>{isLinkCopied ? 'Link Copied!' : 'Copy Private Link'}</span>
                  </button>
                  <p className="share-description">
                    Share this link to give others access to your private track.
                  </p>
                </div>
              )}
            </div>
            
            <div className="edit-track-section danger-zone">
              <h4>Danger Zone</h4>
              <button 
                className="delete-btn"
                onClick={handleDeleteTrack}
                disabled={isDeleteInProgress}
              >
                <FaTrash className="btn-icon" />
                <span>{isDeleteInProgress ? 'Deleting...' : 'Delete Track'}</span>
              </button>
              <p className="delete-description">
                {track.child_count > 0 
                  ? 'This track has collaborations. Deleting it will remove your ownership, but the track will remain available for others.' 
                  : 'This action cannot be undone. The track will be permanently deleted.'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Main page component
export default function CollaboratePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="large" />
      </div>
    }>
      <TrackContent />
    </Suspense>
  );
} 