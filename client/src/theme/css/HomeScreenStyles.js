import { StyleSheet } from 'react-native';
import { COLORS, FONTS } from '../colors';

export const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  masthead: { paddingHorizontal: 20, paddingTop: 32, paddingBottom: 20 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 18 },
  wordmark: { fontSize: 15, fontWeight: '800', letterSpacing: 3, color: COLORS.accent },
  eyebrow: { fontSize: 11, fontWeight: '600', letterSpacing: 2, color: COLORS.textTertiary, marginLeft: 8, fontFamily: FONTS.mono },
  greeting: { fontSize: 30, fontWeight: '800', color: COLORS.textPrimary, letterSpacing: -0.5 },
  date: { fontSize: 15, color: COLORS.textSecondary, marginTop: 4 },
  hairline: { height: 1, backgroundColor: COLORS.surfaceBorder, marginTop: 18, marginBottom: 14 },
  statBadgeText: { color: COLORS.accent, fontSize: 12, fontWeight: '700' },
  emptyState: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 60 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  listPadding: { paddingHorizontal: 16, paddingBottom: 32 },
  listPaddingEmpty: { flexGrow: 1, paddingHorizontal: 16, paddingBottom: 32 },
});
