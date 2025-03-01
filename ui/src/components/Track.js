'use client';
import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import api from '../lib/api';
import MiniTrack from './MiniTrack';
import { useAudio } from '../lib/AudioContext';

export default function Track({ track }) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);
  const [relatedTracks, setRelatedTracks] = useState([]);
  const { currentTrack, isPlaying, playTrack } = useAudio();

  useEffect(() => {
    if (isExpanded) {
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
  }, [isExpanded, track.id]);

  const toggleExpand = () => setIsExpanded(!isExpanded);

  const originalTrack = relatedTracks.find(t => t.id === track.parent_track_id);
  const collabTracks = relatedTracks.filter(t => t.parent_track_id === track.id);

  return (
    <div className="bg-p1 rounded shadow">
      <div className="p-4 cursor-pointer" onClick={toggleExpand}>
        <div className="flex items-center space-x-4">
          <button
            onClick={(e) => {
              e.stopPropagation();
              playTrack(track);
            }}
            className={`w-10 h-10 rounded-full text-white flex items-center justify-center ${
              currentTrack?.id === track.id && isPlaying ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'
            }`}
          >
            {currentTrack?.id === track.id && isPlaying ? '❚❚' : '▶'}
          </button>
          <div className="flex-1">
            <h2 className="text-lg font-semibold">{track.title}</h2>
            {!track.is_original && (
              <p className="text-sm text-gray-600">Based on: {track.original_title}</p>
            )}
            <p className="text-sm text-gray-600">{track.collab_count} collabs</p>
          </div>
        </div>
        <button onClick={() => router.push(`/collaborate/${track.id}`)} className="ml-2 text-blue-500">Collaborate</button>
      </div>

      {isExpanded && (
        <div className="p-4 border-t border-gray-200">
          {originalTrack && (
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-700">Original Track</h3>
              <MiniTrack track={originalTrack} />
            </div>
          )}
          {collabTracks.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700">Collaborations</h3>
              <div className="space-y-2">
                {collabTracks.map(collab => (
                  <MiniTrack key={collab.id} track={collab} />
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