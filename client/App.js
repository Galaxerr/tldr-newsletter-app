// App.js
import React, { useCallback, useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { getAutomaticAccessToken } from './src/services/auth';
import { HomeScreen } from './src/screens/HomeScreen';
import { ArchiveScreen } from './src/screens/ArchiveScreen';
import { DetailScreen } from './src/screens/DetailScreen';
import { styles, navigationStyles } from './src/theme/css/MainStyles';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { NetworkBanner } from './src/components/NetworkBanner';
import { ToastProvider, toastRef } from './src/context/ToastContext';

// Config React Query: riprova automaticamente le richieste fallite,
// evita refetch inutili se i dati sono ancora "freschi", e mostra un
// toast globale ogni volta che una query o una mutation fallisce.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000, // 5 minuti
      refetchOnReconnect: true,
    },
  },
  queryCache: new QueryCache({
    onError: (error) => {
      toastRef.current?.(`Errore di caricamento: ${error.message}`, 'error');
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      toastRef.current?.(`Operazione non riuscita: ${error.message}`, 'error');
    },
  }),
});

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
      <Tab.Screen
        name="Ultimi Feed"
        options={{
          tabBarIcon: ({ color, size }) => <Text style={{ color, fontSize: size }}>📰</Text>,
        }}
      >
        {(props) => <HomeScreen {...props} token={token} />}
      </Tab.Screen>
      <Tab.Screen
        name="Archivio"
        options={{
          tabBarIcon: ({ color, size }) => <Text style={{ color, fontSize: size }}>🗂️</Text>,
        }}
      >
        {(props) => <ArchiveScreen {...props} token={token} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

export default function App() {
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  const loadToken = useCallback(() => {
    setLoading(true);
    setAuthError(null);
    getAutomaticAccessToken()
      .then(setToken)
      .catch((err) => setAuthError(err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadToken();
  }, [loadToken]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Caricamento in corso...</Text>
      </View>
    );
  }

  // Prima: se il login falliva, l'app restava bloccata sullo spinner.
  // Ora l'utente vede l'errore e può riprovare senza dover riavviare l'app.
  if (authError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Impossibile effettuare l'accesso</Text>
        <Text style={styles.errorMessage}>
          {authError.message || 'Controlla la connessione e riprova.'}
        </Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadToken}>
          <Text style={styles.retryText}>Riprova</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <ToastProvider>
        <QueryClientProvider client={queryClient}>
          <NavigationContainer theme={DarkTheme}>
            <NetworkBanner />
            <Stack.Navigator
              screenOptions={{ headerStyle: styles.stackHeader, headerTintColor: navigationStyles.headerTintColor }}
            >
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
      </ToastProvider>
    </ErrorBoundary>
  );
}