import { StyleSheet } from 'react-native';
import { COLORS } from '../colors';

// Shared visual rules for article previews, bookmark/read actions and the summary modal.
export const styles = StyleSheet.create({
  // A changed border signals reviewed content without dimming the readable text.
  readCard: { borderColor: COLORS.textTertiary },
  // Compact newsletter date/section metadata, allowed to wrap on narrow screens.
  provenance: { color: COLORS.textSecondary, fontSize: 11, lineHeight: 17, marginBottom: 8, flexShrink: 1 },
  // Independent actions wrap if needed; button height keeps them easy to tap.
  articleActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, borderTopWidth: 1, borderTopColor: COLORS.surfaceBorder, marginTop: 12, paddingTop: 4 },
  actionButton: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' },
  actionText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  actionActive: { color: COLORS.accent },
  // Supporting context below the modal's full summary.
  readerMeta: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 16 },
  readerContent: { paddingBottom: 12 },
  // Feed card surface and internal title/summary typography.
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.surfaceBorder,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  category: {
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 0.3,
  },
  time: { fontSize: 12, color: COLORS.textTertiary },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  summary: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: 8,
  },
  hint: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.accent,
  },
  // Dimmed dismiss area; the reader occupies at most 80% of available height.
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 22, 28, 0.78)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 20,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: COLORS.surfaceBorder,
  },
  // Let long summaries shrink into a scroll area so bottom actions stay accessible.
  modalScroll: {
    marginVertical: 12,
    flexShrink: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  modalSummary: {
    fontSize: 15,
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
  closeButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textTertiary,
  },
  // Full-width source action centers its label under the local reading controls.
  sourceButton: {
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: COLORS.accent,
    borderRadius: 10,
  },
  sourceButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.background,
  },
});
