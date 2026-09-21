import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../theme/colors';
import { styles } from '../theme/css/MainStyles';

// Local body-read errors do not block navigation or replace the account's metadata.
export function ContentStatus({ loading, error, retry }) {
  return <View style={styles.center}>
    {loading ? <><ActivityIndicator color={COLORS.accent} /><Text style={styles.loadingText}>Loading saved content…</Text></> : <>
      <Text accessibilityRole="alert" style={styles.errorMessage}>{error}</Text>
      <TouchableOpacity accessibilityRole="button" onPress={retry} style={styles.retryButton}>
        <Text style={styles.retryText}>Try again</Text>
      </TouchableOpacity>
    </>}
  </View>;
}
