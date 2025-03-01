'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Howl } from 'howler';
import api from '../lib/api';
import MiniTrack from './MiniTrack';

export default function Track({ track }) {
  const router = useRouter();
  const soundRef = useRef(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [relatedTracks, setRelatedTracks] = useState([]);

  useEffect(() => {
    console.log('Track URL:', track.audio_url);
    soundRef.current = new Howl({
      src: [track.audio_url],
      html5: true,
      onload: () => {
        console.log('Audio loaded, duration:', soundRef.current.duration());
        setIsLoaded(true);
      },
      onloaderror: (id, err) => console.error('Load error:', err),
      onplay: () => setIsPlaying(true),
      onpause: () => setIsPlaying(false),
      onend: () => setIsPlaying(false),
      onseek: () => updateProgress(),
    });

    const interval = setInterval(() => {
      if (isPlaying && soundRef.current) updateProgress();
    }, 1000);

    return () => {
      soundRef.current?.unload();
      clearInterval(interval);
    };
  }, [track.audio_url]);

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

  const updateProgress = () => {
    if (soundRef.current) {
      const pos = soundRef.current.seek();
      const dur = soundRef.current.duration();
      setProgress((pos / dur) * 100 || 0);
    }
  };

  const play = () => soundRef.current?.play();
  const pause = () => soundRef.current?.pause();

  const handleSliderChange = (e) => {
    if (soundRef.current && isLoaded) {
      const newProgress = e.target.value;
      const newPosition = (newProgress / 100) * soundRef.current.duration();
      soundRef.current.seek(newPosition);
      setProgress(newProgress);
    }
  };

  const toggleExpand = () => setIsExpanded(!isExpanded);

  const originalTrack = relatedTracks.find(t => t.id === track.parent_track_id);
  const collabTracks = relatedTracks.filter(t => t.parent_track_id === track.id);

  return (
    <div className="bg-p1 rounded shadow">
      {/* Collapsed View */}
      <div className="p-4 cursor-pointer" onClick={toggleExpand}>
        <div className="flex items-center space-x-4">
          <button
            onClick={(e) => {
              e.stopPropagation();
              isPlaying ? pause() : play();
            }}
            disabled={!isLoaded}
            className={`w-10 h-10 rounded-full text-white flex items-center justify-center ${
              isLoaded ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-500'
            }`}
          >
            {isPlaying ? '❚❚' : '▶'}
          </button>
          <div className="flex-1">
            <h2 className="text-lg font-semibold">{track.title}</h2>
            {!track.is_original && (
              <p className="text-sm text-gray-600">Based on: {track.original_title}</p>
            )}
            <p className="text-sm text-gray-600">{track.collab_count} collabs</p>
          </div>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={progress}
          onChange={handleSliderChange}
          onClick={(e) => e.stopPropagation()}
          className="w-full mt-2"
          disabled={!isLoaded}
        />
        <button onClick={() => router.push(`/collaborate/${track.id}`)} className="ml-2 text-blue-500">Collaborate</button>
      </div>

      {/* Expanded View */}
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