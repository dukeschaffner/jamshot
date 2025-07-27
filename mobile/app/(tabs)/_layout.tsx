import React from 'react';
import { Tabs , Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '../../src/contexts/UserContext';

export default function TabLayout() {
  const { isAuthenticated, isLoading } = useUser();

  // Show loading screen while checking authentication
  if (isLoading) {
    return null;
  }

  // Redirect to auth if not authenticated
  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap;
          
          if (route.name === 'index') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'search') {
            iconName = focused ? 'search' : 'search-outline';
          } else if (route.name === 'record') {
            iconName = focused ? 'mic' : 'mic-outline';
          } else if (route.name === 'profile') {
            iconName = focused ? 'person' : 'person-outline';
          } else {
            iconName = 'help-outline';
          }
          
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#3B82F6',
        tabBarInactiveTintColor: 'gray',
        headerShown: false,
      })}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
        }}
      />
      <Tabs.Screen
        name="record"
        options={{
          title: 'Record',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
        }}
      />
    </Tabs>
  );
}
