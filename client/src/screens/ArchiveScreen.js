// src/screens/ArchiveScreen.js
import React, { useState } from 'react';
import { View, FlatList, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { fetchArchiveNewsletters } from '../services/gmail';
import { CategoryCard } from '../components/CategoryCard';

const CATEGORIES = ['Tutte', 'Tech', 'AI', 'InfoSec', 'Dev', 'IT'];

export const ArchiveScreen = ({ token, navigation }) => {
  const [selectedCategory, setSelectedCategory] = useState('Tutte');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['archiveNewsletters', token],
    queryFn: () => fetchArchiveNewsletters(token),
    enabled: !!token,
  });

  const filteredNewsletters = data?.filter((item) => 
    selectedCategory === 'Tutte' ? true : item.category === selectedCategory
  ) || [];

  return (
    <View style={styles.container}>
      <Text style={styles.screenTitle}>Archivio 7 Giorni</Text>
      
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.chip, selectedCategory === cat && styles.activeChip]}
              onPress={() => setSelectedCategory(cat)}
            >
              <Text style={[styles.chipText, selectedCategory === cat && styles.activeChipText]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#3b82f6" /></View>
      ) : (
        <FlatList
          data={filteredNewsletters}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <CategoryCard item={item} onPress={() => navigation.navigate('Detail', { newsletter: item })} />
          )}
          onRefresh={refetch}
          refreshing={isLoading}
          contentContainerStyle={styles.listPadding}
          ListEmptyComponent={
            <Text style={styles.emptyText}>Nessuna newsletter trovata per questa categoria nell'ultima settimana.</Text>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  screenTitle: { fontSize: 28, fontWeight: 'bold', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 12, color: '#ffffff' },
  filterContainer: { marginBottom: 12 },
  filterScroll: { paddingHorizontal: 16, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#1e1e1e', borderWidth: 1, borderColor: '#2c2c2e' },
  activeChip: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  chipText: { color: '#a1a1a6', fontSize: 13, fontWeight: '600' },
  activeChipText: { color: '#ffffff' },
  listPadding: { paddingHorizontal: 16, paddingBottom: 24 },
  emptyText: { color: '#8e8e93', textAlign: 'center', marginTop: 40, paddingHorizontal: 20 },
});