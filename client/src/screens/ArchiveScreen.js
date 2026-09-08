// src/screens/ArchiveScreen.js
import React, { useState } from 'react';
import { View, FlatList, Text, ActivityIndicator, TouchableOpacity, ScrollView, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { fetchArchiveNewsletters } from '../services/gmail';
import { CategoryCard } from '../components/CategoryCard';
import { COLORS } from '../theme/colors';
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
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.container}>
        <View style={styles.masthead}>
          <View style={styles.eyebrowRow}>
            <Text style={styles.wordmark}>TLDR</Text>
            <Text style={styles.eyebrow}>ARCHIVIO</Text>
          </View>
          <Text style={styles.screenTitle}>Le ultime edizioni</Text>
          <Text style={styles.screenSubtitle}>Ritrova le newsletter degli ultimi 7 giorni.</Text>
        </View>
      
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
          <View style={styles.center}><ActivityIndicator size="large" color={COLORS.accent} /></View>
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
              <Text style={styles.emptyText}>Nessuna newsletter trovata per questa categoria nell&apos;ultima settimana.</Text>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
};
