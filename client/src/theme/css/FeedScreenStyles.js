import { StyleSheet } from 'react-native';
import { COLORS, FONTS } from '../colors';

// Shared layout for Feed/Saved and their synchronization controls.
export const styles = StyleSheet.create({
  // Screen background and scroll-content spacing.
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  list: { padding: 16, paddingBottom: 32 },
  // Masthead hierarchy: small brand label, main title, supporting description.
  wordmark: { color: COLORS.accent, fontFamily: FONTS.mono, fontSize: 11, letterSpacing: 2, marginTop: 18, marginBottom: 14 },
  title: { color: COLORS.textPrimary, fontSize: 30, fontWeight: '800' },
  subtitle: { color: COLORS.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 6, marginBottom: 16 },
  // Search field and clear action share a bordered row with a flexible text input.
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.surfaceBorder, borderRadius: 12, marginBottom: 14 },
  search: { flex: 1, color: COLORS.textPrimary, padding: 14, fontSize: 15, minHeight: 48 },
  // Category/reading chips; selected controls use the app's gold accent.
  filters: { flexDirection: 'row', flexWrap: 'nowrap', gap: 8, paddingBottom: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.surfaceBorder },
  activeChip: { backgroundColor: COLORS.accentMuted, borderColor: COLORS.accent },
  chipText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  activeText: { color: COLORS.accent },
  // Sync metadata can wrap while keeping its adjacent action visible.
  syncPanel: { paddingVertical: 12, gap: 8 },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  caption: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18, flexShrink: 1 },
  // Touch targets for search and filter controls.
  smallButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 },
  buttonText: { color: COLORS.accent, fontWeight: '600', fontSize: 13 },
  loadButton: { padding: 14, borderRadius: 10, borderWidth: 1, borderColor: COLORS.surfaceBorder, alignItems: 'center', marginVertical: 8 },
  // Feedback for failed imports, filtered result counts and empty lists.
  error: { color: COLORS.danger, fontSize: 13, lineHeight: 19 },
  resultCount: { color: COLORS.textTertiary, fontSize: 12, marginVertical: 12 },
  empty: { paddingVertical: 28, alignItems: 'center' },
  emptyTitle: { color: COLORS.textPrimary, fontSize: 20, fontWeight: '700', textAlign: 'center' },
});
