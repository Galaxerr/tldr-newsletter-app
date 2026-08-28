// src/components/CategoryCard.js
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { COLORS, CATEGORY_COLORS, CATEGORY_COLOR_DEFAULT, hexToRgba } from '../theme/colors';
import { styles } from '../theme/css/CategoryCardStyles';

export const CategoryCard = ({ item, onPress }) => {
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

      <View style={styles.footerRow}>
        <Text style={styles.countText}>
          {articlesCount} {articlesCount === 1 ? 'articolo' : 'articoli'}
        </Text>
        <Text style={[styles.linkText, { color: badgeColor }]}>Leggi ora →</Text>
      </View>
    </TouchableOpacity>
  );
};
