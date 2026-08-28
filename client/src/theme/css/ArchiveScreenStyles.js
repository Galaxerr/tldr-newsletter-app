import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
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
