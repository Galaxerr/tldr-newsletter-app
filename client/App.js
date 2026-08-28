// App.js
import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { getAutomaticAccessToken } from './src/services/auth';
import { HomeScreen } from './src/screens/HomeScreen';
import { ArchiveScreen } from './src/screens/ArchiveScreen';
import { DetailScreen } from './src/screens/DetailScreen';
import { styles, navigationStyles } from './src/theme/css/MainStyles';

const queryClient = new QueryClient();
const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs({ token }) {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: navigationStyles.tabBarActiveTintColor,
        tabBarInactiveTintColor: navigationStyles.tabBarInactiveTintColor,
      }}
    >
      <Tab.Screen name="Ultimi Feed">
        {(props) => <HomeScreen {...props} token={token} />}
      </Tab.Screen>
      <Tab.Screen name="Archivio">
        {(props) => <ArchiveScreen {...props} token={token} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

export default function App() {
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAutomaticAccessToken()
      .then(setToken)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={styles.center}><ActivityIndicator size="large" color="#3b82f6" /></View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <NavigationContainer theme={DarkTheme}>
        <Stack.Navigator screenOptions={{ headerStyle: styles.stackHeader, headerTintColor: navigationStyles.headerTintColor }}>
          <Stack.Screen name="Main" options={{ headerShown: false }}>
            {(props) => <MainTabs {...props} token={token} />}
          </Stack.Screen>
          <Stack.Screen
            name="Detail"
            component={DetailScreen}
            options={({ route }) => ({ title: route.params.newsletter.category })}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </QueryClientProvider>
  );
}
