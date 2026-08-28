// src/screens/HomeScreen.js
import React from 'react';
import {
  View,
  FlatList,
  Text,
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { fetchLatestNewslettersByCategories } from '../services/gmail';
import { CategoryCard } from '../components/CategoryCard';
import { COLORS, FONTS } from '../theme/colors';
import { styles } from '../theme/css/HomeScreenStyles';

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 5) return 'Buonanotte';
  if (hour < 12) return 'Buongiorno';
  if (hour < 18) return 'Buon pomeriggio';
  return 'Buonasera';
}

function getFormattedDate() {
  const raw = new Date().toLocaleDateString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function getRelativeSyncTime(timestamp) {
  if (!timestamp) return null;
  const diffMinutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (diffMinutes < 1) return 'aggiornato ora';
  if (diffMinutes < 60) return `aggiornato ${diffMinutes} min fa`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `aggiornato ${diffHours} ${diffHours === 1 ? 'ora' : 'ore'} fa`;
  return 'aggiornato oggi';
}

const Masthead = ({ categoryCount, syncLabel }) => (
  <View style={styles.masthead}>

    <View style={styles.eyebrowRow}>
      <Text style={styles.wordmark}>TLDR</Text>
      <Text style={styles.eyebrow}>NEWSLETTER</Text>
    </View>
    <Text style={styles.greeting}>{getGreeting()}</Text>
    <Text style={styles.date}>{getFormattedDate()}</Text>
    <View style={styles.hairline} />
    <View style={styles.statsRow}>
      <View style={styles.statBadge}>
        <Text style={styles.statBadgeText}>
          {categoryCount} {categoryCount === 1 ? 'categoria' : 'categorie'}
        </Text>
      </View>
      {syncLabel ? <Text style={styles.syncLabel}>{syncLabel}</Text> : null}
    </View>
  </View>
);

const EmptyState = ({ onRetry }) => (
  <View style={styles.emptyState}>
    <Text style={styles.emptyGlyph}>📭</Text>
    <Text style={styles.emptyTitle}>Nessuna newsletter oggi</Text>
    <Text style={styles.emptySubtitle}>
      Le nuove edizioni TLDR compariranno qui non appena arrivano nella tua casella.
    </Text>
    <TouchableOpacity style={styles.secondaryButton} onPress={onRetry}>
      <Text style={styles.secondaryButtonText}>Controlla di nuovo</Text>
    </TouchableOpacity>
  </View>
);

export const HomeScreen = ({ token, navigation }) => {
  const { data, isLoading, isFetching, isError, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['newslettersByCategories', token],
    queryFn: () => fetchLatestNewslettersByCategories(token),
    enabled: !!token,
  });

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.center}>
          <Text style={styles.loadingWordmark}>TLDR</Text>
          <ActivityIndicator size="large" color={COLORS.accent} style={styles.loadingSpinner} />
          <Text style={styles.loadingText}>Sincronizzazione edizioni TLDR…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isError) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
        <View style={styles.center}>
          <View style={styles.errorCard}>
            <Text style={styles.errorGlyph}>⚠️</Text>
            <Text style={styles.errorText}>Non siamo riusciti a sincronizzare</Text>
            <Text style={styles.errorSub}>
              {error?.message || 'Controlla la connessione e riprova.'}
            </Text>
            <TouchableOpacity style={styles.primaryButton} onPress={refetch}>
              <Text style={styles.primaryButtonText}>Riprova</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.container}>
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <CategoryCard
              item={item}
              onPress={() => navigation.navigate('Detail', { newsletter: item })}
            />
          )}
          ListHeaderComponent={
            <Masthead
              categoryCount={data?.length ?? 0}
              syncLabel={getRelativeSyncTime(dataUpdatedAt)}
            />
          }
          ListEmptyComponent={<EmptyState onRetry={refetch} />}
          refreshControl={
            <RefreshControl
              refreshing={isFetching}
              onRefresh={refetch}
              tintColor={COLORS.accent}
              colors={[COLORS.accent]}
              progressBackgroundColor={COLORS.surface}
            />
          }
          contentContainerStyle={
            data?.length ? styles.listPadding : styles.listPaddingEmpty
          }
        />
      </View>
    </SafeAreaView>
  );
};
