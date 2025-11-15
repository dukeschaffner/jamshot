'use client';
import { useState, useCallback } from 'react';
import Link from 'next/link';
import { teamApi } from '../../../../lib/api';
import Track from '../../../../components/Track';
import InfiniteScrollContainer from '../../../../components/InfiniteScrollContainer';
import { FaMusic, FaUpload } from 'react-icons/fa';
import sharedStyles from '../../../../styles/Dashboard.module.css';

const TRACKS_PER_PAGE = 5;

function TeamTracksTab({ team }) {
  const [expandedTrackId, setExpandedTrackId] = useState(null);

  const fetchTracks = useCallback(async (pageNum) => {
    const response = await teamApi.getTracks(team.id, {
      page: pageNum,
      limit: TRACKS_PER_PAGE,
      sort_by: 'recent'
    });
    
    return {
      items: response.data.tracks,
      pagination: response.data.pagination
    };
  }, [team.id]);

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
        teamContext={{ teamId: team.id, folderId: track.team_folder_id || null, userRole: team.user_role }}
      />
    );
  }, [expandedTrackId, handleTrackExpansion, team.id, team.user_role]);

  const emptyState = (
    <div className={sharedStyles.emptyState}>
      <FaMusic className={sharedStyles.emptyIcon} />
      <h3>No Tracks Yet</h3>
      <p>Team tracks will appear here once members start uploading.</p>
    </div>
  );

  return (
    <div className={sharedStyles.tabContent}>
      <div className={sharedStyles.tabHeader}>
        <h2>Team Tracks</h2>
        <Link href={`/upload?team_id=${team.id}`} className="pill-btn gradient-btn">
          <FaUpload />
          Upload Track
        </Link>
      </div>
      <InfiniteScrollContainer
        fetchData={fetchTracks}
        renderItem={renderTrack}
        emptyState={emptyState}
        className={sharedStyles.trackList}
        itemsPerPage={TRACKS_PER_PAGE}
        dependencies={[team.id]}
      />
    </div>
  );
}

export default TeamTracksTab;

