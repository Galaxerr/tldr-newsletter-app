import React from 'react';
import { View, FlatList, Text, RefreshControl, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLibrary } from '../context/LibraryContext';
import { CategoryCard } from '../components/CategoryCard';
import { LibraryStatus } from '../components/LibraryStatus';
import { COLORS } from '../theme/colors';
import { styles } from '../theme/css/HomeScreenStyles';

// Personalize the edition masthead using the device's local time.
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// Edition overview: keep newsletter-level browsing alongside the unified article feed.
export const HomeScreen = ({ navigation }) => {
  const { latest, syncing, sync } = useLibrary();
  const date = new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      {/* Pass an edition ID to Detail so it reads current data from the shared library. */}
      <FlatList
        data={latest}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <CategoryCard item={item} onPress={() => navigation.navigate('Detail', { newsletterId: item.id })} />}
        ListHeaderComponent={
          <View style={styles.masthead}>
            <View style={styles.eyebrowRow}>
              <Text style={styles.wordmark}>TLDR</Text>
              <Text style={styles.eyebrow}>EDITIONS</Text>
            </View>
            <Text style={styles.greeting}>{getGreeting()}</Text>
            <Text style={styles.date}>{date}</Text>
            <View style={styles.hairline} />
            <Text style={styles.statBadgeText}>Latest imported edition per category · {latest.length} categories</Text>
            {/* Synchronization failures do not replace cached edition cards. */}
            <LibraryStatus />
          </View>
        }
        ListEmptyComponent={<View style={styles.emptyState}><Text style={styles.emptyTitle}>No imported editions</Text><Text style={styles.emptySubtitle}>Sync Gmail to get started. Saved editions will also be available offline.</Text></View>}
        refreshControl={<RefreshControl refreshing={syncing} onRefresh={() => sync()} tintColor={COLORS.accent} />}
        contentContainerStyle={latest.length ? styles.listPadding : styles.listPaddingEmpty}
      />
    </SafeAreaView>
  );
};
