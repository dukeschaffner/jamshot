'use client';
import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Howl } from 'howler';
import api from './api';

const AudioContext = createContext();

export function AudioProvider({ children }) {
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // Progress in seconds
  const [playlist, setPlaylist] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isShuffleOn, setIsShuffleOn] = useState(false);
  const [isLoopOn, setIsLoopOn] = useState(false);
  const soundRef = useRef(null);
  const shuffledIndicesRef = useRef([]);
  const currentPositionRef = useRef(0);
  // Refs for play counter
  const listeningTimeRef = useRef(0);
  const playRecordedRef = useRef(false);

  // Define functions with useCallback to prevent unnecessary re-creation
  const updateListeningTime = useCallback(() => {
    if (isPlaying && soundRef.current && !playRecordedRef.current) {
      listeningTimeRef.current += 1; // Add one second
    }
  }, [isPlaying]);

  // Define playNext function before it's used in handleTrackEnd
  const playNext = useCallback(() => {
    if (playlist.length === 0) return;
    
    let nextIndex;
    
    if (isShuffleOn) {
      // Get the next shuffled index
      const currentShuffleIndex = shuffledIndicesRef.current.indexOf(currentIndex);
      const nextShuffleIndex = (currentShuffleIndex + 1) % playlist.length;
      nextIndex = shuffledIndicesRef.current[nextShuffleIndex];
    } else {
      // Normal sequential playback
      nextIndex = (currentIndex + 1) % playlist.length;
    }
    
    setCurrentIndex(nextIndex);
    setCurrentTrack(playlist[nextIndex]);
  }, [playlist, currentIndex, isShuffleOn]);

  // Handle track end based on loop state
  const handleTrackEnd = useCallback(() => {
    if (isLoopOn && playlist.length === 1) {
      // If loop is on and there's only one track, replay it
      soundRef.current.play();
      // Reset play counter state for looped track
      listeningTimeRef.current = 0;
      playRecordedRef.current = false;
    } else {
      playNext();
    }
  }, [isLoopOn, playlist.length, playNext]);

  // Check and record play based on listening criteria
  const checkAndRecordPlay = useCallback(() => {
    if (!currentTrack || playRecordedRef.current) return;
    
    const duration = soundRef.current?.duration() || 0;
    const threshold = duration < 30 ? duration * 0.9 : 30;
    
    // Record play if:
    // 1. User listened to at least 30 seconds, OR
    // 2. For tracks < 30 seconds, user listened to at least 90% of the track
    if (listeningTimeRef.current >= threshold) {
      recordPlay();
    }
  }, [currentTrack]);

  // Record a play via API
  const recordPlay = async () => {
    if (!currentTrack || playRecordedRef.current) return;
    
    try {
      playRecordedRef.current = true;
      console.log(`Recording play for track: ${currentTrack.title}`);
      await api.post(`/tracks/${currentTrack.id}/play`);
    } catch (err) {
      console.error('Failed to record play:', err);
    }
  };

  // Now use these callbacks in the useEffect
  useEffect(() => {
    if (!currentTrack) return;
    
    // Reset play counter state for new track
    listeningTimeRef.current = 0;
    playRecordedRef.current = false;
    
    // Set up interval to track listening time and check for play recording
    const interval = setInterval(() => {
      updateListeningTime();
      checkAndRecordPlay();
    }, 1000);
    
    return () => {
      if (soundRef.current) soundRef.current.unload();
      clearInterval(interval);
    };
  }, [currentTrack, updateListeningTime, checkAndRecordPlay]);

  useEffect(() => {
    if (currentTrack) {
      if (soundRef.current) {
        // Save current position before unloading
        if (soundRef.current.playing()) {
          currentPositionRef.current = soundRef.current.seek();
        }
        soundRef.current.unload();
      }
      
      soundRef.current = new Howl({
        src: [currentTrack.combined_audio_url],
        html5: true,
        onload: () => console.log('Global audio loaded:', currentTrack.title),
        onplay: () => setIsPlaying(true),
        onpause: () => setIsPlaying(false),
        onend: () => {
          console.log('Track ended, playing next');
          handleTrackEnd();
        },
        onseek: () => updateProgress(),
      });
      
      if (isPlaying) {
        console.log('Starting playback:', currentTrack.title);
        soundRef.current.play();
      }
    }

    const interval = setInterval(() => {
      if (isPlaying && soundRef.current) {
        updateProgress();
        updateListeningTime();
      }
    }, 1000);

    return () => {
      if (soundRef.current) soundRef.current.unload();
      clearInterval(interval);
    };
  }, [currentTrack, handleTrackEnd, isPlaying, updateListeningTime]);

  // Generate shuffled indices when playlist or shuffle state changes
  useEffect(() => {
    if (isShuffleOn && playlist.length > 0) {
      const indices = Array.from({ length: playlist.length }, (_, i) => i);
      // Fisher-Yates shuffle algorithm
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      // Ensure current track is first in the shuffled order
      if (currentIndex >= 0) {
        const currentIndexPosition = indices.indexOf(currentIndex);
        if (currentIndexPosition > 0) {
          [indices[0], indices[currentIndexPosition]] = [indices[currentIndexPosition], indices[0]];
        }
      }
      shuffledIndicesRef.current = indices;
    } else {
      shuffledIndicesRef.current = [];
    }
  }, [playlist, isShuffleOn, currentIndex]);

  const updateProgress = () => {
    if (soundRef.current) {
      const pos = soundRef.current.seek();
      setProgress(pos || 0);
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
      setProgress(newPosition);
    }
  };

  const playPrevious = () => {
    if (playlist.length === 0 || currentIndex < 0) return;
    
    let prevIndex;
    
    if (isShuffleOn) {
      // Find the current position in the shuffled array
      const currentPosition = shuffledIndicesRef.current.indexOf(currentIndex);
      // Get the previous position, or loop to the end
      const prevPosition = (currentPosition - 1 + shuffledIndicesRef.current.length) % shuffledIndicesRef.current.length;
      prevIndex = shuffledIndicesRef.current[prevPosition];
    } else {
      // Regular sequential play
      if (currentIndex <= 0) {
        if (isLoopOn) {
          // Loop to the end if loop is on
          prevIndex = playlist.length - 1;
        } else {
          return; // Beginning of playlist and no loop
        }
      } else {
        prevIndex = currentIndex - 1;
      }
    }
    
    console.log('Previous track:', playlist[prevIndex].title);
    setCurrentIndex(prevIndex);
    setCurrentTrack(playlist[prevIndex]);
    setIsPlaying(true);
  };

  const toggleShuffle = () => {
    setIsShuffleOn(!isShuffleOn);
  };

  const toggleLoop = () => {
    setIsLoopOn(!isLoopOn);
  };

  return (
    <AudioContext.Provider 
      value={{ 
        currentTrack, 
        isPlaying, 
        progress, 
        playlist, 
        currentIndex, 
        isShuffleOn,
        isLoopOn,
        playTrack, 
        togglePlayPause, 
        seek, 
        playNext, 
        playPrevious,
        toggleShuffle,
        toggleLoop
      }}
    >
      {children}
    </AudioContext.Provider>
  );
}

export function useAudio() {
  return useContext(AudioContext);
}