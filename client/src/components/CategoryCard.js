// src/components/CategoryCard.js
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

const CATEGORY_COLORS = {
  Tech: '#3b82f6',
  AI: '#a855f7',
  InfoSec: '#ef4444',
  Dev: '#10b981',
  IT: '#f59e0b',
};

export const CategoryCard = ({ item, onPress }) => {
  const badgeColor = CATEGORY_COLORS[item.category] || '#3b82f6';

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.topRow}>
        <View style={[styles.badge, { backgroundColor: badgeColor }]}>
          <Text style={styles.badgeText}>{item.category.toUpperCase()}</Text>
        </View>
        <Text style={styles.date}>{item.date}</Text>
      </View>
      <Text style={styles.subject} numberOfLines={2}>{item.subject}</Text>
      <View style={styles.footerRow}>
        <Text style={styles.countText}>{item.articlesCount} articoli</Text>
        <Text style={[styles.linkText, { color: badgeColor }]}>Leggi ora →</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1e1e1e',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2c2c2e',
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  badgeText: { color: '#ffffff', fontSize: 11, fontWeight: 'bold' },
  date: { fontSize: 12, color: '#8e8e93' },
  subject: { fontSize: 16, fontWeight: 'bold', color: '#ffffff', marginBottom: 12, lineHeight: 22 },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  countText: { fontSize: 13, color: '#a1a1a6' },
  linkText: { fontSize: 14, fontWeight: '600' },
});