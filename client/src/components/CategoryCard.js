// src/components/CategoryCard.js
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { CATEGORY_COLORS, CATEGORY_COLOR_DEFAULT, hexToRgba } from '../theme/colors';
import { styles } from '../theme/css/CategoryCardStyles';
import { useLibrary } from '../context/LibraryContext';
import { countRead } from '../services/library';

/** Newsletter-level card reused by latest editions and the full imported archive. */
export const CategoryCard = ({ item, onPress }) => {
  const { articleState } = useLibrary();
  const categoryLabel = item.category || 'Generale';
  const badgeColor = CATEGORY_COLORS[item.category] || CATEGORY_COLOR_DEFAULT;
  const articlesCount = item.articlesCount ?? 0;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.topRow}>
        <View style={[styles.badge, { backgroundColor: hexToRgba(badgeColor, 0.16) }]}>
          <Text style={[styles.badgeText, { color: badgeColor }]}>
            {categoryLabel.toUpperCase()}
          </Text>
        </View>
        {item.date ? <Text style={styles.date}>{item.date}</Text> : null}
      </View>

      <Text style={styles.subject} numberOfLines={2}>
        {item.subject}
      </Text>

      {/* Recalculate progress from shared article state, so other screens update this count. */}
      <View style={styles.footerRow}>
        <Text style={styles.countText}>
          {articlesCount} articoli · {countRead(item.articles || [], articleState)} letti
        </Text>
        <Text style={[styles.linkText, { color: badgeColor }]}>Leggi ora →</Text>
      </View>
    </TouchableOpacity>
  );
};
