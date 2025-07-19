import React, { useState, useEffect } from 'react';
import { View, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { useUser } from '../contexts/UserContext';
import { useAudio } from '../contexts/AudioContext';
import { useRouter } from 'expo-router';
import { trackApi } from '../services/api';
import TrackCard from '../components/TrackCard';
import LoadingSpinner from '../components/LoadingSpinner';
import { theme } from '../styles/theme';

const HomeScreen = () => {
  const { user } = useUser();
  const { currentTrack, isPlaying, setTrack, startPlayback, stopPlayback } = useAudio();
  const router = useRouter();
  
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Debug logging
  console.log('🔍 HomeScreen Debug:', {
    user: user?.username,
    tracksCount: tracks.length,
    loading,
    currentTrack: currentTrack?.title,
    isPlaying
  });

  const fetchTracks = async (pageNum = 1, refresh = false) => {
    console.log('📡 Fetching tracks:', { pageNum, refresh });
    try {
      const response = await trackApi.getFeed('for-you', pageNum);
      const newTracks = response.data.tracks || [];
      
      console.log('✅ Tracks fetched:', newTracks.length);
      
      if (refresh) {
        setTracks(newTracks);
      } else {
        setTracks(prev => [...prev, ...newTracks]);
      }
      
      setHasMore(newTracks.length === 10); // Assuming 10 tracks per page
      setPage(pageNum);
    } catch (error) {
      console.error('❌ Failed to fetch tracks:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchTracks(1, true);
  };

  const handleLoadMore = () => {
    if (hasMore && !loading) {
      fetchTracks(page + 1);
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
    fetchTracks();
  }, []);

  if (loading) {
    return <LoadingSpinner text="Loading tracks..." />;
  }

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

  return (
    <View style={styles.container}>
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  listContainer: {
    paddingVertical: theme.spacing.sm,
  },
});

export default HomeScreen; 