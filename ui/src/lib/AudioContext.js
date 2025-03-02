'use client';
import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Howl } from 'howler';

const AudioContext = createContext();

export function AudioProvider({ children }) {
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [playlist, setPlaylist] = useState([]); // Dynamic playlist
  const [currentIndex, setCurrentIndex] = useState(-1); // Index in playlist
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
        onend: () => playNext(),
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

  const playTrack = (track, sourcePlaylist = []) => {
    const existingIndex = playlist.findIndex(t => t.id === track.id);
    if (existingIndex >= 0) {
      // Track already in playlist—play it
      setCurrentIndex(existingIndex);
      setCurrentTrack(playlist[existingIndex]);
      setIsPlaying(true);
    } else {
      // Add to playlist and play
      const newPlaylist = [...playlist, track];
      setPlaylist(newPlaylist);
      setCurrentIndex(newPlaylist.length - 1);
      setCurrentTrack(track);
      setIsPlaying(true);
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

  const playNext = () => {
    if (playlist.length === 0 || currentIndex < 0) return;
    const nextIndex = (currentIndex + 1) % playlist.length; // Loop to start
    setCurrentIndex(nextIndex);
    setCurrentTrack(playlist[nextIndex]);
    setIsPlaying(true);
  };

  const playPrevious = () => {
    if (playlist.length === 0 || currentIndex < 0) return;
    const prevIndex = currentIndex === 0 ? playlist.length - 1 : currentIndex - 1;
    setCurrentIndex(prevIndex);
    setCurrentTrack(playlist[prevIndex]);
    setIsPlaying(true);
  };

  return (
    <AudioContext.Provider value={{ currentTrack, isPlaying, progress, playlist, currentIndex, playTrack, togglePlayPause, seek, playNext, playPrevious }}>
      {children}
    </AudioContext.Provider>
  );
}

export function useAudio() {
  return useContext(AudioContext);
}