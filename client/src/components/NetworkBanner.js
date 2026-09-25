// src/components/NetworkBanner.js
import { View, Text, StyleSheet } from 'react-native';
import { useLibrary } from '../context/LibraryContext';
import { COLORS } from '../theme/colors';

export function NetworkBanner() {
  const { isOnline } = useLibrary();
  if (isOnline) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>No internet connection</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: COLORS.error, paddingVertical: 6, alignItems: 'center' },
  text: { color: COLORS.textOnColor, fontSize: 12, fontWeight: '600' },
});
