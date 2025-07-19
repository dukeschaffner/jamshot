import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Temporary formatting functions until shared package is resolved
const formatDuration = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatPlayCount = (count) => {
  if (count < 1000) return count.toString();
  if (count < 1000000) return `${(count / 1000).toFixed(1)}K`;
  return `${(count / 1000000).toFixed(1)}M`;
};

const formatTimeAgo = (date) => {
  const now = new Date();
  const diffInSeconds = Math.floor((now - new Date(date)) / 1000);
  
  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  
  return new Date(date).toLocaleDateString();
};

import { theme } from '../styles/theme';

const TrackCard = ({ 
  track, 
  onPlay, 
  onLike, 
  onCollaborate, 
  onExpand,
  isPlaying = false,
  currentTime = 0,
}) => {
  const handleLike = () => {
    if (onLike) {
      onLike(track.id, !track.liked);
    }
  };

  const handlePlay = () => {
    if (onPlay) {
      onPlay(track);
    }
  };

  const handleCollaborate = () => {
    if (onCollaborate) {
      onCollaborate(track);
    }
  };

  const handleExpand = () => {
    if (onExpand) {
      onExpand(track.id);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header with user info */}
      <View style={styles.header}>
        <Image 
          source={{ 
            uri: track.user?.profile_pic_url || 'https://via.placeholder.com/40' 
          }} 
          style={styles.avatar}
        />
        <View style={styles.userInfo}>
          <Text style={styles.username}>{track.user?.username}</Text>
          <Text style={styles.timeAgo}>{formatTimeAgo(track.created_at)}</Text>
        </View>
        {track.user?.verified && (
          <Ionicons name="checkmark-circle" size={16} color={theme.colors.primary} />
        )}
      </View>
      
      {/* Track title */}
      <Text style={styles.title}>{track.title}</Text>
      
      {/* Audio player section */}
      <View style={styles.audioContainer}>
        <TouchableOpacity 
          style={[styles.playButton, isPlaying && styles.playButtonActive]} 
          onPress={handlePlay}
        >
          <Ionicons 
            name={isPlaying ? "pause" : "play"} 
            size={24} 
            color={theme.colors.textInverse} 
          />
        </TouchableOpacity>
        
        <View style={styles.waveformContainer}>
          {/* Simple waveform visualization */}
          <View style={styles.waveform}>
            {Array.from({ length: 20 }).map((_, index) => (
              <View
                key={index}
                style={[
                  styles.waveformBar,
                  {
                    height: Math.random() * 30 + 10,
                    backgroundColor: isPlaying && index < (currentTime / track.duration) * 20 
                      ? theme.colors.primary 
                      : theme.colors.border
                  }
                ]}
              />
            ))}
          </View>
          <Text style={styles.duration}>{formatDuration(track.duration)}</Text>
        </View>
      </View>
      
      {/* Action buttons */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionButton} onPress={handleLike}>
          <Ionicons 
            name={track.liked ? "heart" : "heart-outline"} 
            size={20} 
            color={track.liked ? theme.colors.like : theme.colors.likeInactive} 
          />
          <Text style={[styles.actionText, track.liked && styles.actionTextActive]}>
            {formatPlayCount(track.like_count || 0)}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.actionButton} onPress={handleExpand}>
          <Ionicons name="chatbubble-outline" size={20} color={theme.colors.textSecondary} />
          <Text style={styles.actionText}>{track.comment_count || 0}</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.actionButton} onPress={handleCollaborate}>
          <Ionicons name="add-circle-outline" size={20} color={theme.colors.textSecondary} />
          <Text style={styles.actionText}>Collab</Text>
        </TouchableOpacity>
        
        <Text style={styles.playCount}>{formatPlayCount(track.play_count || 0)} plays</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.background,
    marginHorizontal: theme.spacing.md,
    marginVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    ...theme.shadows.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: theme.spacing.md,
  },
  userInfo: {
    flex: 1,
  },
  username: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.textPrimary,
  },
  timeAgo: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
  },
  title: {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  audioContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  playButtonActive: {
    backgroundColor: theme.colors.primaryDark,
  },
  waveformContainer: {
    flex: 1,
    height: 48,
    backgroundColor: theme.colors.backgroundTertiary,
    borderRadius: theme.borderRadius.md,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 30,
    marginBottom: 4,
  },
  waveformBar: {
    width: 2,
    borderRadius: 1,
  },
  duration: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionText: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.xs,
  },
  actionTextActive: {
    color: theme.colors.like,
  },
  playCount: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
  },
});

export default TrackCard; 