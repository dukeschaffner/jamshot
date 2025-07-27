import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import { UserProvider } from '../src/contexts/UserContext';
import { AudioProvider } from '../src/contexts/AudioContext';
import ErrorBoundary from '../src/components/ErrorBoundary';

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <UserProvider>
        <AudioProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="record" options={{ headerShown: false }} />
            <Stack.Screen name="track-detail" options={{ title: 'Track' }} />
            <Stack.Screen name="user-profile" options={{ title: 'Profile' }} />
          </Stack>
          <StatusBar style="auto" />
        </AudioProvider>
      </UserProvider>
    </ErrorBoundary>
  );
}
