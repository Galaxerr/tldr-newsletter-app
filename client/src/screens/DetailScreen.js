// src/screens/DetailScreen.js
import React from 'react';
import { View, FlatList, Text, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArticleCard } from '../components/ArticleCard';
import { COLORS, CATEGORY_COLORS, CATEGORY_COLOR_DEFAULT, hexToRgba } from '../theme/colors';
import { styles } from '../theme/css/DetailScreenStyles';

const EmptyArticles = () => (
  <View style={styles.emptyState}>
    <Text style={styles.emptyGlyph}>🗞️</Text>
    <Text style={styles.emptyTitle}>Nessun articolo in questa edizione</Text>
    <Text style={styles.emptySubtitle}>
      Questa newsletter non contiene articoli da mostrare.
    </Text>
  </View>
);

export const DetailScreen = ({ route }) => {
  const { newsletter } = route.params;
  const categoryLabel = newsletter.category || 'Generale';
  const badgeColor = CATEGORY_COLORS[newsletter.category] || CATEGORY_COLOR_DEFAULT;
  const articles = newsletter.articles || [];

  return (
    <SafeAreaView style={styles.safeArea}>
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
            {newsletter.date ? <Text style={styles.meta}>{newsletter.date}</Text> : null}
            {newsletter.date && articles.length ? <Text style={styles.metaDot}>·</Text> : null}
            {articles.length ? (
              <Text style={styles.meta}>
                {articles.length} {articles.length === 1 ? 'articolo' : 'articoli'}
              </Text>
            ) : null}
          </View>
        </View>

        <FlatList
          data={articles}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ArticleCard article={{ ...item, category: newsletter.category }} />
          )}
          ListEmptyComponent={<EmptyArticles />}
          contentContainerStyle={articles.length ? styles.listPadding : styles.listPaddingEmpty}
        />
      </View>
    </SafeAreaView>
  );
};
