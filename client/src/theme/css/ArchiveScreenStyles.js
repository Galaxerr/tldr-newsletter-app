import { StyleSheet } from 'react-native';
import { COLORS, FONTS } from '../colors';

export const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1, backgroundColor: COLORS.background },
  masthead: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 18 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 16 },
  wordmark: { fontSize: 15, fontWeight: '800', letterSpacing: 3, color: COLORS.accent },
  eyebrow: { fontSize: 11, fontWeight: '600', letterSpacing: 2, color: COLORS.textTertiary, marginLeft: 8, fontFamily: FONTS.mono },
  screenTitle: { fontSize: 30, fontWeight: '800', color: COLORS.textPrimary },
  screenSubtitle: { fontSize: 14, color: COLORS.textSecondary, marginTop: 5 },
  filterContainer: { marginBottom: 14 },
  filterScroll: { paddingHorizontal: 16, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.surfaceBorder },
  activeChip: { backgroundColor: COLORS.accentMuted, borderColor: COLORS.accent },
  chipText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  activeChipText: { color: COLORS.accent },
  listPadding: { paddingHorizontal: 16, paddingBottom: 32 },
  emptyText: { color: COLORS.textSecondary, textAlign: 'center', marginTop: 40, paddingHorizontal: 20, lineHeight: 20 },
});
