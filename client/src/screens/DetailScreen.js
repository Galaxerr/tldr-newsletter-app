// src/screens/DetailScreen.js
import React from 'react';
import { View, FlatList, Text, StyleSheet } from 'react-native';
import { ArticleCard } from '../components/ArticleCard';

export const DetailScreen = ({ route }) => {
  const { newsletter } = route.params;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.category}>{newsletter.category.toUpperCase()}</Text>
        <Text style={styles.title}>{newsletter.subject}</Text>
        <Text style={styles.date}>{newsletter.date}</Text>
      </View>
      <FlatList
        data={newsletter.articles}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ArticleCard article={{ ...item, category: newsletter.category }} />}
        contentContainerStyle={styles.listPadding}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#2d2d2d' },
  header: { padding: 16, backgroundColor: '#1e1e1e', borderBottomWidth: 1, borderBottomColor: '#666' },
  category: { fontSize: 12, fontWeight: 'bold', color: '#0066cc', marginBottom: 4 },
  title: { fontSize: 18, fontWeight: 'bold', color: '#ffffff', marginBottom: 4 },
  date: { fontSize: 12, color: '#888' },
  listPadding: { padding: 16 },
});