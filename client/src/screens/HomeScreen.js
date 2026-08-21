// src/screens/HomeScreen.js
import React from 'react';
import { View, FlatList, Text, StyleSheet, ActivityIndicator, Button } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { fetchLatestNewslettersByCategories } from '../services/gmail';
import { CategoryCard } from '../components/CategoryCard';

export const HomeScreen = ({ token, navigation }) => {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['newslettersByCategories', token],
    queryFn: () => fetchLatestNewslettersByCategories(token),
    enabled: !!token,
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0066cc" />
        <Text style={styles.loadingText}>Sincronizzazione edizioni TLDR...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Errore durante il caricamento</Text>
        <Text style={styles.errorSub}>{error?.message}</Text>
        <Button title="Riprova" onPress={refetch} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.screenTitle}>TLDR Feed</Text>
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <CategoryCard
            item={item}
            onPress={() => navigation.navigate('Detail', { newsletter: item })}
          />
        )}
        onRefresh={refetch}
        refreshing={isLoading}
        contentContainerStyle={styles.listPadding}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#2d2d2d' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingText: { marginTop: 12, color: '#666', fontSize: 14 },
  errorText: { fontSize: 16, fontWeight: 'bold', color: '#cc0000', marginBottom: 8 },
  errorSub: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 16 },
  screenTitle: { fontSize: 28, fontWeight: 'bold', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 16, color: '#fff' },
  listPadding: { paddingHorizontal: 16, paddingBottom: 24 },
});