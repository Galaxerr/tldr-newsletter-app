import { useMemo, useState } from 'react';
import { FlatList, View, Text, TextInput, TouchableOpacity, ScrollView, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLibrary, useEditions } from '../context/LibraryContext';
import { filterArticles, buildArticleFeed, hasSavedArticles } from '../services/library';
import { CATEGORIES } from '../services/categories';
import { ArticleCard } from '../components/ArticleCard';
import { LibraryStatus } from '../components/LibraryStatus';
import { ContentStatus } from '../components/ContentStatus';
import { COLORS } from '../theme/colors';
import { styles } from '../theme/css/FeedScreenStyles';

// Stored filter values are separate from the display labels presented to readers.
const READING_FILTERS = [['all', 'All'], ['unread', 'Unread'], ['read', 'Read']];

/** Unified article browsing and the saved-article tab share this local filtering UI. */
export function FeedScreen({ savedOnly = false }) {
  const { newsletters, latest, articleState, sync, syncing } = useLibrary();
  const selected = savedOnly ? newsletters.filter((edition) => hasSavedArticles(edition, articleState)) : latest;
  const content = useEditions(selected.map((edition) => edition.id));
  const articles = useMemo(() => buildArticleFeed(content.editions), [content.editions]);
  // These controls are screen-local; article flags and content remain shared.
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [reading, setReading] = useState('all');
  // Combine text, category, reading status and savedOnly without fetching Gmail.
  const visible = useMemo(() => filterArticles(articles, articleState, { query, category, reading, savedOnly }),
    [articles, articleState, query, category, reading, savedOnly]);
  // Distinguish an empty library from an existing library hidden by active filters.
  const hasFilters = query.trim() || category !== 'All' || reading !== 'all';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      {/* Virtualize article cards; pull-to-refresh imports mail without clearing local data. */}
      <FlatList
        data={content.loading || content.error ? [] : visible}
        initialNumToRender={8} maxToRenderPerBatch={8} windowSize={5}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ArticleCard article={item} />}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        onRefresh={() => sync()}
        refreshing={syncing}
        ListHeaderComponent={
          <View>
            <Text style={styles.wordmark}>TLDR / {savedOnly ? 'YOUR LIBRARY' : 'YOUR FEED'}</Text>
            <Text style={styles.title}>{savedOnly ? 'Worth keeping.' : 'Your latest reading.'}</Text>
            <Text style={styles.subtitle}>{savedOnly ? 'Saved articles, available offline.' : 'The latest edition from each category, from the last seven days.'}</Text>
            {/* Search only imported titles/summaries; clearing text preserves other filters. */}
            <View style={styles.searchRow}>
              <TextInput
                accessibilityLabel="Search titles and summaries"
                placeholder="Search titles and summaries…"
                placeholderTextColor={COLORS.textTertiary}
                value={query} onChangeText={setQuery} style={styles.search}
                autoCorrect={false} returnKeyType="search"
              />
              {!!query && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery('')} style={styles.smallButton}><Text style={styles.buttonText}>✕</Text></TouchableOpacity>}
            </View>
            {/* Category chips include all shared categories, including Hardware. */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
              {['All', ...CATEGORIES].map((name) => (
                <TouchableOpacity key={name} accessibilityRole="button" accessibilityState={{ selected: name === category }}
                  onPress={() => setCategory(name)} style={[styles.chip, name === category && styles.activeChip]}>
                  <Text style={[styles.chipText, name === category && styles.activeText]}>{name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {/* Explicit read status filters; opening a summary does not mark it read. */}
            <View style={styles.filters}>
              {READING_FILTERS.map(([value, label]) => (
                <TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{ selected: value === reading }}
                  onPress={() => setReading(value)} style={[styles.chip, value === reading && styles.activeChip]}>
                  <Text style={[styles.chipText, value === reading && styles.activeText]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* Import progress/errors stay separate from the still-readable article list. */}
            <LibraryStatus />
            <Text style={styles.resultCount}>{content.loading ? 'Loading articles…' : content.error ? 'Content unavailable' :
              `${visible.length} ${visible.length === 1 ? 'article' : 'articles'} · ${savedOnly ? 'your saved articles' : 'latest editions'}`}</Text>
          </View>
        }
        ListEmptyComponent={content.loading || content.error ? <ContentStatus {...content} /> :
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{hasFilters ? 'No results' : savedOnly ? 'Your reading, saved here.' : 'Your feed is ready.'}</Text>
            <Text style={styles.subtitle}>{hasFilters ? 'Try different words or clear the filters.' : savedOnly ? 'Tap “Save” on an article to find it here.' : 'Sync Gmail to download your first editions and read them offline.'}</Text>
            {!!hasFilters && <TouchableOpacity accessibilityRole="button" onPress={() => { setQuery(''); setCategory('All'); setReading('all'); }} style={styles.loadButton}><Text style={styles.buttonText}>Clear filters</Text></TouchableOpacity>}
          </View>
        }
      />
    </SafeAreaView>
  );
}

// A separate route component keeps the navigator lazy while sharing the feed controls.
export function SavedScreen() {
  return <FeedScreen savedOnly />;
}
