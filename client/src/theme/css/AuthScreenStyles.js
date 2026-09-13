import { StyleSheet } from 'react-native';
import { COLORS } from '../colors';

// Shared layout for the login explanation and the active account's controls.
export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { flexGrow: 1, justifyContent: 'center', padding: 28, gap: 18 },
  title: { color: COLORS.textPrimary, fontSize: 30, fontWeight: '700' },
  text: { color: COLORS.textSecondary, fontSize: 16, lineHeight: 24 },
  email: { color: COLORS.textPrimary, fontSize: 18 },
  error: { color: COLORS.danger, fontSize: 15, lineHeight: 22 },
  button: { backgroundColor: COLORS.surface, padding: 16, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: COLORS.accent, fontSize: 16, fontWeight: '600' },
  googleButton: { alignSelf: 'center' },
});
