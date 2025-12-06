/**
 * DAW Screen
 * 
 * Fullscreen DAW interface using the JamShot Audio native module
 * powered by Tracktion Engine.
 */

import { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import { colors } from '../styles/global';

// Import the Tracktion Engine native module
import JamShotAudio from '../native/js/JamShotAudio';

export default function DAWScreen() {
  const router = useRouter();
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(null);
  const [engineReady, setEngineReady] = useState(false);
  const [trackId, setTrackId] = useState(null);
  const [clipId, setClipId] = useState(null);
  
  const unsubscribeRefs = useRef([]);

  // Initialize audio engine
  useEffect(() => {
    initializeAudio();
    
    return () => {
      cleanupAudio();
    };
  }, []);

  const initializeAudio = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Step 1: Initialize the Tracktion Engine
      console.log('Initializing Tracktion Engine...');
      await JamShotAudio.initialize();
      setEngineReady(true);
      
      // Step 2: Create a new project
      console.log('Creating new project...');
      await JamShotAudio.createNewProject();
      
      // Step 3: Get the audio file path
      // We need to copy the bundled asset to a location accessible by the native module
      console.log('Loading audio asset...');
      const audioAsset = Asset.fromModule(require('../assets/audio/test.mp3'));
      await audioAsset.downloadAsync();
      
      let audioFilePath = audioAsset.localUri;
      
      // On iOS, we might need to copy to documents directory
      if (Platform.OS === 'ios' && audioAsset.localUri) {
        const fileName = 'test.mp3';
        const destPath = `${FileSystem.documentDirectory}${fileName}`;
        
        // Check if file already exists
        const fileInfo = await FileSystem.getInfoAsync(destPath);
        if (!fileInfo.exists) {
          await FileSystem.copyAsync({
            from: audioAsset.localUri,
            to: destPath,
          });
        }
        audioFilePath = destPath;
      }
      
      console.log('Audio file path:', audioFilePath);
      
      // Step 4: Get existing tracks or add one
      const tracks = await JamShotAudio.getTracks();
      let currentTrackId;
      
      if (tracks && tracks.length > 0) {
        currentTrackId = tracks[0].id;
      } else {
        const result = await JamShotAudio.addTrack('Track 1');
        currentTrackId = result.trackId;
      }
      setTrackId(currentTrackId);
      
      // Step 5: Add the audio clip to the track
      console.log('Adding clip to track...');
      const clipResult = await JamShotAudio.addClip(currentTrackId, audioFilePath, 0);
      setClipId(clipResult.clipId);
      
      // Step 6: Get duration
      const dur = await JamShotAudio.getDuration();
      setDuration(dur);
      
      // Step 7: Set up event listeners
      const unsubPosition = JamShotAudio.onPositionUpdate((pos) => {
        setPosition(pos);
      });
      unsubscribeRefs.current.push(unsubPosition);
      
      const unsubState = JamShotAudio.onStateChange((playing) => {
        setIsPlaying(playing);
      });
      unsubscribeRefs.current.push(unsubState);
      
      const unsubError = JamShotAudio.onError((err) => {
        console.error('Audio engine error:', err);
        setError(err);
      });
      unsubscribeRefs.current.push(unsubError);
      
      setIsInitialized(true);
      setIsLoading(false);
      console.log('Tracktion Engine initialized successfully!');

    } catch (err) {
      console.error('Failed to initialize Tracktion Engine:', err);
      setError(`Failed to initialize: ${err.message || err}`);
      setIsLoading(false);
    }
  };

  const cleanupAudio = async () => {
    // Unsubscribe from all events
    unsubscribeRefs.current.forEach(unsub => {
      if (typeof unsub === 'function') unsub();
    });
    unsubscribeRefs.current = [];
    
    // Shutdown the engine
    try {
      await JamShotAudio.shutdown();
    } catch (err) {
      console.error('Error shutting down audio:', err);
    }
  };

  const handlePlayPause = async () => {
    try {
      if (isPlaying) {
        JamShotAudio.pause();
      } else {
        JamShotAudio.play();
      }
    } catch (err) {
      console.error('Playback error:', err);
      setError('Playback error');
    }
  };

  const handleStop = () => {
    try {
      JamShotAudio.stop();
      setPosition(0);
    } catch (err) {
      console.error('Stop error:', err);
    }
  };

  const handleSeek = (newPosition) => {
    try {
      JamShotAudio.seek(newPosition);
      setPosition(newPosition);
    } catch (err) {
      console.error('Seek error:', err);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleClose = () => {
    router.back();
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.seafoam} />
          <Text style={styles.loadingText}>Initializing Tracktion Engine...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="warning" size={48} color={colors.red} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={initializeAudio}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <SafeAreaView edges={['top']} style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleClose}>
          <Ionicons name="close" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>DAW</Text>
        <View style={styles.headerSpacer} />
      </SafeAreaView>

      {/* Main Content */}
      <View style={styles.content}>
        {/* Track Info */}
        <View style={styles.trackInfo}>
          <View style={styles.trackIcon}>
            <Ionicons name="musical-notes" size={32} color={colors.seafoam} />
          </View>
          <Text style={styles.trackName}>test.mp3</Text>
          <Text style={styles.trackStatus}>
            {isInitialized ? 'Tracktion Engine Ready' : 'Not loaded'}
          </Text>
        </View>

        {/* Waveform Placeholder */}
        <View style={styles.waveformContainer}>
          <View style={styles.waveformPlaceholder}>
            {/* Simple progress bar as waveform placeholder */}
            <View 
              style={[
                styles.waveformProgress, 
                { width: `${duration > 0 ? (position / duration) * 100 : 0}%` }
              ]} 
            />
          </View>
        </View>

        {/* Time Display */}
        <View style={styles.timeDisplay}>
          <Text style={styles.timeText}>{formatTime(position)}</Text>
          <Text style={styles.timeSeparator}>/</Text>
          <Text style={styles.timeText}>{formatTime(duration)}</Text>
        </View>

        {/* Transport Controls */}
        <View style={styles.transportControls}>
          {/* Rewind */}
          <TouchableOpacity 
            style={styles.transportButton} 
            onPress={() => handleSeek(0)}
          >
            <Ionicons name="play-skip-back" size={32} color={colors.textPrimary} />
          </TouchableOpacity>

          {/* Play/Pause */}
          <TouchableOpacity 
            style={styles.playButton} 
            onPress={handlePlayPause}
          >
            <Ionicons 
              name={isPlaying ? "pause" : "play"} 
              size={48} 
              color={colors.white} 
            />
          </TouchableOpacity>

          {/* Stop */}
          <TouchableOpacity 
            style={styles.transportButton} 
            onPress={handleStop}
          >
            <Ionicons name="stop" size={32} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Engine Status */}
        <View style={styles.statusContainer}>
          <View style={[styles.statusDot, engineReady && styles.statusDotActive]} />
          <Text style={styles.statusText}>
            Tracktion Engine ({Platform.OS === 'ios' ? 'iOS' : 'Android'})
          </Text>
        </View>
        
        {/* Debug Info */}
        {trackId && (
          <Text style={styles.debugText}>
            Track ID: {trackId} | Clip ID: {clipId}
          </Text>
        )}
      </View>

      {/* Footer */}
      <SafeAreaView edges={['bottom']} style={styles.footer}>
        <Text style={styles.footerText}>
          Powered by Tracktion Engine
        </Text>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  
  // Loading & Error states
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  errorText: {
    color: colors.red,
    fontSize: 16,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: colors.seafoam,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 24,
  },
  retryButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  closeButton: {
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  closeButtonText: {
    color: colors.textSecondary,
    fontSize: 16,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a2e',
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.white,
    letterSpacing: 2,
  },
  headerSpacer: {
    width: 44,
  },

  // Content
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 32,
  },

  // Track Info
  trackInfo: {
    alignItems: 'center',
    gap: 8,
  },
  trackIcon: {
    width: 80,
    height: 80,
    borderRadius: 16,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  trackName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.white,
  },
  trackStatus: {
    fontSize: 14,
    color: colors.seafoam,
  },

  // Waveform
  waveformContainer: {
    width: '100%',
    paddingHorizontal: 16,
  },
  waveformPlaceholder: {
    height: 64,
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    overflow: 'hidden',
  },
  waveformProgress: {
    height: '100%',
    backgroundColor: colors.seafoam + '40',
  },

  // Time Display
  timeDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeText: {
    fontSize: 32,
    fontWeight: '300',
    color: colors.white,
    fontVariant: ['tabular-nums'],
  },
  timeSeparator: {
    fontSize: 24,
    color: colors.textSecondary,
  },

  // Transport Controls
  transportControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 32,
  },
  transportButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.seafoam,
    justifyContent: 'center',
    alignItems: 'center',
    // Add slight offset for play icon visual centering
    paddingLeft: 4,
  },

  // Status
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.grey3,
  },
  statusDotActive: {
    backgroundColor: colors.seafoam,
  },
  statusText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  debugText: {
    fontSize: 10,
    color: colors.grey3,
    marginTop: 8,
  },

  // Footer
  footer: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 11,
    color: colors.grey3,
    textAlign: 'center',
  },
});
