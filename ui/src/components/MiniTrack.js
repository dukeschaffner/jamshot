'use client';
import { useAudio } from '../lib/AudioContext';

export default function MiniTrack({ track, relatedTracks = [] }) {
  const { currentTrack, isPlaying, playTrack, togglePlayPause } = useAudio();

  const handlePlayToggle = (e) => {
    e.stopPropagation();
    console.log('Playing track:', track);
    if (currentTrack?.id === track.id) {
      console.log('Toggling play/pause for:', track.title);
      togglePlayPause();
    } else {
      const currentIndex = relatedTracks.findIndex(t => t.id === track.id);
      const tracksToAdd = currentIndex >= 0 ? relatedTracks.slice(currentIndex + 1) : []; // Exclude current
      console.log('Overwriting playlist with:', tracksToAdd.map(t => t.title));
      playTrack(track, tracksToAdd);
    }
  };

  return (
    <div className="flex items-center space-x-2 p-2 bg-s2 rounded">
      <button
        onClick={handlePlayToggle}
        className={`w-8 h-8 rounded-full text-white flex items-center justify-center ${
          currentTrack?.id === track.id && isPlaying ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'
        }`}
      >
        {currentTrack?.id === track.id && isPlaying ? '❚❚' : '▶'}
      </button>
      <div className="flex-1">
        <p className="text-sm font-medium">{track.title}</p>
      </div>
    </div>
  );
}