import { View, StyleSheet, Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../styles/global';
import GlobalPlayer from '../../components/GlobalPlayer';
import { useAudio } from '../../contexts/AudioContext';

// Approximate tab bar height (varies by platform)
const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 49 : 56;
// Player height: 8px top padding + 50px image + 8px progress container padding + 3px progress bar + 8px bottom padding ≈ 77px
const PLAYER_HEIGHT = 77;

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { currentTrack } = useAudio();
  const playerVisible = !!currentTrack;
  
  return (
    <View style={styles.container}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.seafoam,
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarStyle: {
            backgroundColor: colors.background,
            borderTopColor: colors.grey2,
            borderTopWidth: 1,
            paddingBottom: insets.bottom,
            height: TAB_BAR_HEIGHT + insets.bottom,
          },
          headerShown: false,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="home" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: 'Search',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="search" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="record"
          options={{
            title: 'Record',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="mic" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person" size={size} color={color} />
            ),
          }}
        />
      </Tabs>
      {playerVisible && (
        <View style={[styles.playerContainer, { bottom: TAB_BAR_HEIGHT + insets.bottom }]}>
          <GlobalPlayer />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  playerContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1,
    elevation: 1, // Android shadow/elevation
  },
});

