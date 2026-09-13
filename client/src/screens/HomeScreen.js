import React, { useMemo } from 'react';
import { View, FlatList, Text, RefreshControl, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLibrary } from '../context/LibraryContext';
import { CATEGORIES } from '../services/categories';
import { CategoryCard } from '../components/CategoryCard';
import { LibraryStatus } from '../components/LibraryStatus';
import { COLORS } from '../theme/colors';
import { styles } from '../theme/css/HomeScreenStyles';

// Personalize the edition masthead using the device's local time.
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 5) return 'Buonanotte';
  if (hour < 12) return 'Buongiorno';
  if (hour < 18) return 'Buon pomeriggio';
  return 'Buonasera';
}

// Edition overview: keep newsletter-level browsing alongside the unified article feed.
export const HomeScreen = ({ navigation }) => {
  const { newsletters, syncMode, sync } = useLibrary();
  // Editions are newest-first in the library, so find selects the latest per category.
  const latest = useMemo(() => CATEGORIES.map((category) =>
    newsletters.find((edition) => edition.category === category)).filter(Boolean), [newsletters]);
  const date = new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });

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
              <Text style={styles.eyebrow}>EDIZIONI</Text>
            </View>
            <Text style={styles.greeting}>{getGreeting()}</Text>
            <Text style={styles.date}>{date}</Text>
            <View style={styles.hairline} />
            <Text style={styles.statBadgeText}>Ultima edizione importata per categoria · {latest.length} categorie</Text>
            {/* Synchronization failures do not replace cached edition cards. */}
            <LibraryStatus />
          </View>
        }
        ListEmptyComponent={<View style={styles.emptyState}><Text style={styles.emptyTitle}>Nessuna edizione importata</Text><Text style={styles.emptySubtitle}>Sincronizza Gmail per iniziare. Le edizioni salvate saranno disponibili anche offline.</Text></View>}
        refreshControl={<RefreshControl refreshing={syncMode === 'refresh'} onRefresh={() => sync()} tintColor={COLORS.accent} />}
        contentContainerStyle={latest.length ? styles.listPadding : styles.listPaddingEmpty}
      />
    </SafeAreaView>
  );
};
