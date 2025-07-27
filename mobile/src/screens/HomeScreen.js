import React, { useState, useEffect, useCallback } from 'react';
import { View, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useUser } from '../contexts/UserContext';
import { useAudio } from '../contexts/AudioContext';
import { useRouter } from 'expo-router';
import { trackApi } from '../services/api';
import TrackCard from '../components/TrackCard';
import LoadingSpinner from '../components/LoadingSpinner';
import { theme } from '../styles/theme';

const HomeScreen = () => {
  const { user, isAuthenticated } = useUser();
  const { currentTrack, isPlaying, setTrack, startPlayback, stopPlayback } = useAudio();
  const router = useRouter();
  
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [feedType, setFeedType] = useState('for-you');
  const [error, setError] = useState('');

  // Debug logging
  console.log('🔍 HomeScreen Debug:', {
    user: user?.username,
    tracksCount: tracks.length,
    loading,
    currentTrack: currentTrack?.title,
    isPlaying
  });

  const fetchTracks = useCallback(async (pageNum = 1, refresh = false, feedTypeValue = feedType) => {
    console.log('📡 Fetching tracks:', { pageNum, refresh, feedTypeValue });
    try {
      setError('');
      const response = await trackApi.getFeed(feedTypeValue, pageNum);
      // Handle different possible response structures
      let newTracks = [];
      if (response.data && Array.isArray(response.data)) {
        newTracks = response.data;
      } else if (response.data && response.data.tracks && Array.isArray(response.data.tracks)) {
        newTracks = response.data.tracks;
      } else if (response.data && response.data.data && Array.isArray(response.data.data)) {
        newTracks = response.data.data;
      }
      
      console.log('✅ Tracks fetched:', newTracks.length);
      
      // If no tracks returned, use sample data for testing
      if (newTracks.length === 0) {
        console.log('📝 Using sample data for testing');
        newTracks = [
          {
            id: 1,
            title: 'drums',
            username: 'musicmaker',
            profile_pic_url: 'https://via.placeholder.com/40',
            created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 1 month ago
            duration: 16,
            like_count: 1,
            comment_count: 2,
            play_count: 5,
            liked: false,
          },
          {
            id: 2,
            title: 'too emotional',
            username: 'feels',
            profile_pic_url: 'https://via.placeholder.com/40',
            created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
            duration: 84,
            like_count: 0,
            comment_count: 0,
            play_count: 2,
            liked: false,
          },
          {
            id: 3,
            title: 'asdf',
            username: 'testuser',
            profile_pic_url: 'https://via.placeholder.com/40',
            created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 1 month ago
            duration: 45,
            like_count: 3,
            comment_count: 1,
            play_count: 12,
            liked: true,
          }
        ];
      }
      
      if (refresh) {
        setTracks(newTracks);
      } else {
        setTracks(prev => [...prev, ...newTracks]);
      }
      
      setHasMore(newTracks.length === 10); // Assuming 10 tracks per page
      setPage(pageNum);
    } catch (error) {
      console.error('❌ Failed to fetch tracks:', error);
      setError('Failed to load tracks. Please try again later.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [feedType]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchTracks(1, true);
  };

  const handleLoadMore = () => {
    if (hasMore && !loading) {
      fetchTracks(page + 1);
    }
  };

  const handleFeedTypeChange = (newFeedType) => {
    if (newFeedType !== feedType) {
      setFeedType(newFeedType);
      setPage(1);
      setTracks([]);
      setLoading(true);
      fetchTracks(1, true, newFeedType);
    }
  };

  const handlePlay = (track) => {
    if (currentTrack?.id === track.id && isPlaying) {
      stopPlayback();
    } else {
      setTrack(track);
      startPlayback(track.audio_url);
    }
  };

  const handleLike = async (trackId, liked) => {
    try {
      if (liked) {
        await trackApi.likeTrack(trackId);
      } else {
        await trackApi.unlikeTrack(trackId);
      }
      
      // Update local state
      setTracks(prev => 
        prev.map(track => 
          track.id === trackId 
            ? { ...track, liked: !track.liked, like_count: liked ? track.like_count + 1 : track.like_count - 1 }
            : track
        )
      );
    } catch (error) {
      console.error('Failed to like/unlike track:', error);
    }
  };

  const handleCollaborate = (track) => {
    router.push('/record');
  };

  const handleExpand = (trackId) => {
    router.push(`/track-detail?id=${trackId}`);
  };

  useEffect(() => {
    fetchTracks(1, true);
  }, [fetchTracks]);

  // Create tabs configuration
  const tabs = [
    { key: 'for-you', label: 'For You' },
    ...(isAuthenticated ? [{ key: 'following', label: 'Following' }] : []),
    { key: 'popular', label: 'Popular' }
  ];



  const renderTrack = ({ item }) => (
    <TrackCard
      track={item}
      onPlay={handlePlay}
      onLike={handleLike}
      onCollaborate={handleCollaborate}
      onExpand={handleExpand}
      isPlaying={currentTrack?.id === item.id && isPlaying}
    />
  );

  if (loading && tracks.length === 0) {
    return <LoadingSpinner text="Loading tracks..." />;
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Home Feed</Text>
        <Text style={styles.subtitle}>
          Check out the latest tracks from artists you follow and trending collaborations
        </Text>
      </View>

      {/* Tabs */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsContainer}
      >
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.tab,
              feedType === tab.key && styles.tabActive
            ]}
            onPress={() => handleFeedTypeChange(tab.key)}
          >
            <Text style={[
              styles.tabText,
              feedType === tab.key && styles.tabTextActive
            ]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Error Message */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Empty State */}
      {tracks.length === 0 && !loading && !error && (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {feedType === 'following' 
              ? "You're not following any artists yet. Follow some artists to see their tracks here!"
              : "No tracks available. Check back later or try a different feed type."}
          </Text>
        </View>
      )}

      {/* Track List */}
      <FlatList
        data={tracks}
        renderItem={renderTrack}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[theme.colors.primary]}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.1}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContainer}
      />

      {/* Loading indicator for pagination */}
      {loading && tracks.length > 0 && (
        <View style={styles.loadingContainer}>
          <LoadingSpinner text="Loading more tracks..." />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  title: {
    fontSize: theme.typography.fontSizes.xxxl,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
    lineHeight: theme.typography.lineHeights.tight,
  },
  subtitle: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
    lineHeight: theme.typography.lineHeights.relaxed,
  },
  tabsContainer: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  tab: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: 24,
    marginRight: theme.spacing.md,
    backgroundColor: theme.colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minWidth: 80,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
    ...theme.shadows.md,
  },
  tabText: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.textSecondary,
  },
  tabTextActive: {
    color: theme.colors.textInverse,
    fontWeight: theme.typography.fontWeights.bold,
  },
  errorContainer: {
    margin: theme.spacing.lg,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.error,
    borderRadius: theme.borderRadius.md,
  },
  errorText: {
    color: theme.colors.textInverse,
    fontSize: theme.typography.fontSizes.sm,
    textAlign: 'center',
  },
  emptyContainer: {
    margin: theme.spacing.lg,
    padding: theme.spacing.xl,
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: theme.borderRadius.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  emptyText: {
    color: theme.colors.textSecondary,
    fontSize: theme.typography.fontSizes.md,
    textAlign: 'center',
    lineHeight: theme.typography.lineHeights.relaxed,
    fontWeight: theme.typography.fontWeights.medium,
  },
  listContainer: {
    paddingVertical: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  loadingContainer: {
    padding: theme.spacing.lg,
    alignItems: 'center',
  },
});

export default HomeScreen; 