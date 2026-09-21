// src/screens/DetailScreen.js
import { View, FlatList, Text, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArticleCard } from '../components/ArticleCard';
import { COLORS, CATEGORY_COLORS, CATEGORY_COLOR_DEFAULT, hexToRgba } from '../theme/colors';
import { styles } from '../theme/css/DetailScreenStyles';
import { useLibrary, useEditions } from '../context/LibraryContext';
import { countRead, editionDate } from '../services/library';
import { ContentStatus } from '../components/ContentStatus';
import { isVerifiedEdition } from '../services/messageTrust';

// Fallback for an unavailable edition or an edition with no article entries.
const EmptyArticles = () => (
  <View style={styles.emptyState}>
    <Text style={styles.emptyGlyph}>🗞️</Text>
    <Text style={styles.emptyTitle}>No articles in this edition</Text>
    <Text style={styles.emptySubtitle}>
      This newsletter has no articles to display.
    </Text>
  </View>
);

/** Render one newsletter's original article order with shared reading/bookmark actions. */
export const DetailScreen = ({ route }) => {
  const { newsletters, articleState } = useLibrary();
  const newsletterId = route.params?.newsletterId;
  const exists = newsletters.some((edition) => edition.id === newsletterId);
  const content = useEditions(exists ? [newsletterId] : [], { pin: true });
  if (content.loading || content.error) return <ContentStatus {...content} />;
  const newsletter = content.editions[0];
  if (!newsletter) return <EmptyArticles />;
  const categoryLabel = newsletter.category || 'General';
  const badgeColor = CATEGORY_COLORS[newsletter.category] || CATEGORY_COLOR_DEFAULT;
  const articles = newsletter.articles || [];

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={[styles.badge, { backgroundColor: hexToRgba(badgeColor, 0.16) }]}>
            <Text style={[styles.badgeText, { color: badgeColor }]}>
              {categoryLabel.toUpperCase()}
            </Text>
          </View>
          <Text style={styles.title}>{newsletter.subject}</Text>
          <View style={styles.metaRow}>
            {newsletter.date ? <Text style={styles.meta}>{editionDate(newsletter)}</Text> : null}
            {newsletter.date && articles.length ? <Text style={styles.metaDot}>·</Text> : null}
            {/* Progress is derived from article flags, not Gmail's email-level read label. */}
            {articles.length ? (
              <Text style={styles.meta}>
                {countRead(articles, articleState)} / {articles.length} read
              </Text>
            ) : null}
          </View>
        </View>

        {/* Attach edition provenance to each original article before opening its reader. */}
        <FlatList
          data={articles}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ArticleCard article={{ ...item, sourceVerified: isVerifiedEdition(newsletter) && item.sourceVerified !== false, category: newsletter.category, date: editionDate(newsletter), subject: newsletter.subject, newsletterId: newsletter.id }} />
          )}
          ListEmptyComponent={<EmptyArticles />}
          contentContainerStyle={articles.length ? styles.listPadding : styles.listPaddingEmpty}
        />
      </View>
    </SafeAreaView>
  );
};
