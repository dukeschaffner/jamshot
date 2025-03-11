'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import api from '../../../lib/api';
import Track from '../../../components/Track';
import TrackTreeNode from '../../../components/TrackTreeNode';
import { FaArrowLeft, FaSpinner } from 'react-icons/fa';
import { useAudio } from '../../../lib/AudioContext';

export default function TrackDetailPage() {
  const { trackId } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const secret = searchParams.get('secret');
  const [trackTree, setTrackTree] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedTrackId, setExpandedTrackId] = useState(null);
  const [selectedChildId, setSelectedChildId] = useState(null);
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
        setTrackTree(response.data);
        // Expand the current track by default
        setExpandedTrackId(response.data.current.id);
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

  const handleChildSelect = (childId) => {
    // Navigate to the selected child track's page instead of just showing its children
    router.push(`/track/${childId}`);
  };

  const handleBackClick = () => {
    router.back();
  };

  if (loading) {
    return (
      <div className="track-detail-page loading">
        <FaSpinner className="spinner" />
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

  const { current, ancestors, children } = trackTree;

  return (
    <div className="track-detail-page">
      <div className="track-detail-header">
        <button onClick={handleBackClick} className="back-button">
          <FaArrowLeft /> Back
        </button>
        <h1>Track Details</h1>
      </div>

      <div className="track-tree-container">
        {/* Ancestors (tracks up to the root) */}
        {ancestors.length > 0 && (
          <div className="track-ancestors">
            <h2>Original Track & Ancestors</h2>
            <div className="ancestors-list">
              {ancestors.map((ancestor, index) => (
                <div key={ancestor.id} className="ancestor-level">
                  <div className="level-indicator">Level {index + 1}</div>
                  <TrackTreeNode 
                    track={ancestor}
                    expandedTrackId={expandedTrackId}
                    setExpandedTrackId={setExpandedTrackId}
                    onChildSelect={handleChildSelect}
                    isPlaying={currentTrack?.id === ancestor.id}
                    level={index + 1}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Current track */}
        <div className="current-track-container">
          <div className="level-indicator">
            {ancestors.length > 0 
              ? `Level ${ancestors.length + 1}` 
              : 'Original Track'}
          </div>
          <TrackTreeNode 
            track={current}
            expandedTrackId={expandedTrackId}
            setExpandedTrackId={setExpandedTrackId}
            onChildSelect={handleChildSelect}
            isPlaying={currentTrack?.id === current.id}
            level={ancestors.length + 1}
            isCurrent={true}
          />
        </div>

        {/* Children of the current track */}
        {children.length > 0 && (
          <div className="track-children">
            <h2>Collaborations</h2>
            <div className="children-list">
              {children.map((child) => (
                <div key={child.id} className="child-track">
                  <TrackTreeNode 
                    track={child}
                    expandedTrackId={expandedTrackId}
                    setExpandedTrackId={setExpandedTrackId}
                    onChildSelect={handleChildSelect}
                    isPlaying={currentTrack?.id === child.id}
                    level={ancestors.length + 2}
                    isSelected={selectedChildId === child.id}
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

// Component to fetch and display children of a selected track
function ChildrenSubtree({ parentId, level, expandedTrackId, setExpandedTrackId }) {
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const { currentTrack } = useAudio();
  const router = useRouter();

  useEffect(() => {
    const fetchChildren = async () => {
      try {
        setLoading(true);
        const response = await api.get(`/tracks/${parentId}/tree`);
        setChildren(response.data.children);
      } catch (err) {
        console.error('Failed to fetch children:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchChildren();
  }, [parentId]);

  const handleChildSelect = (childId) => {
    router.push(`/track/${childId}`);
  };

  if (loading) {
    return <div className="loading-spinner"><FaSpinner className="spinner" /> Loading...</div>;
  }

  if (children.length === 0) {
    return <p>No collaborations found for this track.</p>;
  }

  return (
    <div className="children-subtree">
      {children.map((child) => (
        <div key={child.id} className="subtree-child">
          <div className="level-indicator">Level {level}</div>
          <TrackTreeNode 
            track={child}
            expandedTrackId={expandedTrackId}
            setExpandedTrackId={setExpandedTrackId}
            onChildSelect={handleChildSelect}
            isPlaying={currentTrack?.id === child.id}
            level={level}
          />
        </div>
      ))}
    </div>
  );
} 