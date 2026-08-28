// src/screens/ArchiveScreen.js
import React, { useState } from 'react';
import { View, FlatList, Text, ActivityIndicator, TouchableOpacity, ScrollView } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { fetchArchiveNewsletters } from '../services/gmail';
import { CategoryCard } from '../components/CategoryCard';
import { styles } from '../theme/css/ArchiveScreenStyles';

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
