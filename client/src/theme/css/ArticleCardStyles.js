import { StyleSheet } from 'react-native';
import { COLORS } from '../colors';

export const styles = StyleSheet.create({
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
  modalScroll: {
    marginVertical: 12,
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
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
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
  sourceButton: {
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
