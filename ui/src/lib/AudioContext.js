'use client';
import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Howl } from 'howler';
import api, { trackApi } from './api';

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
  const currentPositionRef = useRef(0);
  const loadedTrackIdRef = useRef(null);
  const urlRefreshAttemptedRef = useRef(false); // Track if we've tried refreshing the URL
  const urlRefreshedRef = useRef(false); // Track if we've refreshed the URL
  const handleTrackEndRef = useRef(null); // Ref to store current handleTrackEnd function

  // Refs for play counter and analytics
  const listeningTimeRef = useRef(0);
  const playRecordedRef = useRef(false);
  const playIdRef = useRef(null);
  const thresholdRef = useRef(0); // threshold for recording initial play
  const discoveryMethodRef = useRef('unknown');

  // Used for counting plays
  // Define functions with useCallback to prevent unnecessary re-creation
  const updateListeningTime = useCallback(() => {
    if (isPlaying && soundRef.current) {
      listeningTimeRef.current += 1; // Add one second
    }
  }, [isPlaying]);

  // Define playNext function before it's used in handleTrackEnd
  const playNext = useCallback((skipped = true) => {    
    // Update play analytics before skipping to next
    updatePlay(skipped);
    
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
    if (isLoopOn) {
      updatePlay();

      // If loop is on, replay the current track
      soundRef.current.play();
      // Reset play counter state for looped track
      listeningTimeRef.current = 0;
    } else {
      playNext(false);
    }
  }, [isLoopOn, playNext]);

  // Update the ref whenever handleTrackEnd changes
  useEffect(() => {
    handleTrackEndRef.current = handleTrackEnd;
  }, [handleTrackEnd]);

  // Check and record initial play based on listening criteria
  const checkAndRecordPlay = useCallback(() => {
    if (!currentTrack || playRecordedRef.current) return;
    
    const duration = soundRef.current?.duration() || 0;
    thresholdRef.current = duration < 30 ? duration * 0.9 : 30;
    
    // Record initial play if:
    // 1. User listened to at least 30 seconds, OR
    // 2. For tracks < 30 seconds, user listened to at least 90% of the track
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
      
      // Get referrer URL for discovery method
      const referrerUrl = document.referrer || null;
      
      const response = await api.post(`/tracks/${currentTrack.id}/play`, {
        discovery_method: discoveryMethodRef.current,
        referrer_url: referrerUrl
      }).catch(err => {
        console.error('Failed to record initial play:', err);
        // Reset the flag so we can try again later if needed
        playRecordedRef.current = false;
      });
      playIdRef.current = response.data.play_id;

    } catch (err) {
      console.error('Failed to record initial play:', err);
      // Reset the flag so we can try again later if needed
      playRecordedRef.current = false;
    }
  };

  // Update play with final analytics data
  const updatePlay = async (skipped = false) => {
    if (!currentTrack) return;
    if (listeningTimeRef.current < thresholdRef.current) return;

    console.log('updating play');
    
    try {
      // Calculate final analytics data
      const listenDuration = listeningTimeRef.current;
      const trackDuration = soundRef.current?.duration() || 0;
      const isCompletePlay = listenDuration >= trackDuration * 0.98;

      let skipTime = null;
      if(skipped){
        skipTime = soundRef.current.seek();
      }

      api.post(`/tracks/${currentTrack.id}/play`, {
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

  // interval to check for play recording and track analytics
  useEffect(() => {
    if (!currentTrack) return;
    
    // Reset analytics state for new track
    listeningTimeRef.current = 0;
    playRecordedRef.current = false;
    
    // Set up interval to track listening time and check for play recording
    const interval = setInterval(() => {
      checkAndRecordPlay();
    }, 1000);
    
    return () => {
      if (soundRef.current) soundRef.current.unload();
      clearInterval(interval);
    };
  }, [currentTrack, checkAndRecordPlay]);

  useEffect(() => {
    return () => {
      if (soundRef.current) soundRef.current.unload();
    };
  }, []);

  // Function to refresh track URL and replay
  const handleExpiredUrl = useCallback(async () => {
    return;
    if (!currentTrack || urlRefreshAttemptedRef.current) return;
    
    console.log('Track URL might be expired, attempting to refresh URL for:', currentTrack.id);
    urlRefreshAttemptedRef.current = true;
    
    try {
      // Get a fresh URL, passing along secret token if available
      const response = await trackApi.refreshTrackUrl(
        currentTrack.id, 
        currentTrack.secret_token || null
      );
      const refreshedUrls = response.data;
      
      // Update the track with the fresh URL
      const updatedTrack = {
        ...currentTrack,
        combined_audio_url: refreshedUrls.combined_audio_url,
        audio_url: refreshedUrls.audio_url
      };
      
      // Replace the current track with updated URLs
      setCurrentTrack(updatedTrack);
      urlRefreshedRef.current = true;
      
      console.log('Successfully refreshed URL, trying playback again');
    } catch (err) {
      console.error('Failed to refresh track URL:', err);
    }
  }, [currentTrack]);

  // useEffect to initialize the audio player for track
  useEffect(() => {
    if (currentTrack && ((currentTrack.id !== loadedTrackIdRef.current) || urlRefreshedRef.current)) { // only initialize the audio if the track has changed
      if (soundRef.current) {
        // Save current position before unloading
        if (soundRef.current.playing()) {
          currentPositionRef.current = soundRef.current.seek();
        }
        soundRef.current.unload();
      }

      // If we've refreshed the URL, reset the flag
      if (urlRefreshedRef.current) {
        urlRefreshedRef.current = false;
      }

      // Reset URL refresh attempt flag for new track
      urlRefreshAttemptedRef.current = false;
      
      soundRef.current = new Howl({
        src: [currentTrack.combined_audio_url],
        html5: true,
        onload: () => console.log('Global audio loaded:', currentTrack.title),
        onloaderror: (id, error) => {
          console.error('Error loading audio:', error);
          handleExpiredUrl();
        },
        onplayerror: (id, error) => {
          console.error('Error playing audio:', error);
          handleExpiredUrl();
        },
        onend: () => {
          console.log('Track ended, playing next');
          handleTrackEndRef.current();
        },
        onseek: () => updateProgress(),
      });

      loadedTrackIdRef.current = currentTrack.id;

      if (isPlaying) {
        console.log('Starting playback:', currentTrack.title);
        soundRef.current.play();
      }
    }

    const listeningTimeInterval = setInterval(() => {
      if (isPlaying && soundRef.current) {
        updateListeningTime();
      }
    }, 1000);

    const progressInterval = setInterval(() => {
      if (isPlaying && soundRef.current) {
        updateProgress();
      }
    }, 50);

    return () => {
      clearInterval(listeningTimeInterval);
      clearInterval(progressInterval);
    };
  }, [currentTrack, isPlaying, handleTrackEnd, updateListeningTime, handleExpiredUrl]);

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
    // Ensure tracksToAdd is always an array
    const tracksArray = Array.isArray(tracksToAdd) ? tracksToAdd : [];
    console.log('Playing track:', track.title, 'with tracks to add:', tracksArray.map(t => t.title));
    const newPlaylist = [track, ...tracksArray];
    updatePlay(true); // skip is true because we are playing a new track
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

  // useEffect to pause the audio when the user starts seeking
  useEffect(() => {
    if (isSeeking) {
      soundRef.current.pause();
      setIsSeeking(false);
    }
  }, [isSeeking]);

  const seek = (position) => {
    if (soundRef.current) {
      // position is now directly in seconds
      soundRef.current.seek(position);
      console.log('Seeking to:', position);
      if (isSeeking) {
        if (isPlaying) {
          soundRef.current.play();
        }
        setIsSeeking(false);
      }
      setProgress(position);
    }
  };

  const playPrevious = () => {
    if (playlist.length === 0 || currentIndex < 0) return;
    
    // Check if we're more than 2 seconds into the current track
    if (soundRef.current && soundRef.current.seek() > 2) {
      // If so, just go back to the beginning of the current track
      soundRef.current.seek(0);
      setProgress(0);
      console.log('Returning to start of current track:', currentTrack.title);
      return;
    }
    else{
      updatePlay(); // going to previous track so record the play
    }
    
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