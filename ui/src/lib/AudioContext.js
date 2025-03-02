'use client';
import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Howl } from 'howler';

const AudioContext = createContext();

export function AudioProvider({ children }) {
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [playlist, setPlaylist] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
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
        onend: () => {
          console.log('Track ended, playing next');
          playNext();
        },
        onseek: () => updateProgress(),
      });
      if (isPlaying) {
        console.log('Starting playback:', currentTrack.title);
        soundRef.current.play();
      }
    }

    const interval = setInterval(() => {
      if (isPlaying && soundRef.current) updateProgress();
    }, 1000);

    return () => {
      if (soundRef.current) soundRef.current.unload();
      clearInterval(interval);
    };
  }, [currentTrack]); // Only trigger on currentTrack change

  useEffect(() => {
    // Sync isPlaying with Howl state
    if (soundRef.current) {
      if (isPlaying && !soundRef.current.playing()) {
        soundRef.current.play();
      } else if (!isPlaying && soundRef.current.playing()) {
        soundRef.current.pause();
      }
    }
  }, [isPlaying]); // Sync whenever isPlaying changes

  const updateProgress = () => {
    if (soundRef.current) {
      const pos = soundRef.current.seek();
      const dur = soundRef.current.duration();
      setProgress((pos / dur) * 100 || 0);
    }
  };

  const playTrack = (track, tracksToAdd = []) => {
    console.log('Playing track:', track.title, 'with tracks to add:', tracksToAdd.map(t => t.title));
    const newPlaylist = [track, ...tracksToAdd];
    setPlaylist(newPlaylist);
    setCurrentIndex(0);
    setCurrentTrack(track);
    setIsPlaying(true);
  };

  const togglePlayPause = () => {
    if (soundRef.current) {
      if (isPlaying) {
        soundRef.current.pause();
        setIsPlaying(false);
      } else {
        soundRef.current.play();
        setIsPlaying(true);
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
    if (playlist.length === 0 || currentIndex < 0 || currentIndex >= playlist.length - 1) return;
    const nextIndex = currentIndex + 1;
    console.log('Next track:', playlist[nextIndex].title);
    setCurrentIndex(nextIndex);
    setCurrentTrack(playlist[nextIndex]);
    setIsPlaying(true);
  };

  const playPrevious = () => {
    if (playlist.length === 0 || currentIndex <= 0) return;
    const prevIndex = currentIndex - 1;
    console.log('Previous track:', playlist[prevIndex].title);
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