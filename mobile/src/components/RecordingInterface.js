import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudio } from '../contexts/AudioContext';

import { theme } from '../styles/theme';

// Temporary constants until shared package is resolved
const AUDIO_CONSTANTS = {
  MAX_RECORDING_DURATION: 90,
  DEFAULT_BPM: 120,
};

const RecordingInterface = ({ parentTrack = null, onRecordingComplete }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [metronomeEnabled, setMetronomeEnabled] = useState(false);
  const [bpm, setBpm] = useState(parentTrack?.metronome_bpm || AUDIO_CONSTANTS.DEFAULT_BPM);
  
  const { startRecording, stopRecording, startPlayback } = useAudio();

  const handleRecordPress = async () => {
    if (isRecording) {
      try {
        const recordingPath = await stopRecording();
        setIsRecording(false);
        setRecordingDuration(0);
        
        if (onRecordingComplete) {
          onRecordingComplete(recordingPath);
        }
      } catch (error) {
        Alert.alert('Recording Error', 'Failed to stop recording');
      }
    } else {
      if (recordingDuration >= AUDIO_CONSTANTS.MAX_RECORDING_DURATION) {
        Alert.alert('Recording Limit', 'Maximum recording duration is 90 seconds');
        return;
      }
      
      try {
        await startRecording();
        setIsRecording(true);
      } catch (error) {
        Alert.alert('Recording Error', 'Failed to start recording');
      }
    }
  };

  const playParentTrack = () => {
    if (parentTrack) {
      startPlayback(parentTrack.combined_audio_url);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    let interval;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingDuration(prev => {
          if (prev >= AUDIO_CONSTANTS.MAX_RECORDING_DURATION) {
            handleRecordPress(); // Auto-stop at limit
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  return (
    <View style={styles.container}>
      {parentTrack && (
        <View style={styles.parentTrackSection}>
          <Text style={styles.sectionTitle}>Collaborating on:</Text>
          <View style={styles.parentTrack}>
            <Text style={styles.parentTrackTitle}>{parentTrack.title}</Text>
            <Text style={styles.parentTrackArtist}>by {parentTrack.user?.username}</Text>
            <TouchableOpacity style={styles.playParentButton} onPress={playParentTrack}>
              <Ionicons name="play" size={20} color={theme.colors.textInverse} />
              <Text style={styles.playParentText}>Play Original</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      
      <View style={styles.controlsSection}>
        <Text style={styles.sectionTitle}>Recording Controls</Text>
        
        <View style={styles.metronomeSection}>
          <TouchableOpacity 
            style={[styles.metronomeButton, metronomeEnabled && styles.metronomeActive]}
            onPress={() => setMetronomeEnabled(!metronomeEnabled)}
          >
            <Ionicons 
              name="musical-notes" 
              size={24} 
              color={metronomeEnabled ? theme.colors.textInverse : theme.colors.textSecondary} 
            />
            <Text style={[styles.metronomeText, metronomeEnabled && styles.metronomeTextActive]}>
              Metronome: {bpm} BPM
            </Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.recordingSection}>
          <TouchableOpacity 
            style={[styles.recordButton, isRecording && styles.recordButtonActive]}
            onPress={handleRecordPress}
          >
            <Ionicons 
              name={isRecording ? "stop" : "mic"} 
              size={32} 
              color={theme.colors.textInverse} 
            />
          </TouchableOpacity>
          
          <Text style={styles.recordingDuration}>
            {formatTime(recordingDuration)} / {formatTime(AUDIO_CONSTANTS.MAX_RECORDING_DURATION)}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.backgroundSecondary,
    padding: theme.spacing.md,
  },
  parentTrackSection: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadows.sm,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  parentTrack: {
    alignItems: 'center',
  },
  parentTrackTitle: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.textPrimary,
  },
  parentTrackArtist: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  playParentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
  },
  playParentText: {
    color: theme.colors.textInverse,
    fontWeight: theme.typography.fontWeights.semibold,
    marginLeft: theme.spacing.sm,
  },
  controlsSection: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    ...theme.shadows.sm,
  },
  metronomeSection: {
    marginBottom: theme.spacing.xl,
  },
  metronomeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  metronomeActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  metronomeText: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.md,
  },
  metronomeTextActive: {
    color: theme.colors.textInverse,
  },
  recordingSection: {
    alignItems: 'center',
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  recordButtonActive: {
    backgroundColor: theme.colors.error,
    transform: [{ scale: 1.1 }],
  },
  recordingDuration: {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.textPrimary,
  },
});

export default RecordingInterface; 