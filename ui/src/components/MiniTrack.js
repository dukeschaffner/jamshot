'use client';
import { useEffect, useRef, useState } from 'react';
import { Howl } from 'howler';

export default function MiniTrack({ track }) {
  const soundRef = useRef(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    soundRef.current = new Howl({
      src: [track.audio_url],
      html5: true,
      onload: () => setIsLoaded(true),
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

  return (
    <div className="flex items-center space-x-2 p-2 bg-p1 rounded">
      <button
        onClick={(e) => {
          e.stopPropagation(); // Prevent parent expand toggle
          isPlaying ? pause() : play();
        }}
        disabled={!isLoaded}
        className={`w-8 h-8 rounded-full text-white flex items-center justify-center ${
          isLoaded ? 'bg-blue-500 hover:bg-blue-600' : 'bg-gray-500'
        }`}
      >
        {isPlaying ? '❚❚' : '▶'}
      </button>
      <div className="flex-1">
        <p className="text-sm font-medium">{track.title}</p>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        value={progress}
        onChange={handleSliderChange}
        onClick={(e) => e.stopPropagation()}
        className="w-32"
        disabled={!isLoaded}
      />
    </div>
  );
}