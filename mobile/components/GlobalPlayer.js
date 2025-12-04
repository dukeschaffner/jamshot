import { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudio } from '../contexts/AudioContext';
import { colors } from '../styles/global';
import { useRouter } from 'expo-router';

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export default function GlobalPlayer() {
  const { 
    currentTrack, 
    isPlaying, 
    progress, 
    togglePlayPause, 
    seek, 
    setIsSeeking,
    playNext, 
    playPrevious,
    isShuffleOn,
    isLoopOn,
    toggleShuffle,
    toggleLoop
  } = useAudio();
  
  const [showFullPlayer, setShowFullPlayer] = useState(false);
  const progressBarRef = useRef(null);
  const router = useRouter();

  if (!currentTrack) return null;

  const handleProgressBarPress = (event) => {
    if (!currentTrack || !progressBarRef.current) return;
    
    const { locationX } = event.nativeEvent;
    const progressBarWidth = progressBarRef.current.width || 1;
    const clickPosition = Math.max(0, Math.min(1, locationX / progressBarWidth));
    const seekPosition = clickPosition * currentTrack.duration;
    
    seek(seekPosition);
  };

  const navigateToTrack = () => {
    if (currentTrack?.id) {
      router.push(`/track/${currentTrack.id}`);
    }
  };

  const navigateToUserProfile = () => {
    if (currentTrack?.username) {
      router.push(`/user/${currentTrack.username}`);
    }
  };

  return (
    <>
      {/* Compact Player Bar */}
      <TouchableOpacity
        style={styles.compactPlayer}
        onPress={() => setShowFullPlayer(true)}
        activeOpacity={0.8}
      >
        <View style={styles.compactContent}>
          {/* Album Art */}
          {currentTrack.profile_pic_url ? (
            <Image
              source={{ uri: currentTrack.profile_pic_url }}
              style={styles.compactImage}
            />
          ) : (
            <View style={styles.compactImagePlaceholder}>
              <Ionicons name="musical-notes" size={20} color={colors.textSecondary} />
            </View>
          )}

          {/* Track Info */}
          <View style={styles.compactInfo}>
            <Text style={styles.compactTitle} numberOfLines={1}>
              {currentTrack.title}
            </Text>
            <Text style={styles.compactArtist} numberOfLines={1}>
              {currentTrack.username}
            </Text>
          </View>

          {/* Play/Pause Button */}
          <TouchableOpacity
            style={styles.compactPlayButton}
            onPress={(e) => {
              e.stopPropagation();
              togglePlayPause();
            }}
            activeOpacity={0.8}
          >
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={24}
              color={colors.white}
            />
          </TouchableOpacity>
        </View>

        {/* Progress Bar */}
        <View
          style={styles.progressBarContainer}
          onLayout={(event) => {
            progressBarRef.current = event.nativeEvent.layout;
          }}
        >
          <TouchableOpacity
            style={styles.progressBar}
            onPress={handleProgressBarPress}
            activeOpacity={1}
          >
            <View
              style={[
                styles.progressFill,
                { width: `${(progress / currentTrack.duration) * 100}%` }
              ]}
            />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>

      {/* Full Player Modal */}
      <Modal
        visible={showFullPlayer}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowFullPlayer(false)}
      >
        <View style={styles.fullPlayerContainer}>
          {/* Close Button */}
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setShowFullPlayer(false)}
          >
            <Ionicons name="chevron-down" size={32} color={colors.textPrimary} />
          </TouchableOpacity>

          {/* Album Art */}
          <View style={styles.fullImageContainer}>
            {currentTrack.profile_pic_url ? (
              <Image
                source={{ uri: currentTrack.profile_pic_url }}
                style={styles.fullImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.fullImagePlaceholder}>
                <Ionicons name="musical-notes" size={80} color={colors.textSecondary} />
              </View>
            )}
          </View>

          {/* Track Info */}
          <View style={styles.fullTrackInfo}>
            <TouchableOpacity onPress={navigateToTrack}>
              <Text style={styles.fullTitle} numberOfLines={2}>
                {currentTrack.title}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={navigateToUserProfile}>
              <View style={styles.fullArtistRow}>
                <Text style={styles.fullArtist} numberOfLines={1}>
                  {currentTrack.username}
                </Text>
                {currentTrack.verified && (
                  <Ionicons name="checkmark-circle" size={20} color={colors.seafoam} />
                )}
              </View>
            </TouchableOpacity>
          </View>

          {/* Progress Section */}
          <View style={styles.fullProgressSection}>
            <View
              style={styles.fullProgressBarContainer}
              onLayout={(event) => {
                progressBarRef.current = event.nativeEvent.layout;
              }}
            >
              <TouchableOpacity
                style={styles.fullProgressBar}
                onPress={handleProgressBarPress}
                activeOpacity={1}
              >
                <View
                  style={[
                    styles.progressFill,
                    { width: `${(progress / currentTrack.duration) * 100}%` }
                  ]}
                />
              </TouchableOpacity>
            </View>
            <View style={styles.timeDisplay}>
              <Text style={styles.timeText}>{formatTime(progress)}</Text>
              <Text style={styles.timeText}>{formatTime(currentTrack.duration)}</Text>
            </View>
          </View>

          {/* Control Buttons */}
          <View style={styles.fullControls}>
            <TouchableOpacity
              style={[styles.controlButton, isShuffleOn && styles.controlButtonActive]}
              onPress={toggleShuffle}
            >
              <Ionicons
                name="shuffle"
                size={24}
                color={isShuffleOn ? colors.seafoam : colors.textSecondary}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.controlButton}
              onPress={playPrevious}
            >
              <Ionicons name="play-skip-back" size={28} color={colors.textPrimary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.playPauseButton}
              onPress={togglePlayPause}
            >
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={40}
                color={colors.white}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.controlButton}
              onPress={playNext}
            >
              <Ionicons name="play-skip-forward" size={28} color={colors.textPrimary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlButton, isLoopOn && styles.controlButtonActive]}
              onPress={toggleLoop}
            >
              <Ionicons
                name="repeat"
                size={24}
                color={isLoopOn ? colors.seafoam : colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  compactPlayer: {
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.grey2,
    paddingBottom: 8,
  },
  compactContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
  },
  compactImage: {
    width: 50,
    height: 50,
    borderRadius: 4,
  },
  compactImagePlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 4,
    backgroundColor: colors.grey1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  compactInfo: {
    flex: 1,
    gap: 2,
  },
  compactTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  compactArtist: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  compactPlayButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.seafoam,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressBarContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  progressBar: {
    height: 3,
    backgroundColor: colors.grey2,
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.seafoam,
  },
  fullPlayerContainer: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 60,
  },
  closeButton: {
    padding: 16,
    alignItems: 'center',
  },
  fullImageContainer: {
    alignItems: 'center',
    marginVertical: 32,
  },
  fullImage: {
    width: 300,
    height: 300,
    borderRadius: 8,
  },
  fullImagePlaceholder: {
    width: 300,
    height: 300,
    borderRadius: 8,
    backgroundColor: colors.grey1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullTrackInfo: {
    paddingHorizontal: 32,
    alignItems: 'center',
    marginBottom: 32,
  },
  fullTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  fullArtistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fullArtist: {
    fontSize: 18,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  fullProgressSection: {
    paddingHorizontal: 32,
    marginBottom: 32,
  },
  fullProgressBarContainer: {
    marginBottom: 8,
  },
  fullProgressBar: {
    height: 4,
    backgroundColor: colors.grey2,
    borderRadius: 2,
    overflow: 'hidden',
  },
  timeDisplay: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  fullControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 24,
  },
  controlButton: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlButtonActive: {
    // Active state styling handled by icon color
  },
  playPauseButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.seafoam,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

