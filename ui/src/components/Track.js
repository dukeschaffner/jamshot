'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '../lib/api';
import MiniTrack from './MiniTrack';
import { useAudio } from '../lib/AudioContext';
import { FaCheckCircle } from 'react-icons/fa';

export default function Track({ track, allTracks, setExpandedTrackId, expandedTrackId }) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);
  const [relatedTracks, setRelatedTracks] = useState([]);
  const { currentTrack, isPlaying, playTrack, togglePlayPause } = useAudio();

  useEffect(() => {
    setIsExpanded(expandedTrackId === track.id);
    if (expandedTrackId === track.id) {
      const fetchRelatedTracks = async () => {
        try {
          const response = await api.get(`/tracks/${track.id}/related`);
          setRelatedTracks(response.data);
        } catch (err) {
          console.error('Failed to fetch related tracks:', err);
        }
      };
      fetchRelatedTracks();
    }
  }, [expandedTrackId, track.id]);

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

  const originalTrack = relatedTracks.find(t => t.id === track.parent_track_id);
  const collabTracks = relatedTracks.filter(t => t.parent_track_id === track.id);

  return (
    <div className="bg-p1 rounded-lg shadow-md">
      <div className="p-4 cursor-pointer" onClick={toggleExpand}>
        <div className="flex items-center space-x-4">
          <button
            onClick={handlePlayToggle}
            className={`w-10 h-10 rounded-full text-white flex items-center justify-center ${
              currentTrack?.id === track.id && isPlaying ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'
            }`}
          >
            {currentTrack?.id === track.id && isPlaying ? '❚❚' : '▶'}
          </button>
          <div className="flex-1">
            <div className="flex items-center space-x-2">
              <h2 className="text-lg font-semibold text-gray-800">{track.title}</h2>
              {track.verified && (
                <FaCheckCircle className="text-blue-500" title="Verified Artist" />
              )}
            </div>
            <p className="text-sm text-gray-600">by {track.username}</p>
            {track.layer > 0 && (
              <p className="text-sm text-gray-600">Layer: {track.layer} (Based on: {track.original_title})</p>
            )}
            <p className="text-sm text-gray-600">{track.collab_count} collabs</p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/collaborate/${track.id}`);
            }}
            className="px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
          >
            Collaborate
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-4 border-t border-gray-200">
          {originalTrack && (
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-700">Original Track</h3>
              <MiniTrack track={originalTrack} relatedTracks={relatedTracks} />
            </div>
          )}
          {collabTracks.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700">Collaborations</h3>
              <div className="space-y-2">
                {collabTracks.map(collab => (
                  <MiniTrack key={collab.id} track={collab} relatedTracks={relatedTracks} />
                ))}
              </div>
            </div>
          )}
          {(!originalTrack && collabTracks.length === 0) && (
            <p className="text-gray-600">No related tracks yet.</p>
          )}
        </div>
      )}
    </div>
  );
}