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
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: 'bold', letterSpacing: 0.3 },
  date: { fontSize: 12, color: COLORS.textTertiary },
  subject: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
    marginBottom: 12,
    lineHeight: 22,
  },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  countText: { fontSize: 13, color: COLORS.textSecondary },
  linkText: { fontSize: 14, fontWeight: '600' },
});
