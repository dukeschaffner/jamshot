import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Track from '../../components/Track';
import { useApi } from '../../lib/api';
import { colors, buttonStyles, buttonTextStyles } from '../../styles/global';

const TRACKS_PER_PAGE = 5;

export default function HomeScreen() {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [feedType, setFeedType] = useState('popular'); // 'following' or 'popular'
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const api = useApi();

  const fetchTracks = useCallback(async (pageNum = 1, append = false) => {
    try {
      if (pageNum === 1) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      const response = await api.get(`/tracks/feed/${feedType}`, {
        params: {
          page: pageNum,
          limit: TRACKS_PER_PAGE
        }
      });

      const newTracks = response.data || [];
      
      if (append) {
        setTracks(prev => [...prev, ...newTracks]);
      } else {
        setTracks(newTracks);
      }

      setHasMore(newTracks.length === TRACKS_PER_PAGE);
      setPage(pageNum);
    } catch (error) {
      console.error('Failed to fetch tracks:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [feedType, api]);

  useEffect(() => {
    fetchTracks(1, false);
  }, [feedType]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchTracks(1, false);
  }, [fetchTracks]);

  const handleLoadMore = useCallback(() => {
    if (!loadingMore && hasMore) {
      fetchTracks(page + 1, true);
    }
  }, [loadingMore, hasMore, page, fetchTracks]);

  const renderTrack = useCallback(({ item }) => (
    <Track track={item} />
  ), []);

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={colors.seafoam} />
      </View>
    );
  };

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>
          {feedType === 'following' 
            ? "You're not following any artists yet. Follow some artists to see their tracks here!"
            : "No tracks available. Check back later!"}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Home Feed</Text>
        <Text style={styles.subtitle}>
          Check out the latest tracks from artists you follow and trending collaborations
        </Text>
        
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[buttonStyles.pillBtnSm, feedType === 'following' && styles.tabActive]}
            onPress={() => setFeedType('following')}
          >
            <Text style={[buttonTextStyles.pillBtnSm, feedType === 'following' && styles.tabTextActive]}>
              Following
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[buttonStyles.pillBtnSm, feedType === 'popular' && styles.tabActive]}
            onPress={() => setFeedType('popular')}
          >
            <Text style={[buttonTextStyles.pillBtnSm, feedType === 'popular' && styles.tabTextActive]}>
              Popular
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading && tracks.length === 0 ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={colors.seafoam} />
        </View>
      ) : (
        <FlatList
          data={tracks}
          renderItem={renderTrack}
          keyExtractor={(item) => item.id.toString()}
          onRefresh={handleRefresh}
          refreshing={refreshing}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={renderFooter}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.listContent}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.grey2,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
  },
  tabActive: {
    backgroundColor: colors.seafoam,
  },
  tabTextActive: {
    color: colors.white,
  },
  listContent: {
    paddingBottom: 16,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});

