import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../styles/global';

export default function TrackMeta({ track }) {
  const [isLiked, setIsLiked] = useState(track.is_liked || false);
  const [likeCount, setLikeCount] = useState(Number(track.like_count) || 0);

  const handleLike = () => {
    // TODO: Implement like API call
    setIsLiked(!isLiked);
    setLikeCount(prev => isLiked ? prev - 1 : prev + 1);
  };

  const formatNumber = (num) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  return (
    <View style={styles.container}>
      <View style={styles.metaItem}>
        <Ionicons name="play" size={14} color={colors.textSecondary} />
        <Text style={styles.metaText}>{formatNumber(track.play_count || 0)}</Text>
      </View>

      <TouchableOpacity
        style={styles.metaItem}
        onPress={handleLike}
        activeOpacity={0.7}
      >
        <Ionicons
          name={isLiked ? 'heart' : 'heart-outline'}
          size={14}
          color={isLiked ? colors.rusticPink : colors.textSecondary}
        />
        <Text style={[styles.metaText, isLiked && styles.metaTextActive]}>
          {formatNumber(likeCount)}
        </Text>
      </TouchableOpacity>

      <View style={styles.metaItem}>
        <Ionicons name="repeat" size={14} color={colors.textSecondary} />
        <Text style={styles.metaText}>{formatNumber(track.repost_count || 0)}</Text>
      </View>

      <View style={styles.metaItem}>
        <Ionicons name="git-branch" size={14} color={colors.textSecondary} />
        <Text style={styles.metaText}>{formatNumber(track.collab_count || 0)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  metaTextActive: {
    color: colors.rusticPink,
  },
});

