import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { CATEGORY_COLORS, CATEGORY_COLOR_DEFAULT, hexToRgba } from '../theme/colors';
import { useLibrary } from '../context/LibraryContext';
import { articleId } from '../services/library';
import { ArticleActions } from './ArticleActions';
import { styles } from '../theme/css/ArticleCardStyles';

/** Compact summary preview; selection opens the single app-level ArticleReader. */
export const ArticleCard = ({ article }) => {
  const { openArticle, articleState } = useLibrary();
  const categoryLabel = article.category || 'General';
  const badgeColor = CATEGORY_COLORS[article.category] || CATEGORY_COLOR_DEFAULT;
  // Repeated links share one reading flag even when displayed in different editions.
  const read = articleState[articleId(article)]?.read;

  return (
    <View style={[styles.card, read && styles.readCard]}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Read summary: ${article.title}`}
        onPress={() => openArticle(article)} activeOpacity={0.8}>
        <View style={styles.headerRow}>
          <View style={[styles.badge, { backgroundColor: hexToRgba(badgeColor, 0.16) }]}>
            <Text style={[styles.category, { color: badgeColor }]}>{categoryLabel.toUpperCase()}</Text>
          </View>
          {/* This duration describes the linked article, not the short email summary. */}
          {article.readingMinutes ? <Text style={styles.time}>{article.readingMinutes} min · source</Text> : null}
        </View>
        <Text style={styles.title}>{article.title}</Text>
        <Text style={styles.provenance}>{[article.date, article.section].filter(Boolean).join(' · ')}</Text>
        <Text style={styles.summary} numberOfLines={3}>{article.summary || 'Open the original source to read this content.'}</Text>
        {article.occurrences?.length > 1 && <Text style={styles.provenance}>Appears in {article.occurrences.length} editions · {article.categories.join(', ')}</Text>}
        {!article.sourceVerified && <Text style={styles.provenance}>Unverified edition</Text>}
        <Text style={styles.hint}>Read summary →</Text>
      </TouchableOpacity>
      {/* Separate buttons avoid opening the reader when saving or toggling read state. */}
      <ArticleActions article={article} />
    </View>
  );
};
