'use client';
import { useState, useCallback } from 'react';
import Link from 'next/link';
import { campApi } from '../../../../lib/api';
import Track from '../../../../components/Track';
import InfiniteScrollContainer from '../../../../components/InfiniteScrollContainer';
import { FaMusic, FaUpload } from 'react-icons/fa';
import sharedStyles from '../../../../styles/Dashboard.module.css';

const BEATS_PER_PAGE = 5;

function BeatPoolTab({ camp, isActive }) {
  const [expandedTrackId, setExpandedTrackId] = useState(null);

  const fetchBeats = useCallback(async (pageNum) => {
    const response = await campApi.getBeats(camp.id, {
      page: pageNum,
      limit: BEATS_PER_PAGE,
      sort_by: 'recent'
    });
    
    return {
      items: response.data.beats,
      pagination: response.data.pagination
    };
  }, [camp.id]);

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
        campContext={{
          campId: camp.id,
          userRole: camp.user_role
        }}
      />
    );
  }, [expandedTrackId, handleTrackExpansion, camp]);

  const emptyState = (
    <div className={sharedStyles.emptyState}>
      <FaMusic className={sharedStyles.emptyIcon} />
      <h3>No Beats Yet</h3>
      <p>Upload your first beat to get the collaboration started!</p>
    </div>
  );

  return (
    <div className={sharedStyles.tabContent}>
      <div className={sharedStyles.tabHeader}>
        <h2>Beat Pool</h2>
        <Link href={`/upload?camp_id=${camp.id}`} className="pill-btn gradient-btn">
          <FaUpload />
          Add Beat
        </Link>
      </div>
      <InfiniteScrollContainer
        fetchData={fetchBeats}
        renderItem={renderTrack}
        emptyState={emptyState}
        className={sharedStyles.trackList}
        itemsPerPage={BEATS_PER_PAGE}
        dependencies={[camp.id]}
      />
    </div>
  );
}

export default BeatPoolTab;
