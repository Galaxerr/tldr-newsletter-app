// src/components/ArticleCard.js
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';

export const ArticleCard = ({ article }) => {
  const handlePress = () => {
    if (article.url) {
      Linking.openURL(article.url);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.category}>{article.category.toUpperCase()}</Text>
        <Text style={styles.time}>{article.readingTime}</Text>
      </View>
      <Text style={styles.title}>{article.title}</Text>
      <Text style={styles.summary}>{article.summary}</Text>
      <TouchableOpacity style={styles.button} onPress={handlePress}>
        <Text style={styles.buttonText}>Leggi fonte originale →</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1e1e1e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  category: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0066cc',
  },
  time: {
    fontSize: 12,
    color: '#888',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  summary: {
    fontSize: 14,
    color: '#6d6d6d',
    lineHeight: 20,
    marginBottom: 12,
  },
  button: {
    alignSelf: 'flex-start',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0066cc',
  },
});