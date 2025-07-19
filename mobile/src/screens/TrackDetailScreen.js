import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../styles/theme';

const TrackDetailScreen = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Track Detail Screen - Coming Soon</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.backgroundSecondary,
  },
  text: {
    fontSize: theme.typography.fontSizes.lg,
    color: theme.colors.textSecondary,
  },
});

export default TrackDetailScreen; 