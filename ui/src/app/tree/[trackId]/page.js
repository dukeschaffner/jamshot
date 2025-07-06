'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import api from '../../../lib/api';
import Track from '../../../components/Track';
import MiniTrack from '../../../components/MiniTrack';
import LoadingSpinner from '../../../components/LoadingSpinner';
import { FaArrowLeft } from 'react-icons/fa';
import { useAudio } from '../../../lib/AudioContext';

export default function TrackTreePage() {
  const { trackId } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const secret = searchParams.get('secret');
  const [trackTree, setTrackTree] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedTrackId, setExpandedTrackId] = useState(null);
  const [trackTreeIds, setTrackTreeIds] = useState([]);
  const { currentTrack } = useAudio();

  useEffect(() => {
    const fetchTrackTree = async () => {
      try {
        setLoading(true);
        // Include secret in the request if available
        const url = secret 
          ? `/tracks/${trackId}/tree?secret=${secret}`
          : `/tracks/${trackId}/tree`;
        
        const response = await api.get(url);
        setTrackTree(response.data); // [ancestors, current]
        setTrackTreeIds(response.data.map(track => track.id));
        // Expand the last track in the array (current track)
        setExpandedTrackId(response.data[response.data.length - 1].id);
      } catch (err) {
        console.error('Failed to fetch track tree:', err);
        if (err.response && err.response.status === 403) {
          setError('This track is private. You do not have permission to view it.');
        } else {
          setError('Failed to load track data. Please try again later.');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchTrackTree();
    
  }, [trackId, secret]);

  const handleBackClick = () => {
    router.back();
  };

  if (loading) {
    return (
      <div className="track-detail-page loading">
        <LoadingSpinner size="medium" />
        <p>Loading track details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="track-detail-page error">
        <p>{error}</p>
        <button onClick={handleBackClick} className="back-button">
          <FaArrowLeft /> Go Back
        </button>
      </div>
    );
  }

  if (!trackTree) {
    return null;
  }

  return (
    <div className="track-detail-page">
      <div className="track-detail-header">
        <button onClick={handleBackClick} className="back-button">
          <FaArrowLeft /> Back
        </button>
        <h1>Explore all the different versions of this track</h1>
      </div>

      <div className="track-tree-container">
        {/* Ancestors (tracks up to the root) */}
        {trackTree.length > 0 && (
          <div className="track-ancestors">
            <div className="ancestors-list">
              {trackTree.map((track, index) => (
                <div key={track.id} className="ancestor-level">
                  <div className="level-indicator">Level {index + 1}</div>
                  <Track 
                    track={track} 
                    allTracks={trackTree}
                    isTreeView={true}
                    expandedTrackId={expandedTrackId}
                    setExpandedTrackId={setExpandedTrackId}
                    trackTreeIds={trackTreeIds}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}