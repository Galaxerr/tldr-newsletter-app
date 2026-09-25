import { StyleSheet } from 'react-native';
import { COLORS } from '../colors';

export const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.startupBackground,
  },
  tabBar: {
    backgroundColor: COLORS.navigationSurface,
    borderTopColor: COLORS.navigationBorder,
  },
  stackHeader: {
    backgroundColor: COLORS.navigationSurface,
  },
  loadingText: { color: COLORS.feedbackTextMuted, marginTop: 12, fontSize: 14 },
  errorTitle: {
    color: COLORS.textOnColor,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  errorMessage: {
    color: COLORS.feedbackTextMuted,
    fontSize: 14,
    marginBottom: 20,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  retryButton: { backgroundColor: COLORS.info, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  retryText: { color: COLORS.textOnColor, fontWeight: '600' },
});

export const navigationStyles = {
  tabBarInactiveTintColor: COLORS.navigationTextInactive,
  headerTintColor: COLORS.textOnColor,
};
