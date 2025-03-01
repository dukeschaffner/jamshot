'use client';
import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Howl } from 'howler';

const AudioContext = createContext();

export function AudioProvider({ children }) {
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const soundRef = useRef(null);

  useEffect(() => {
    if (currentTrack) {
      if (soundRef.current) soundRef.current.unload();
      soundRef.current = new Howl({
        src: [currentTrack.combined_audio_url],
        html5: true,
        onload: () => console.log('Global audio loaded:', currentTrack.title),
        onplay: () => setIsPlaying(true),
        onpause: () => setIsPlaying(false),
        onend: () => setIsPlaying(false),
        onseek: () => updateProgress(),
      });
      if (isPlaying) soundRef.current.play();
    }

    const interval = setInterval(() => {
      if (isPlaying && soundRef.current) updateProgress();
    }, 1000);

    return () => {
      if (soundRef.current) soundRef.current.unload();
      clearInterval(interval);
    };
  }, [currentTrack]);

  const updateProgress = () => {
    if (soundRef.current) {
      const pos = soundRef.current.seek();
      const dur = soundRef.current.duration();
      setProgress((pos / dur) * 100 || 0);
    }
  };

  const playTrack = (track) => {
    if (currentTrack?.id !== track.id) {
      setCurrentTrack(track);
      setIsPlaying(true);
    } else {
      togglePlayPause();
    }
  };

  const togglePlayPause = () => {
    if (soundRef.current) {
      if (isPlaying) {
        soundRef.current.pause();
      } else {
        soundRef.current.play();
      }
    }
  };

  const seek = (percentage) => {
    if (soundRef.current) {
      const newPosition = (percentage / 100) * soundRef.current.duration();
      soundRef.current.seek(newPosition);
      setProgress(percentage);
    }
  };

  return (
    <AudioContext.Provider value={{ currentTrack, isPlaying, progress, playTrack, togglePlayPause, seek }}>
      {children}
    </AudioContext.Provider>
  );
}

export function useAudio() {
  return useContext(AudioContext);
}