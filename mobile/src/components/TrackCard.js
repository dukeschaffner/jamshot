import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatDuration, formatPlayCount, formatTimeAgo } from '../../../shared/utils/formatting';

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
            uri: track.profile_pic_url || track.user?.profile_pic_url || 'https://via.placeholder.com/40' 
          }} 
          style={styles.avatar}
          defaultSource={{ uri: 'https://via.placeholder.com/40' }}
        />
        <View style={styles.userInfo}>
          <Text style={styles.username}>
            {track.username || track.user?.username || 'Unknown User'}
          </Text>
          <Text style={styles.timeAgo}>
            {track.created_at ? formatTimeAgo(track.created_at) : 'Recently'}
          </Text>
        </View>
        {track.verified && (
          <Ionicons name="checkmark-circle" size={16} color={theme.colors.primary} />
        )}
      </View>
      
      {/* Track title */}
      <Text style={styles.title}>
        {track.title || 'Untitled Track'}
      </Text>
      
      {/* Audio player section */}
      <View style={styles.audioContainer}>
        <TouchableOpacity 
          style={[styles.playButton, isPlaying && styles.playButtonActive]} 
          onPress={handlePlay}
          activeOpacity={0.8}
        >
          <Ionicons 
            name={isPlaying ? "pause" : "play"} 
            size={28} 
            color={theme.colors.textInverse} 
            style={{ marginLeft: isPlaying ? 0 : 2 }}
          />
        </TouchableOpacity>
        
        <View style={styles.waveformContainer}>
          {/* Enhanced waveform visualization */}
          <View style={styles.waveform}>
            {Array.from({ length: 24 }).map((_, index) => {
              const baseHeight = 8;
              const maxHeight = 32;
              const height = baseHeight + (Math.sin(index * 0.3) * 0.5 + 0.5) * (maxHeight - baseHeight);
              const isActive = isPlaying && index < (currentTime / track.duration) * 24;
              
              return (
                <View
                  key={index}
                  style={[
                    styles.waveformBar,
                    {
                      height: height,
                      backgroundColor: isActive ? theme.colors.primary : theme.colors.border,
                      opacity: isActive ? 1 : 0.6,
                    }
                  ]}
                />
              );
            })}
          </View>
          <Text style={styles.duration}>{formatDuration(track.duration)}</Text>
        </View>
      </View>
      
      {/* Action buttons */}
      <View style={styles.actions}>
        <TouchableOpacity 
          style={styles.actionButton} 
          onPress={handleLike}
          activeOpacity={0.7}
        >
          <Ionicons 
            name={track.liked ? "heart" : "heart-outline"} 
            size={22} 
            color={track.liked ? theme.colors.like : theme.colors.likeInactive} 
          />
          <Text style={[styles.actionText, track.liked && styles.actionTextActive]}>
            {formatPlayCount(track.like_count || 0)}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.actionButton} 
          onPress={handleExpand}
          activeOpacity={0.7}
        >
          <Ionicons name="chatbubble-outline" size={22} color={theme.colors.textSecondary} />
          <Text style={styles.actionText}>{track.comment_count || 0}</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.actionButton} 
          onPress={handleCollaborate}
          activeOpacity={0.7}
        >
          <Ionicons name="add-circle-outline" size={22} color={theme.colors.textSecondary} />
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
    marginHorizontal: theme.spacing.lg,
    marginVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: theme.spacing.md,
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  userInfo: {
    flex: 1,
  },
  username: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  timeAgo: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.fontWeights.medium,
  },
  title: {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.lg,
    lineHeight: theme.typography.lineHeights.tight,
  },
  audioContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
  },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
    ...theme.shadows.md,
    elevation: 4,
  },
  playButtonActive: {
    backgroundColor: theme.colors.primaryDark,
    transform: [{ scale: 1.05 }],
    elevation: 6,
  },
  waveformContainer: {
    flex: 1,
    height: 56,
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.md,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 32,
    marginBottom: 6,
  },
  waveformBar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
  },
  duration: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    fontWeight: theme.typography.fontWeights.medium,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
  },
  actionText: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.sm,
    fontWeight: theme.typography.fontWeights.medium,
  },
  actionTextActive: {
    color: theme.colors.like,
    fontWeight: theme.typography.fontWeights.semibold,
  },
  playCount: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.fontWeights.medium,
  },
});

export default TrackCard; 