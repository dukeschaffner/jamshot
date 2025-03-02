'use client';
import { useAudio } from '../lib/AudioContext';

export default function MiniTrack({ track }) { // Removed playlist prop
  const { currentTrack, isPlaying, playTrack } = useAudio();

  return (
    <div className="flex items-center space-x-2 p-2 bg-p1 rounded">
      <button
        onClick={(e) => {
          e.stopPropagation();
          console.log('Playing track:', track);
          playTrack(track); // No playlist arg
        }}
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