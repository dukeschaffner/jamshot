'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { teamApi } from '../../../../lib/api';
import Track from '../../../../components/Track';
import InfiniteScrollContainer from '../../../../components/InfiniteScrollContainer';
import { FaArrowLeft, FaFolder, FaMusic, FaUpload, FaPlus } from 'react-icons/fa';
import sharedStyles from '../../../../styles/Dashboard.module.css';
import styles from '../TeamDashboard.module.css';

const TRACKS_PER_PAGE = 5;

function FolderView({ team, folderId }) {
  const router = useRouter();
  const [folder, setFolder] = useState(null);
  const [isLoadingFolder, setIsLoadingFolder] = useState(true);
  const [expandedTrackId, setExpandedTrackId] = useState(null);

  // Fetch folder details
  useEffect(() => {
    const fetchFolder = async () => {
      try {
        setIsLoadingFolder(true);
        const response = await teamApi.getFolders(team.id);
        const foundFolder = response.data.folders?.find(f => f.id === parseInt(folderId));
        if (foundFolder) {
          setFolder(foundFolder);
        } else {
          // Folder not found, redirect back to dashboard
          router.replace(`/teams/${team.id}`);
        }
      } catch (err) {
        console.error('Error fetching folder:', err);
        router.replace(`/teams/${team.id}`);
      } finally {
        setIsLoadingFolder(false);
      }
    };

    if (team?.id && folderId) {
      fetchFolder();
    }
  }, [team?.id, folderId, router]);

  const fetchTracks = useCallback(async (pageNum) => {
    const response = await teamApi.getFolderTracks(team.id, parseInt(folderId), {
      page: pageNum,
      limit: TRACKS_PER_PAGE
    });
    
    return {
      items: response.data.tracks,
      pagination: response.data.pagination
    };
  }, [team.id, folderId]);

  const handleTrackExpansion = useCallback((trackId) => {
    setExpandedTrackId(prev => prev === trackId ? null : trackId);
  }, []);

  const renderTrack = useCallback((track, index, tracks) => {
    return (
      <Track
        track={track}
        allTracks={tracks}
        expandedTrackId={expandedTrackId}
        setExpandedTrackId={handleTrackExpansion}
      />
    );
  }, [expandedTrackId, handleTrackExpansion]);

  const handleBackToDashboard = () => {
    router.push(`/teams/${team.id}`);
  };

  const isContributor = () => {
    return team?.user_role === 'contributor' || team?.user_role === 'admin';
  };

  if (isLoadingFolder) {
    return (
      <div className={sharedStyles.tabContent}>
        <div className={sharedStyles.emptyState}>
          <FaFolder className={sharedStyles.emptyIcon} />
          <p>Loading folder...</p>
        </div>
      </div>
    );
  }

  if (!folder) {
    return (
      <div className={sharedStyles.tabContent}>
        <div className={sharedStyles.emptyState}>
          <FaFolder className={sharedStyles.emptyIcon} />
          <h3>Folder Not Found</h3>
          <button onClick={handleBackToDashboard} className={sharedStyles.primaryButton}>
            <FaArrowLeft />
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const emptyState = (
    <div className={sharedStyles.emptyState}>
      <FaMusic className={sharedStyles.emptyIcon} />
      <h3>No Tracks in This Folder</h3>
      <p>This folder is empty. Upload tracks to this folder to see them here.</p>
      {isContributor() && (
        <Link href={`/upload?team_id=${team.id}&folder_id=${folderId}`} className="pill-btn gradient-btn">
          <FaUpload />
          Upload Track
        </Link>
      )}
    </div>
  );

  return (
    <div className={sharedStyles.tabContent}>
      {/* Header */}
      <div className={styles.folderViewHeader}>
        <div className={styles.folderViewHeaderLeft}>
          <button 
            onClick={handleBackToDashboard}
            className={styles.backButton}
            title="Back to Dashboard"
          >
            <FaArrowLeft />
          </button>
          <div className={styles.folderViewTitleSection}>
            <div className={styles.folderViewIcon}>
              <FaFolder />
            </div>
            <div>
              <h2 className={styles.folderViewTitle}>{folder.name}</h2>
              <p className={styles.folderViewSubtitle}>
                {folder.track_count || 0} {folder.track_count === 1 ? 'track' : 'tracks'}
              </p>
            </div>
          </div>
        </div>
        {isContributor() && (
          <div className={styles.folderViewActions}>
            <Link 
              href={`/upload?team_id=${team.id}&folder_id=${folderId}`}
              className={sharedStyles.primaryButton}
            >
              <FaUpload />
              Upload Track
            </Link>
          </div>
        )}
      </div>

      {/* Tracks List */}
      <InfiniteScrollContainer
        fetchData={fetchTracks}
        renderItem={renderTrack}
        emptyState={emptyState}
        className={sharedStyles.trackList}
        itemsPerPage={TRACKS_PER_PAGE}
        dependencies={[team.id, folderId]}
      />
    </div>
  );
}

export default FolderView;

