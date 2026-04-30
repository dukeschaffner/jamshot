'use client';

import { useState, useEffect, useRef, Suspense, useMemo } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { trackApi } from '@/lib/api';
import api from '@/lib/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import './collaborate.css';
import { FaCheckCircle, FaShareAlt, FaProjectDiagram, FaLock, FaLockOpen, FaTrash, FaDesktop} from 'react-icons/fa';
import { useUser } from '../../../contexts/UserContext';
import { useMobile } from '../../../contexts/MobileContext';
import { useAudio } from '@/lib/AudioContext';
import { useFeatureFlags } from '../../../contexts/FeatureFlagsContext';
import DAW from '@/components/DAW/DAW';
import Track from '@/components/Track';
import { captureTrackPageOpened } from '@/lib/posthogAnalytics';

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
  const { isFeatureEnabled } = useFeatureFlags();
  const [isTrackOwner, setIsTrackOwner] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [isPrivacyToggleInProgress, setIsPrivacyToggleInProgress] = useState(false);
  const [isLinkCopied, setIsLinkCopied] = useState(false);
  const [moderationStatus, setModerationStatus] = useState(null); // 'waiting_for_approval', 'rejected', or null
  const [rejectionReason, setRejectionReason] = useState(null);
  const [statusPollingInterval, setStatusPollingInterval] = useState(null);
  const pollingStartTimeRef = useRef(null);
  const { setSpaceShortcutEnabled } = useAudio();

  const dawElement = useMemo(() => 
    <div style={{display: activeTab === 'collab' ? 'block' : 'none'}}>
      {isMobile ? (
        <div className="mobile-collab-message">
          <FaDesktop className="mobile-collab-icon" />
          <h3>Desktop Required</h3>
          <p>Use Desktop version to record or upload file to collaborate</p>
        </div>
      ) : (
        <DAW track={track} isVisible={activeTab === 'collab'}/>
      )}
    </div>
  , [track, activeTab, isMobile]);


  // Disable space shortcut for global player when DAW is active
  useEffect(() => {
    if(activeTab === 'collab') {
      setSpaceShortcutEnabled(false);
    } else {
      setSpaceShortcutEnabled(true);
    }
    return () => {
      setSpaceShortcutEnabled(true);
    };
  }, [activeTab, setSpaceShortcutEnabled]);


  const startStatusPolling = () => {
    // Start polling for status changes (every 30 seconds for up to 5 minutes)
    const startTime = Date.now();
    pollingStartTimeRef.current = startTime;

    const interval = setInterval(async () => {
      try {
        // Check if we've been polling for more than 5 minutes
        if (Date.now() - pollingStartTimeRef.current > 5 * 60 * 1000) {
          clearInterval(interval);
          setStatusPollingInterval(null);
          return;
        }

        // Poll the track status
        const statusResponse = await api.get(`/tracks/${trackId}/status`);
        const statusData = statusResponse.data;

        if (statusData.status === 'completed') {
          // Track was approved, reload the full track
          clearInterval(interval);
          setStatusPollingInterval(null);
          setModerationStatus(null);
          // Reload the track
          const response = await trackApi.getTrack(trackId, secret);
          const data = response.data;
          const mainTrack = Array.isArray(data) && data.length > 0 ? data[0] : null;
          if (mainTrack) {
            setTrack(mainTrack);
            setIsPrivate(mainTrack.is_private || false);
          }
          setLoading(false);
        }
        // If still waiting_for_approval, continue polling
        // If rejected, the API would return an error, but we handle that in the initial load
      } catch (err) {
        console.error('Error polling track status:', err);
        // Continue polling on error
      }
    }, 30000); // 30 seconds

    setStatusPollingInterval(interval);
  };

  useEffect(() => {
    async function loadTrack() {
      try {
        setLoading(true);
        setModerationStatus(null);
        setRejectionReason(null);

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

        // Check if this is a moderation-related error
        if (err.response && err.response.data && err.response.data.error) {
          const errorData = err.response.data.error;
          if (errorData.code === 'TRACK_WAITING_FOR_APPROVAL') {
            setModerationStatus('waiting_for_approval');
            setLoading(false);
            startStatusPolling();
            return;
          } else if (errorData.code === 'TRACK_REJECTED') {
            setModerationStatus('rejected');
            setRejectionReason(errorData.rejection_reason);
            setLoading(false);
            return;
          }
        }

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

    // Cleanup polling interval on unmount
    return () => {
      if (statusPollingInterval) {
        clearInterval(statusPollingInterval);
      }
    };
  }, [trackId, secret]);

  const posthogPageOpenedRef = useRef(false);

  useEffect(() => {
    posthogPageOpenedRef.current = false;
  }, [trackId]);

  useEffect(() => {
    if (loading || !track?.id || !track?.guid || posthogPageOpenedRef.current) return;
    posthogPageOpenedRef.current = true;
    captureTrackPageOpened({
      track_id: track.id,
      track_guid: track.guid,
      track_title: track.title,
      is_collab_layer: track.layer > 0 || !!track.parent_track_id,
    });
  }, [loading, track?.id, track?.guid, track?.title, track?.layer, track?.parent_track_id]);

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
      // Use numeric ID for API calls
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

  const handleCopyLink = async () => {
    const baseUrl = window.location.origin;
    // Use the track's GUID for the public-facing URL
    let trackUrl = `${baseUrl}/track/${track.guid}`;
    
    // If track is private, get the secret token from the API
    if (isPrivate && isTrackOwner) {
      try {
        setIsLinkCopied(true); // Show loading state
        // Use numeric ID for API calls
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
  const handleTabChange = (tab) => {
    setActiveTab(tab);
  };


  const isTrackPrivacyFeatureEnabled = isFeatureEnabled('subscriptions', false);

  const editTabContent = (
    <div className="edit-track-container">
      <div className="edit-track-panel">
        <h3>Track Settings</h3>
        
        {isTrackPrivacyFeatureEnabled && (
          <>
            <div className="edit-track-section">
              <h4>Privacy Settings</h4>
              <div className="privacy-toggle">
                <button 
                  className={`pill-btn w-min`}
                  onClick={handlePrivacyToggle}
                  disabled={isPrivacyToggleInProgress || (track?.child_count > 0 && !track?.is_private)}
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
          </>
        )}
      </div>
    </div>
  );

  const extraTabs = [
    ...(isTrackOwner && isTrackPrivacyFeatureEnabled ? [{ key: 'edit', label: 'Edit', content: editTabContent}] : []),
    ...(track?.layer < 4 ? [{ key: 'collab', label: 'Collab', content: dawElement, keepMounted: true}] : []),
  ]



  const actionButton = (
    <Link href={`/tree/${track?.guid}`} className="pill-btn sm">
      <FaProjectDiagram className="explore-icon" />
      <span>Explore</span>
    </Link>
  );

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

  // Handle moderation status
  if (moderationStatus === 'waiting_for_approval') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-lg font-medium mb-2">Waiting for Approval</div>
          <div className="text-gray-600 mb-4">
            This track is currently being reviewed by our moderators. Please check back later.
          </div>
          {statusPollingInterval && (
            <div className="text-sm text-gray-500">
              Auto-refreshing status every 30 seconds...
            </div>
          )}
        </div>
      </div>
    );
  }

  if (moderationStatus === 'rejected') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-lg font-medium mb-2 text-red-600">Track Rejected</div>
          <div className="text-gray-600 mb-4">
            This track has been rejected by our moderators.
            {rejectionReason && (
              <div className="mt-2 text-sm">
                <strong>Reason:</strong> {rejectionReason}
              </div>
            )}
          </div>
        </div>
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
        <Track 
          track={track} 
          context="track_page" 
          extraTabs={extraTabs}
          onTabChange={handleTabChange}
          initialTab={track?.layer < 4 ? 'collab' : 'comments'}
          actionButton={actionButton}
          expandedTrackId={track.id}
        />



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