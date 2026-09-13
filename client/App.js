import React from 'react';
import { View, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { HomeScreen } from './src/screens/HomeScreen';
import { ArchiveScreen } from './src/screens/ArchiveScreen';
import { DetailScreen } from './src/screens/DetailScreen';
import { FeedScreen } from './src/screens/FeedScreen';
import { styles, navigationStyles } from './src/theme/css/MainStyles';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { NetworkBanner } from './src/components/NetworkBanner';
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

// Feed and Salvati reuse the same screen; savedOnly applies a bookmark filter.
function MainTabs() {
  return (
    <Tab.Navigator screenOptions={{
      headerShown: false, tabBarStyle: styles.tabBar,
      tabBarActiveTintColor: COLORS.accent,
      tabBarInactiveTintColor: navigationStyles.tabBarInactiveTintColor,
    }}>
      <Tab.Screen name="Feed" component={FeedScreen} options={{ tabBarIcon: ({ color }) => <Text style={{ color }}>📰</Text> }} />
      <Tab.Screen name="Salvati" options={{ tabBarIcon: ({ color }) => <Text style={{ color }}>★</Text> }}>
        {(props) => <FeedScreen {...props} savedOnly />}
      </Tab.Screen>
      <Tab.Screen name="Edizioni" component={HomeScreen} options={{ tabBarIcon: ({ color }) => <Text style={{ color }}>▤</Text> }} />
      <Tab.Screen name="Archivio" component={ArchiveScreen} options={{ tabBarIcon: ({ color }) => <Text style={{ color }}>🗂️</Text> }} />
      <Tab.Screen name="Account" component={AccountScreen} options={{ tabBarIcon: ({ color }) => <Text style={{ color }}>●</Text> }} />
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
            <Text style={styles.errorTitle}>Libreria non disponibile</Text>
            <Text style={styles.errorMessage}>{hydrationError}</Text>
            <TouchableOpacity accessibilityRole="button" style={styles.retryButton} onPress={retryHydration}>
              <Text style={styles.retryText}>Riprova</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" style={styles.retryButton} onPress={signOut}>
              <Text style={styles.retryText}>Esci dall’account</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color={COLORS.accent} />
            <Text style={styles.loadingText}>Apertura dei sommari salvati…</Text>
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
        <Stack.Screen name="Detail" component={DetailScreen} options={{ title: 'Edizione TLDR' }} />
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
  if (!ready || busy) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.accent} /><Text style={styles.loadingText}>{busy ? 'Collegamento con Google…' : 'Apertura della sessione…'}</Text></View>;
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
