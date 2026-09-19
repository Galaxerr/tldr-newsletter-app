import React, { useState } from 'react';
import { View, FlatList, Text, TouchableOpacity, ScrollView, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLibrary } from '../context/LibraryContext';
import { CATEGORIES } from '../services/categories';
import { CategoryCard } from '../components/CategoryCard';
import { LibraryStatus } from '../components/LibraryStatus';
import { COLORS } from '../theme/colors';
import { styles } from '../theme/css/ArchiveScreenStyles';

/** Browse all locally imported editions; recent editions and bookmarked older editions. */
export const ArchiveScreen = ({ navigation }) => {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const { newsletters, sync, syncing } = useLibrary();
  // Metadata includes seven days of editions plus older editions kept by bookmarks.
  const filtered = newsletters.filter((item) => selectedCategory === 'All' || item.category === selectedCategory);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.container}>
        <View style={styles.masthead}>
          <View style={styles.eyebrowRow}>
            <Text style={styles.wordmark}>TLDR</Text>
            <Text style={styles.eyebrow}>ARCHIVE</Text>
          </View>
          <Text style={styles.screenTitle}>Your editions</Text>
          <Text style={styles.screenSubtitle}>The last seven days, plus older editions with saved articles.</Text>
        </View>
        {/* Use the same category list as the feed and latest-edition view. */}
        <View style={styles.filterContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
            {['All', ...CATEGORIES].map((category) => (
              <TouchableOpacity key={category} accessibilityRole="button" accessibilityState={{ selected: selectedCategory === category }}
                style={[styles.chip, selectedCategory === category && styles.activeChip]} onPress={() => setSelectedCategory(category)}>
                <Text style={[styles.chipText, selectedCategory === category && styles.activeChipText]}>{category}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
        {/* Edition cards need metadata only; opening Detail loads the article body. */}
        <FlatList
          data={filtered} keyExtractor={(item) => item.id}
          renderItem={({ item }) => <CategoryCard item={item} onPress={() => navigation.navigate('Detail', { newsletterId: item.id })} />}
          onRefresh={() => sync()} refreshing={syncing} contentContainerStyle={styles.listPadding}
          ListHeaderComponent={<LibraryStatus />}
          ListEmptyComponent={<Text style={styles.emptyText}>No imported editions in this category. Sync Gmail to check for recent editions.</Text>}
        />
      </View>
    </SafeAreaView>
  );
};
