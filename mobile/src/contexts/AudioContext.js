import React, { createContext, useContext, useState, useRef, useEffect } from 'react';

// Temporarily disabled native modules for Expo Go compatibility
// import AudioRecorderPlayer from 'react-native-audio-recorder-player';
// import TrackPlayer from 'react-native-track-player';

// Temporary constants until shared package is resolved
const AUDIO_CONSTANTS = {
  MAX_RECORDING_DURATION: 90,
  DEFAULT_BPM: 120,
};

const AudioContext = createContext({});

export const useAudio = () => useContext(AudioContext);

export const AudioProvider = ({ children }) => {
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);
  
  // const audioRecorderPlayer = useRef(new AudioRecorderPlayer()).current;

  const startRecording = async () => {
    try {
      // Temporarily disabled for Expo Go compatibility
      console.log('Recording started (simulated)');
      setIsRecording(true);
      setRecordingTime(0);
      return 'simulated_recording.mp4';
    } catch (error) {
      console.error('Failed to start recording:', error);
      throw error;
    }
  };

  const stopRecording = async () => {
    try {
      // Temporarily disabled for Expo Go compatibility
      console.log('Recording stopped (simulated)');
      setIsRecording(false);
      setRecordingTime(0);
      return 'simulated_recording.mp4';
    } catch (error) {
      console.error('Failed to stop recording:', error);
      throw error;
    }
  };

  const startPlayback = async (uri) => {
    try {
      // Temporarily disabled for Expo Go compatibility
      console.log('Playback started (simulated):', uri);
      setIsPlaying(true);
    } catch (error) {
      console.error('Failed to start playback:', error);
      throw error;
    }
  };

  const stopPlayback = async () => {
    try {
      // Temporarily disabled for Expo Go compatibility
      console.log('Playback stopped (simulated)');
      setIsPlaying(false);
      setPlaybackTime(0);
    } catch (error) {
      console.error('Failed to stop playback:', error);
    }
  };

  const pausePlayback = async () => {
    try {
      // Temporarily disabled for Expo Go compatibility
      console.log('Playback paused (simulated)');
      setIsPlaying(false);
    } catch (error) {
      console.error('Failed to pause playback:', error);
    }
  };

  const resumePlayback = async () => {
    try {
      // Temporarily disabled for Expo Go compatibility
      console.log('Playback resumed (simulated)');
      setIsPlaying(true);
    } catch (error) {
      console.error('Failed to resume playback:', error);
    }
  };

  const seekTo = async (position) => {
    try {
      // Temporarily disabled for Expo Go compatibility
      console.log('Seek to position (simulated):', position);
    } catch (error) {
      console.error('Failed to seek:', error);
    }
  };

  const setTrack = (track) => {
    setCurrentTrack(track);
  };

  // Update recording time
  useEffect(() => {
    let interval;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= AUDIO_CONSTANTS.MAX_RECORDING_DURATION) {
            stopRecording(); // Auto-stop at limit
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  // Track playback progress
  useEffect(() => {
    let interval;
    if (isPlaying) {
      interval = setInterval(async () => {
        try {
          const position = await TrackPlayer.getPosition();
          const duration = await TrackPlayer.getDuration();
          setPlaybackTime(position);
          setPlaybackDuration(duration);
        } catch (error) {
          console.error('Failed to get playback position:', error);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isRecording) {
        stopRecording();
      }
      if (isPlaying) {
        stopPlayback();
      }
    };
  }, []);

  return (
    <AudioContext.Provider value={{
      currentTrack,
      setTrack,
      isPlaying,
      isRecording,
      recordingTime,
      playbackTime,
      playbackDuration,
      startRecording,
      stopRecording,
      startPlayback,
      stopPlayback,
      pausePlayback,
      resumePlayback,
      seekTo,
    }}>
      {children}
    </AudioContext.Provider>
  );
}; 