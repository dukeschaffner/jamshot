import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Audio } from 'expo-av';
import apiMethods from '../lib/api';

const AudioContext = createContext();

export function AudioProvider({ children }) {
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // Progress in seconds
  const [playlist, setPlaylist] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isShuffleOn, setIsShuffleOn] = useState(false);
  const [isLoopOn, setIsLoopOn] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const soundRef = useRef(null);
  const shuffledIndicesRef = useRef([]);
  const loadedTrackIdRef = useRef(null);
  const handleTrackEndRef = useRef(null);

  // Refs for play counter and analytics
  const listeningTimeRef = useRef(0);
  const playRecordedRef = useRef(false);
  const playIdRef = useRef(null);
  const thresholdRef = useRef(0);
  const discoveryMethodRef = useRef('unknown');
  const progressIntervalRef = useRef(null);
  const listeningTimeIntervalRef = useRef(null);

  const api = apiMethods.api;

  // Update listening time
  const updateListeningTime = useCallback(() => {
    if (isPlaying && soundRef.current) {
      listeningTimeRef.current += 1;
    }
  }, [isPlaying]);

  // Define playNext function
  const playNext = useCallback((skipped = true) => {
    updatePlay(skipped);
    
    if (playlist.length === 0) return;
    
    let nextIndex;
    
    if (isShuffleOn) {
      const currentShuffleIndex = shuffledIndicesRef.current.indexOf(currentIndex);
      const nextShuffleIndex = (currentShuffleIndex + 1) % playlist.length;
      nextIndex = shuffledIndicesRef.current[nextShuffleIndex];
    } else {
      nextIndex = (currentIndex + 1) % playlist.length;
    }
    
    setCurrentIndex(nextIndex);
    setCurrentTrack(playlist[nextIndex]);
  }, [playlist, currentIndex, isShuffleOn]);

  // Handle track end based on loop state
  const handleTrackEnd = useCallback(async () => {
    if (isLoopOn) {
      updatePlay();
      if (soundRef.current) {
        await soundRef.current.setPositionAsync(0);
        await soundRef.current.playAsync();
      }
      listeningTimeRef.current = 0;
    } else {
      playNext(false);
    }
  }, [isLoopOn, playNext]);

  // Update the ref whenever handleTrackEnd changes
  useEffect(() => {
    handleTrackEndRef.current = handleTrackEnd;
  }, [handleTrackEnd]);

  // Check and record initial play
  const checkAndRecordPlay = useCallback(async () => {
    if (!currentTrack || playRecordedRef.current) return;
    
    const status = await soundRef.current?.getStatusAsync();
    const duration = status?.durationMillis ? status.durationMillis / 1000 : 0;
    thresholdRef.current = duration < 30 ? duration * 0.9 : 30;
    
    if (listeningTimeRef.current >= thresholdRef.current) {
      recordInitialPlay();
    }
  }, [currentTrack]);

  // Record initial play via API
  const recordInitialPlay = async () => {
    if (!currentTrack || playRecordedRef.current) return;

    console.log('recording initial play');
    
    try {
      playRecordedRef.current = true;
      
      const response = await api.post(`/tracks/${currentTrack.id}/play`, {
        discovery_method: discoveryMethodRef.current,
        referrer_url: null
      }).catch(err => {
        console.error('Failed to record initial play:', err);
        playRecordedRef.current = false;
      });
      
      if (response?.data?.play_id) {
        playIdRef.current = response.data.play_id;
      }
    } catch (err) {
      console.error('Failed to record initial play:', err);
      playRecordedRef.current = false;
    }
  };

  // Update play with final analytics data
  const updatePlay = async (skipped = false) => {
    if (!currentTrack) return;
    if (listeningTimeRef.current < thresholdRef.current) return;

    console.log('updating play');
    
    try {
      const status = await soundRef.current?.getStatusAsync();
      const listenDuration = listeningTimeRef.current;
      const trackDuration = status?.durationMillis ? status.durationMillis / 1000 : 0;
      const isCompletePlay = listenDuration >= trackDuration * 0.98;

      let skipTime = null;
      if (skipped && status) {
        skipTime = status.positionMillis ? status.positionMillis / 1000 : null;
      }

      await api.post(`/tracks/${currentTrack.id}/play`, {
        listen_duration: listenDuration,
        is_complete_play: isCompletePlay,
        skip_time: skipTime,
        play_id: playIdRef.current
      }).catch(err => {
        console.error('Failed to update play:', err);
      });
    } catch (err) {
      console.error('Failed to update play:', err);
    }
  };

  // Interval to check for play recording
  useEffect(() => {
    if (!currentTrack) return;
    
    listeningTimeRef.current = 0;
    playRecordedRef.current = false;
    
    listeningTimeIntervalRef.current = setInterval(() => {
      checkAndRecordPlay();
    }, 1000);
    
    return () => {
      if (listeningTimeIntervalRef.current) {
        clearInterval(listeningTimeIntervalRef.current);
      }
    };
  }, [currentTrack, checkAndRecordPlay]);

  // Cleanup on unmount
  useEffect(() => {
    return async () => {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }
    };
  }, []);

  // Initialize audio player for track
  useEffect(() => {
    let isMounted = true;

    const initializeAudio = async () => {
      if (!currentTrack || currentTrack.id === loadedTrackIdRef.current) return;

      try {
        // Unload previous sound
        if (soundRef.current) {
          await soundRef.current.unloadAsync();
        }

        // Configure audio mode
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
        });

        // Create new sound
        const { sound } = await Audio.Sound.createAsync(
          { uri: currentTrack.combined_audio_url },
          { shouldPlay: isPlaying },
          (status) => {
            if (status.didJustFinish) {
              handleTrackEndRef.current();
            }
          }
        );

        if (isMounted) {
          soundRef.current = sound;
          loadedTrackIdRef.current = currentTrack.id;
        } else {
          await sound.unloadAsync();
        }
      } catch (error) {
        console.error('Error loading audio:', error);
      }
    };

    initializeAudio();

    return () => {
      isMounted = false;
    };
  }, [currentTrack]);

  // Update progress interval
  useEffect(() => {
    const updateProgress = async () => {
      if (isPlaying && soundRef.current && !isSeeking) {
        try {
          const status = await soundRef.current.getStatusAsync();
          if (status.isLoaded) {
            setProgress(status.positionMillis / 1000);
          }
        } catch (error) {
          console.error('Error updating progress:', error);
        }
      }
    };

    if (isPlaying) {
      progressIntervalRef.current = setInterval(updateProgress, 50);
      listeningTimeIntervalRef.current = setInterval(() => {
        updateListeningTime();
      }, 1000);
    }

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      if (listeningTimeIntervalRef.current) {
        clearInterval(listeningTimeIntervalRef.current);
      }
    };
  }, [isPlaying, isSeeking, updateListeningTime]);

  // Generate shuffled indices when playlist or shuffle state changes
  useEffect(() => {
    if (isShuffleOn && playlist.length > 0) {
      const indices = Array.from({ length: playlist.length }, (_, i) => i);
      // Fisher-Yates shuffle
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      // Ensure current track is first in shuffled order
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

  const playTrack = (track, tracksToAdd = []) => {
    console.log('Playing track:', track.title, 'with tracks to add:', tracksToAdd.map(t => t.title));
    const newPlaylist = [track, ...tracksToAdd];
    updatePlay(true);
    setPlaylist(newPlaylist);
    setCurrentIndex(0);
    setCurrentTrack(track);
    setIsPlaying(true);
  };

  const togglePlayPause = async () => {
    if (soundRef.current) {
      try {
        const status = await soundRef.current.getStatusAsync();
        if (status.isLoaded) {
          if (status.isPlaying) {
            await soundRef.current.pauseAsync();
            setIsPlaying(false);
          } else {
            await soundRef.current.playAsync();
            setIsPlaying(true);
          }
        }
      } catch (error) {
        console.error('Error toggling play/pause:', error);
      }
    }
  };

  const seek = async (position) => {
    if (soundRef.current) {
      try {
        setIsSeeking(true);
        await soundRef.current.setPositionAsync(position * 1000); // expo-av uses milliseconds
        setProgress(position);
        setIsSeeking(false);
        
        if (isPlaying) {
          await soundRef.current.playAsync();
        }
      } catch (error) {
        console.error('Error seeking:', error);
        setIsSeeking(false);
      }
    }
  };

  const playPrevious = async () => {
    if (playlist.length === 0 || currentIndex < 0) return;
    
    try {
      const status = await soundRef.current?.getStatusAsync();
      const currentPosition = status?.positionMillis ? status.positionMillis / 1000 : 0;
      
      if (currentPosition > 2) {
        await soundRef.current.setPositionAsync(0);
        setProgress(0);
        console.log('Returning to start of current track:', currentTrack.title);
        return;
      } else {
        updatePlay();
      }
      
      let prevIndex;
      
      if (isShuffleOn) {
        const currentPosition = shuffledIndicesRef.current.indexOf(currentIndex);
        const prevPosition = (currentPosition - 1 + shuffledIndicesRef.current.length) % shuffledIndicesRef.current.length;
        prevIndex = shuffledIndicesRef.current[prevPosition];
      } else {
        if (currentIndex <= 0) {
          if (isLoopOn) {
            prevIndex = playlist.length - 1;
          } else {
            return;
          }
        } else {
          prevIndex = currentIndex - 1;
        }
      }
      
      console.log('Previous track:', playlist[prevIndex].title);
      setCurrentIndex(prevIndex);
      setCurrentTrack(playlist[prevIndex]);
      setIsPlaying(true);
    } catch (error) {
      console.error('Error playing previous:', error);
    }
  };

  const toggleShuffle = () => {
    setIsShuffleOn(!isShuffleOn);
  };

  const toggleLoop = () => {
    setIsLoopOn(!isLoopOn);
  };

  // Function to set discovery method for analytics
  const setDiscoveryMethod = (method) => {
    discoveryMethodRef.current = method;
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
        setIsSeeking,
        playNext, 
        playPrevious,
        toggleShuffle,
        toggleLoop,
        setDiscoveryMethod
      }}
    >
      {children}
    </AudioContext.Provider>
  );
}

export function useAudio() {
  return useContext(AudioContext);
}

