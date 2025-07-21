import React from 'react';
import { Stack , Redirect } from 'expo-router';
import { useUser } from '../../src/contexts/UserContext';

export default function AuthLayout() {
  const { isAuthenticated, isLoading } = useUser();

  // Show loading screen while checking authentication
  if (isLoading) {
    return null;
  }

  // Redirect to main app if already authenticated
  if (isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
    </Stack>
  );
} 