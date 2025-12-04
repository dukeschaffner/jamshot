import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AudioProvider } from '../contexts/AudioContext';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AudioProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
        </Stack>
      </AudioProvider>
    </SafeAreaProvider>
  );
}

