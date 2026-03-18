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
import { FaCheckCircle, FaCheck, FaHeart, FaRegHeart, FaRetweet, FaPlay, FaPause, FaHeadphones, FaShareAlt, FaCodeBranch, FaUsers, FaInfoCircle, FaMusic, FaEye, FaComment, FaTrophy, FaClock, FaFolderOpen, FaEllipsisV, FaDoorOpen, FaFileArchive, FaVideo, FaTrash } from 'react-icons/fa';
import JSZip from 'jszip';
import Image from 'next/image';
import TimeDisplay from './TimeDisplay';
import CommentSection from './CommentSection';
import { useUser } from '../contexts/UserContext';
import styles from './Track.module.css';
import { useMobile } from '../contexts/MobileContext';
import { useToast } from '../lib/ToastContext';
import { useFeatureFlags } from '../contexts/FeatureFlagsContext';
import MoveTrackModal from './teams/MoveTrackModal';
import TrackTags from './TrackTags';
import VideoExportModal from './VideoExportModal';
import VideoExportStatusModal from './VideoExportStatusModal';
import {usePluginWebSocket} from '../contexts/PluginWebSocketContext';

export default function Track(
    { track, 
      allTracks, 
      setExpandedTrackId, 
      expandedTrackId,
      view = 'default', // Used in tree view, competition view, or default
      setSelectedTrack, // Used in tree view
      trackTreeIds, // Used in tree view
      competition, // Competition data when in competition view
      entryStatus, // User's entry status in competition
      onEnterCompetition, // Callback for entering competition
      isEntering, // Loading state for entering competition
      teamContext, // { teamId, folderId, userRole } - for team folder management
      campContext // { campId, roomId, userRole } - for camp room management
    }
  ) 
{
  const router = useRouter();
  const { isMobile } = useMobile();
  const [isExpanded, setIsExpanded] = useState(false);
  const [originalTrack, setOriginalTrack] = useState(null);
  const [collabTracks, setCollabTracks] = useState([]);
  const { currentTrack, isPlaying, playTrack, togglePlayPause, setDiscoveryMethod } = useAudio();
  const [loadingRelated, setLoadingRelated] = useState(false);
  const [activeTab, setActiveTab] = useState('collabs');
  const [isLinkCopied, setIsLinkCopied] = useState(false);
  const { user: currentUser, isAuthenticated } = useUser();
  const [hasMoreTracks, setHasMoreTracks] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalTracks, setTotalTracks] = useState(0);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveModalType, setMoveModalType] = useState(null); // 'folder' or 'room'
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [isExportingStems, setIsExportingStems] = useState(false);
  const [showVideoExportModal, setShowVideoExportModal] = useState(false);
  const [showVideoExportStatusModal, setShowVideoExportStatusModal] = useState(false);
  const [videoExportId, setVideoExportId] = useState(null);
  const [isDeleteInProgress, setIsDeleteInProgress] = useState(false);
  const actionsMenuRef = useRef(null);
  const { showSuccess, showError } = useToast();
  const { isFeatureEnabled } = useFeatureFlags();
  const { send } = usePluginWebSocket();

  // Close actions menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target)) {
        setShowActionsMenu(false);
      }
    }

    if (showActionsMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showActionsMenu]);

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
    
    // Determine discovery method based on current page/context
    let discoveryMethod = 'unknown';
    const pathname = window.location.pathname;
    
    if (pathname === '/') {
      discoveryMethod = 'home_feed';
    } else if (pathname.startsWith('/user/')) {
      discoveryMethod = 'user_page';
    } else if (pathname.startsWith('/track/')) {
      discoveryMethod = 'track_page';
    } else if (pathname.startsWith('/search')) {
      discoveryMethod = 'search';
    } else if (pathname.startsWith('/explore')) {
      discoveryMethod = 'explore_page';
    } else if (pathname.startsWith('/featured')) {
      discoveryMethod = 'featured_page';
    }
    
    // Set discovery method for analytics
    setDiscoveryMethod(discoveryMethod);
    
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
    let trackUrl = `${baseUrl}/track/${track.guid}`;
    
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

  const handleExportStems = async (e) => {
    e.stopPropagation();
    setShowActionsMenu(false);
    
    if (isExportingStems) return;
    setIsExportingStems(true);
    
    try {
      // Fetch stems data from the API
      const stemsResponse = await api.get(`/tracks/${track.id}/stems`);
      const stems = stemsResponse.data;
      
      if (!stems || stems.length === 0) {
        showError('No stems available for this track');
        return;
      }
      
      // Create a new ZIP file
      const zip = new JSZip();
      
      // Download each stem and add to ZIP
      for (let i = 0; i < stems.length; i++) {
        const stem = stems[i];
        try {
          // Fetch the audio file
          const audioResponse = await fetch(stem.audio_url);
          if (!audioResponse.ok) {
            throw new Error(`Failed to fetch stem: ${stem.title}`);
          }
          
          const audioBlob = await audioResponse.blob();
          
          // Determine file extension from URL or default to .mp3
          const urlPath = new URL(stem.audio_url).pathname;
          const extension = urlPath.match(/\.(mp3|wav|m4a|webm|ogg)$/i)?.[0] || '.mp3';
          
          // Create a safe filename
          const safeTitle = (stem.title || `Stem ${i + 1}`).replace(/[^a-z0-9\s\-\_]/gi, '').trim();
          const filename = `${String(i + 1).padStart(2, '0')} - ${safeTitle}${extension}`;
          
          zip.file(filename, audioBlob);
        } catch (stemError) {
          console.error(`Error fetching stem ${stem.title}:`, stemError);
          // Continue with other stems even if one fails
        }
      }
      
      // Generate the ZIP file
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      
      // Create download link
      const safeTrackTitle = track.title.replace(/[^a-z0-9\s\-\_]/gi, '').trim();
      const zipFilename = `${safeTrackTitle} - Stems.zip`;
      
      const downloadLink = document.createElement('a');
      downloadLink.href = URL.createObjectURL(zipBlob);
      downloadLink.download = zipFilename;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      
      // Clean up the object URL
      URL.revokeObjectURL(downloadLink.href);
      
      showSuccess('Stems exported successfully!');
    } catch (err) {
      console.error('Error exporting stems:', err);
      showError('Failed to export stems. Please try again.');
    } finally {
      setIsExportingStems(false);
    }
  };

  const handleDeleteTrack = async (e) => {
    e.stopPropagation();
    setShowActionsMenu(false);
    
    if (currentUser?.id !== track.user_id || isDeleteInProgress) return;
    
    // Confirm deletion with user
    const hasChildren = track.child_count > 0 || track.collab_count > 0;
    let confirmMessage = 'Are you sure you want to delete this track?';
    
    if (hasChildren) {
      confirmMessage = 'This track has collaborations. Deleting it will remove your ownership, but the track will remain available for others. Continue?';
    }
    
    if (!window.confirm(confirmMessage)) {
      return;
    }
    
    setIsDeleteInProgress(true);
    
    try {
      // Use numeric ID for API calls
      const response = await api.delete(`/tracks/${track.id}`);
      
      // Show appropriate message based on deletion type
      if (response.data.soft_delete) {
        alert('Track has been removed from your profile but remains available for collaborations.');
      } else {
        alert('Track has been permanently deleted.');
      }
      
      // Refresh current page
      window.location.reload();
    } catch (err) {
      console.error('Failed to delete track:', err);
      alert('Failed to delete track. Please try again later.');
    } finally {
      setIsDeleteInProgress(false);
    }
  };

  const navigateToUserProfile = (e) => {
    e.stopPropagation();
    if(track.username) {
      router.push(`/user/${track.username}`);
    }
  };

  const navigateToTrack = (e) => {
    e.stopPropagation();
    router.push(`/track/${track.guid}`);
  };

  const openInPlugin = async (e) => {
    e.stopPropagation();
    let msg = {
      type: 'set_track',
      track_id: track.id,
      payload: track
    }
    try {
      await send(JSON.stringify(msg));
    } catch (err) {
    }
    setShowActionsMenu(false);
  };

  // Competition button helpers
  const getCompetitionButtonClass = () => {
    if (!competition) return 'pink-btn sm';
    
    const now = new Date();
    const startDate = new Date(competition.startdate);
    const endDate = new Date(competition.enddate);
    const isActive = now >= startDate && now <= endDate;
    
    if (!isActive) return 'disabled-btn sm';
    if (entryStatus === 'entered') return 'green-btn sm';
    if (competition.host_id === currentUser?.id) return 'disabled-btn sm';
    
    return 'gradient-btn sm';
  };

  const isCompetitionButtonDisabled = () => {
    if (!competition) return false;
    
    const now = new Date();
    const startDate = new Date(competition.startdate);
    const endDate = new Date(competition.enddate);
    const isActive = now >= startDate && now <= endDate;
    
    return !isActive || entryStatus === 'entered' || competition.host_id === currentUser?.id || isEntering;
  };

  const getCompetitionButtonContent = () => {
    if (!competition) return <><FaUsers /> Collab</>;
    
    const now = new Date();
    const startDate = new Date(competition.startdate);
    const endDate = new Date(competition.enddate);
    const isActive = now >= startDate && now <= endDate;
    
    if (!isActive) {
      return <><FaClock /> Competition Not Active</>;
    }
    
    if (entryStatus === 'entered') {
      return <><FaCheckCircle /> Entered</>;
    }
    
    if (competition.host_id === currentUser?.id) {
      return <><FaTrophy /> Your Competition</>;
    }
    
    if (isEntering) {
      return <><FaUsers /> Entering...</>;
    }
    
    return <><FaUsers /> Enter Competition</>;
  };

  const handleCompetitionAction = (e) => {
    e.stopPropagation();
    
    if (onEnterCompetition) {
      onEnterCompetition();
    } else {
      // Fallback to normal track navigation
      let url = `/track/${track.guid}`;
      const params = new URLSearchParams();
      
      // Include camp_id or team_id, but not both (prioritize camp_id)
      if (campContext?.campId) {
        params.append('camp_id', campContext.campId);
      } else if (teamContext?.teamId) {
        params.append('team_id', teamContext.teamId);
      }
      
      // Append params to URL if any exist
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
      
      router.push(url);
    }
  };

  // Create tabs configuration
  const tabs = [
    { key: 'collabs', label: 'Collabs' },
    { key: 'tags', label: 'Tags' },
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
              alt={track.username ? track.username : "Unknown Artist"}
              width={24}
              height={24} 
              className={`avatar ${track.username ? 'hover:pointer' : ''} mr-1`} 
              onClick={navigateToUserProfile}
            />
            <div className={styles.artistName}>
              <span 
                className={`${track.username ? 'link-underline' : ''}`} 
                onClick={navigateToUserProfile}
              >
                {track.username ? track.username : "Unknown Artist"}
              </span>
              {track.verified && <FaCheckCircle className="verified-icon" />}
            </div>
          </div>

        <div className={styles.trackTitle}>
          <div className={styles.trackTitleContainer}>
            <span className="title-text link-underline" onClick={navigateToTrack}>{track.title}</span>
          </div>
          <div className={styles.trackLayerMessage}>
            {track?.parent_track_id ? 
            (
              <>
                <b>Layer {track.layer}</b> - Based on &quot;{track.original_title}&quot; by {track.original_username ? track.original_username : "Unknown Artist"}
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
          <TrackTags track={track} variant="light" />
                      
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
          
          {/* Actions menu (ellipses button) */}
          <div className={styles.trackActionsMenu} ref={actionsMenuRef}>
              <button 
                className="pill-btn sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowActionsMenu(!showActionsMenu);
                }}
                title="More actions"
                style={{ background: 'var(--grey-1)', color: 'var(--text-primary)', border: '1px solid var(--grey-2)', paddingInline: '8px' }}
              >
                <FaEllipsisV style={{ margin: '0px' }}/>
              </button>
              
              {showActionsMenu && (
                <div className={styles.actionsDropdown}>
                  {/* Analytics option for track owners - only show when subscriptions enabled */}
                  {currentUser?.id === track.user_id && isFeatureEnabled('subscriptions', false) && (
                    <button
                      className={styles.actionMenuItem}
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowActionsMenu(false);
                        router.push(`/user/${track.artist?.username || currentUser.username}/analytics/track/${track.id}`);
                      }}
                    >
                      📊 Analytics
                    </button>
                  )}
                  <button
                    className={styles.actionMenuItem}
                    onClick={openInPlugin}
                  >
                    Open in Plugin
                  </button>
                  
                  {/* Move to folder option (team context only) */}
                  {teamContext && (teamContext.userRole === 'contributor' || teamContext.userRole === 'admin' || teamContext.userRole === 'owner') && (
                    <button
                      className={styles.actionMenuItem}
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowActionsMenu(false);
                        setMoveModalType('folder');
                        setShowMoveModal(true);
                      }}
                    >
                      <FaFolderOpen /> Move to Folder
                    </button>
                  )}
                  
                  {/* Move to room option (camp context only, for non-beat tracks) */}
                  {campContext && track.parent_track_id && (campContext.userRole === 'admin' || campContext.userRole === 'owner' || currentUser?.id === track.user_id) && (
                    <button
                      className={styles.actionMenuItem}
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowActionsMenu(false);
                        setMoveModalType('room');
                        setShowMoveModal(true);
                      }}
                    >
                      <FaDoorOpen /> Move to Room
                    </button>
                  )}
                  
                  {/* Export Stems option (camp or team context only) */}
                  {(campContext || teamContext) && (
                    <button
                      className={styles.actionMenuItem}
                      onClick={handleExportStems}
                      disabled={isExportingStems}
                    >
                      <FaFileArchive /> {isExportingStems ? 'Exporting...' : 'Export Stems'}
                    </button>
                  )}
                  
                  {/* Generate Video option (only for track creator) */}
                  {/* {currentUser?.id === track.user_id && (
                    <button
                      className={styles.actionMenuItem}
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowActionsMenu(false);
                        setShowVideoExportModal(true);
                      }}
                    >
                      <FaVideo /> Generate Video
                    </button>
                  )} */}
                  
                  {/* Delete Track option (only for track owner) */}
                  {currentUser?.id === track.user_id && (
                    <button
                      className={styles.actionMenuItem}
                      onClick={handleDeleteTrack}
                      disabled={isDeleteInProgress}
                      style={{ color: 'var(--red)' }}
                    >
                      <FaTrash /> {isDeleteInProgress ? 'Deleting...' : 'Delete Track'}
                    </button>
                  )}
                </div>
              )}
            </div>
          
          {/* Video Export Modals */}
          {showVideoExportModal && (
            <VideoExportModal
              isOpen={showVideoExportModal}
              onClose={() => setShowVideoExportModal(false)}
              track={track}
              onExportStart={(exportId) => {
                setVideoExportId(exportId);
                setShowVideoExportModal(false);
                setShowVideoExportStatusModal(true);
              }}
            />
          )}
          
          {showVideoExportStatusModal && videoExportId && (
            <VideoExportStatusModal
              isOpen={showVideoExportStatusModal}
              onClose={() => {
                setShowVideoExportStatusModal(false);
                setVideoExportId(null);
              }}
              trackId={track.id}
              exportId={videoExportId}
              onRetry={() => {
                setShowVideoExportStatusModal(false);
                setVideoExportId(null);
                setShowVideoExportModal(true);
              }}
            />
          )}
          
          {/* Competition view button */}
          {view === 'competition' && competition ? (
            <button 
              className={`pill-btn ${getCompetitionButtonClass()}`}
              onClick={handleCompetitionAction}
              disabled={isCompetitionButtonDisabled()}
            >
              {getCompetitionButtonContent()}
            </button>
          ) : (
            <button 
              className="pill-btn pink-btn sm" 
              onClick={(e) => {
                e.stopPropagation();
                let url = `/track/${track.guid}`;
                const params = new URLSearchParams();
                
                // Include camp_id or team_id, but not both (prioritize camp_id)
                if (campContext?.campId) {
                  params.append('camp_id', campContext.campId);
                } else if (teamContext?.teamId) {
                  params.append('team_id', teamContext.teamId);
                }
                
                // Append params to URL if any exist
                if (params.toString()) {
                  url += `?${params.toString()}`;
                }
                
                router.push(url);
              }}
            >
              {track?.layer < 4 ? (<><FaUsers /> Collab</>) : (<><FaEye /> View Track</>)}
            </button>
          )}
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
                    {originalTrack && view !== 'tree' && (
                      <>
                        <div className={styles.trackRelation}>Original</div>
                        <MiniTrack track={originalTrack} relatedTracks={collabTracks} />
                      </>
                    )}
                    
                    {collabTracks.length > 0 ? (
                      <>
                        <div className={styles.trackRelation}>Based on this</div>
                        {collabTracks.map(collab => (
                          <MiniTrack key={collab.id} track={collab} relatedTracks={collabTracks} view={view} setSelectedTrack={setSelectedTrack} trackTreeIds={trackTreeIds} />
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
                        {(view === 'tree' || !originalTrack) && collabTracks.length === 0 && (
                          <div className={styles.noRelated}>There are no tracks based on this track</div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
          
          {activeTab === 'tags' && (
            <div className="track-tab-content">
              <div className={styles.tagsTabContent}>
                {/* Genres */}
                {track.genres && Array.isArray(track.genres) && track.genres.length > 0 && (
                  <div className={styles.tagCategory}>
                    <h3 className={styles.tagCategoryTitle}>Genres</h3>
                    <TrackTags track={track} variant="dark" categories={['genres']} />
                  </div>
                )}
                
                {/* Instruments */}
                {track.instruments && Array.isArray(track.instruments) && track.instruments.length > 0 && (
                  <div className={styles.tagCategory}>
                    <h3 className={styles.tagCategoryTitle}>Instruments</h3>
                    <TrackTags track={track} variant="dark" categories={['instruments']} />
                  </div>
                )}
                
                {/* Elements */}
                {track.elements && Array.isArray(track.elements) && track.elements.length > 0 && (
                  <div className={styles.tagCategory}>
                    <h3 className={styles.tagCategoryTitle}>Elements</h3>
                    <TrackTags track={track} variant="dark" categories={['elements']} />
                  </div>
                )}
                
                {/* Requested Instruments */}
                {track.instrument_requests && Array.isArray(track.instrument_requests) && track.instrument_requests.length > 0 && (
                  <div className={styles.tagCategory}>
                    <h3 className={styles.tagCategoryTitle}>Requested Instruments</h3>
                    <TrackTags track={track} variant="dark" categories={['instrument_requests']} />
                  </div>
                )}
                
                {/* Requested Elements */}
                {track.element_requests && Array.isArray(track.element_requests) && track.element_requests.length > 0 && (
                  <div className={styles.tagCategory}>
                    <h3 className={styles.tagCategoryTitle}>Requested Elements</h3>
                    <TrackTags track={track} variant="dark" categories={['element_requests']} />
                  </div>
                )}
                
                {/* Show message if no tags */}
                {(!track.genres || track.genres.length === 0) &&
                 (!track.instruments || track.instruments.length === 0) &&
                 (!track.elements || track.elements.length === 0) &&
                 (!track.instrument_requests || track.instrument_requests.length === 0) &&
                 (!track.element_requests || track.element_requests.length === 0) && (
                  <div className={styles.noTags}>No tags available for this track</div>
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
      
      {/* Move Track Modal */}
      {showMoveModal && moveModalType && (
        <MoveTrackModal
          type={moveModalType}
          teamId={moveModalType === 'folder' ? teamContext?.teamId : undefined}
          campId={moveModalType === 'room' ? campContext?.campId : undefined}
          track={track}
          currentId={
            moveModalType === 'folder'
              ? (track.team_folder_id || teamContext?.folderId || null)
              : (track.room_id || campContext?.roomId || null)
          }
          onClose={() => {
            setShowMoveModal(false);
            setMoveModalType(null);
          }}
          onSuccess={() => {
            setShowMoveModal(false);
            setMoveModalType(null);
            // Refresh the page to show updated folder/room
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}