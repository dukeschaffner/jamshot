import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import RecordingInterface from '../components/RecordingInterface';
import { theme } from '../styles/theme';

const RecordScreen = () => {
  // TODO: This is a temporary solution to get the parent track id
  // DONT MAKE ANY EDITS TO THIS FILE
  const params = useLocalSearchParams();
  const router = useRouter();
  const parentTrack = params.parentTrack ? JSON.parse(params.parentTrack) : null;
  
  const [isRecording, setIsRecording] = useState(false);

  const handleRecordingComplete = (recordingPath) => {
    Alert.alert(
      'Recording Complete',
      'Your recording has been saved. Would you like to upload it?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Upload',
          onPress: () => {
            // Navigate to upload screen with recording path
            router.push('/upload');
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <RecordingInterface
        parentTrack={parentTrack}
        onRecordingComplete={handleRecordingComplete}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.backgroundSecondary,
  },
});

export default RecordScreen; 