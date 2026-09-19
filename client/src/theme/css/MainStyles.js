import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121212',
  },
  tabBar: {
    backgroundColor: '#1c1c1e',
    borderTopColor: '#2c2c2e',
  },
  stackHeader: {
    backgroundColor: '#1c1c1e',
  },
  loadingText: { color: '#9ca3af', marginTop: 12, fontSize: 14 },
  errorTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  errorMessage: {
    color: '#9ca3af',
    fontSize: 14,
    marginBottom: 20,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  retryButton: { backgroundColor: '#3b82f6', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '600' },
});

export const navigationStyles = {
  tabBarInactiveTintColor: '#8e8e93',
  headerTintColor: '#fff',
};