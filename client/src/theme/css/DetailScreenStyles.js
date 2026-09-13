import { StyleSheet } from 'react-native';
import { COLORS } from '../colors';

// Edition-detail layout: metadata header, article list and empty-state presentation.
export const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1, backgroundColor: COLORS.background },
  // Header surface/divider; no outer padding is applied here (preserves current layout).
  header: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceBorder,
  },
  // Category badge and edition title above the date/read-progress row.
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 10,
  },
  badgeText: { fontSize: 11, fontWeight: 'bold', letterSpacing: 0.3 },
  title: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary, lineHeight: 26, marginBottom: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  meta: { fontSize: 13, color: COLORS.textSecondary },
  metaDot: { fontSize: 13, color: COLORS.textTertiary, marginHorizontal: 6 },
  // Keep article-list spacing separate from the header's spacing.
  listPadding: { padding: 16 },
  listPaddingEmpty: { flexGrow: 1, padding: 16 },
  // Centered fallback when an edition has no articles to display.
  emptyState: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 60 },
  emptyGlyph: { fontSize: 40, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 8, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20 },
});
