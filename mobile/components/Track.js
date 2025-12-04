import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import TrackMeta from './TrackMeta';
import { colors } from '../styles/global';
import { useAudio } from '../contexts/AudioContext';

export default function Track({ track }) {
  const { currentTrack, isPlaying, playTrack, togglePlayPause, setDiscoveryMethod } = useAudio();
  const isCurrentTrack = currentTrack?.id === track.id;

  const handlePlayToggle = (e) => {
    e.stopPropagation();
    if (isCurrentTrack) {
      togglePlayPause();
    } else {
      setDiscoveryMethod('feed');
      playTrack(track, []);
    }
  };

  const handlePress = () => {
    // TODO: Navigate to track detail page
    console.log('Track pressed:', track.id);
  };

  return (
    <TouchableOpacity style={styles.container} onPress={handlePress} activeOpacity={0.7}>
      <View style={styles.content}>
        {/* Play Button */}
        <TouchableOpacity
          style={styles.playButton}
          onPress={handlePlayToggle}
          activeOpacity={0.8}
        >
          <Ionicons
            name={isCurrentTrack && isPlaying ? 'pause' : 'play'}
            size={24}
            color={colors.white}
          />
        </TouchableOpacity>

        {/* Track Info */}
        <View style={styles.trackInfo}>
          {/* Artist Info */}
          <View style={styles.artistRow}>
            {track.profile_pic_url ? (
              <Image
                source={{ uri: track.profile_pic_url }}
                style={styles.avatar}
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person" size={16} color={colors.textSecondary} />
              </View>
            )}
            <Text style={styles.artistName} numberOfLines={1}>
              {track.username || 'Unknown Artist'}
            </Text>
            {track.verified && (
              <Ionicons name="checkmark-circle" size={16} color={colors.seafoam} />
            )}
          </View>

          {/* Track Title */}
          <Text style={styles.trackTitle} numberOfLines={2}>
            {track.title}
          </Text>

          {/* Layer Message */}
          {track.parent_track_id && (
            <Text style={styles.layerMessage} numberOfLines={1}>
              <Text style={styles.layerBold}>Layer {track.layer}</Text>
              {' - Based on "'}
              {track.original_title}
              {'" by '}
              {track.original_username || 'Unknown Artist'}
            </Text>
          )}

          {/* Track Metadata */}
          <TrackMeta track={track} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.grey2,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  playButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.seafoam,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  trackInfo: {
    flex: 1,
    gap: 4,
  },
  artistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  avatarPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.grey1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  artistName: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  trackTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginTop: 2,
  },
  layerMessage: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  layerBold: {
    fontWeight: 'bold',
  },
});

