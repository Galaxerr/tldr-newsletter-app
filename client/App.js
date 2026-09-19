import React from 'react';
import { View, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { HomeScreen } from './src/screens/HomeScreen';
import { ArchiveScreen } from './src/screens/ArchiveScreen';
import { DetailScreen } from './src/screens/DetailScreen';
import { FeedScreen } from './src/screens/FeedScreen';
import { styles, navigationStyles } from './src/theme/css/MainStyles';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { NetworkBanner } from './src/components/NetworkBanner';
import { DeleteLocalDataButton } from './src/components/DeleteLocalDataButton';
import { ArticleReader } from './src/components/ArticleReader';
import { ToastProvider } from './src/context/ToastContext';
import { LibraryProvider, useLibrary } from './src/context/LibraryContext';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { LoginScreen } from './src/screens/LoginScreen';
import { AccountScreen } from './src/screens/AccountScreen';
import { COLORS } from './src/theme/colors';

// Tabs organize the library; the stack opens an individual newsletter edition.
const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const TAB_ICONS = {
  Editions: 'newspaper',
  Feed: 'reader',
  Saved: 'bookmark',
  Archive: 'archive',
  Account: 'person-circle',
};

// Feed and Saved reuse the same screen; savedOnly applies a bookmark filter.
function MainTabs() {
  return (
    <Tab.Navigator screenOptions={({ route }) => ({
      headerShown: false, tabBarStyle: styles.tabBar,
      tabBarActiveTintColor: COLORS.accent,
      tabBarInactiveTintColor: navigationStyles.tabBarInactiveTintColor,
      tabBarIcon: ({ focused, color, size }) => (
        <Ionicons name={`${TAB_ICONS[route.name]}${focused ? '' : '-outline'}`} size={size} color={color} accessible={false} />
      ),
    })}>
      <Tab.Screen name="Editions" component={HomeScreen} />
      <Tab.Screen name="Feed" component={FeedScreen} />
      <Tab.Screen name="Saved">
        {(props) => <FeedScreen {...props} savedOnly />}
      </Tab.Screen>
      <Tab.Screen name="Archive" component={ArchiveScreen} />
      <Tab.Screen name="Account" component={AccountScreen} />
    </Tab.Navigator>
  );
}

// Gate navigation only on local hydration, so Gmail errors cannot block saved reading.
function LibraryApp() {
  const { ready, hydrationError, retryHydration } = useLibrary();
  const { signOut } = useAuth();
  // A failed local read offers a retry without deleting the existing cache.
  if (!ready) {
    return (
      <View style={styles.center}>
        {hydrationError ? (
          <>
            <Text style={styles.errorTitle}>Library unavailable</Text>
            <Text style={styles.errorMessage}>{hydrationError}</Text>
            <DeleteLocalDataButton />
            <TouchableOpacity accessibilityRole="button" style={styles.retryButton} onPress={retryHydration}>
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" style={styles.retryButton} onPress={signOut}>
              <Text style={styles.retryText}>Sign out</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color={COLORS.accent} />
            <Text style={styles.loadingText}>Opening saved summaries…</Text>
          </>
        )}
      </View>
    );
  }
  return (
    <NavigationContainer theme={DarkTheme}>
      <NetworkBanner />
      <Stack.Navigator screenOptions={{ headerStyle: styles.stackHeader, headerTintColor: navigationStyles.headerTintColor }}>
        <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
        <Stack.Screen name="Detail" component={DetailScreen} options={{ title: 'TLDR edition' }} />
      </Stack.Navigator>
      {/* One reader above all screens survives list filtering and bookmark removal. */}
      <ArticleReader />
    </NavigationContainer>
  );
}

// Close the library during session changes; keyed providers discard all previous
// account UI, navigation and imports before another account's cache is loaded.
function AuthenticatedApp() {
  const { ready, busy, user } = useAuth();
  if (!ready || busy) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.accent} /><Text style={styles.loadingText}>{busy ? 'Connecting to Google…' : 'Opening session…'}</Text></View>;
  if (!user) return <LoginScreen />;
  return <LibraryProvider key={user.id}><LibraryApp /></LibraryProvider>;
}

// Provider order matters: library actions need toasts; screens need the library.
// SafeAreaProvider supplies device insets, and ErrorBoundary catches render failures.
export default function App() {
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <ToastProvider>
          <AuthProvider>
            <AuthenticatedApp />
          </AuthProvider>
        </ToastProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
