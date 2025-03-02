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
  const [isShuffleOn, setIsShuffleOn] = useState(false);
  const [isLoopOn, setIsLoopOn] = useState(false);
  const soundRef = useRef(null);
  const shuffledIndicesRef = useRef([]);
  const currentPositionRef = useRef(0);

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
      if (isPlaying && soundRef.current) updateProgress();
    }, 1000);

    return () => {
      if (soundRef.current) soundRef.current.unload();
      clearInterval(interval);
    };
  }, [currentTrack]); // Only trigger on currentTrack change

  // Handle track end based on loop state
  const handleTrackEnd = () => {
    if (isLoopOn && playlist.length === 1) {
      // If loop is on and there's only one track, replay it
      soundRef.current.play();
    } else {
      playNext();
    }
  };

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
    if (playlist.length === 0 || currentIndex < 0) return;
    
    let nextIndex;
    
    if (isShuffleOn) {
      // Find the current position in the shuffled array
      const currentPosition = shuffledIndicesRef.current.indexOf(currentIndex);
      // Get the next position, or loop back to the beginning
      const nextPosition = (currentPosition + 1) % shuffledIndicesRef.current.length;
      nextIndex = shuffledIndicesRef.current[nextPosition];
    } else {
      // Regular sequential play
      if (currentIndex >= playlist.length - 1) {
        if (isLoopOn) {
          // Loop back to the beginning if loop is on
          nextIndex = 0;
        } else {
          return; // End of playlist and no loop
        }
      } else {
        nextIndex = currentIndex + 1;
      }
    }
    
    console.log('Next track:', playlist[nextIndex].title);
    setCurrentIndex(nextIndex);
    setCurrentTrack(playlist[nextIndex]);
    setIsPlaying(true);
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