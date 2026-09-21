import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLibrary } from '../context/LibraryContext';
import { COLORS } from '../theme/colors';
import { styles } from '../theme/css/FeedScreenStyles';

/** Sync feedback is metadata-only and remains visible during lazy body reads. */
export function LibraryStatus() {
  const { syncing, syncError, cleanupError, lastSyncedAt, lastImport, progress, isOnline, sync } = useLibrary();
  return (
    <View style={styles.syncPanel}>
      {/* A refresh always checks the same rolling seven-day window. */}
      <View style={styles.syncRow}>
        <Text style={styles.caption}>
          {syncing ? `Importing · ${progress} editions` :
            lastSyncedAt ? `Last synced: ${new Date(lastSyncedAt).toLocaleString('en-US')}` :
              'Import newsletters from the last seven days.'}
        </Text>
        {syncing ? <ActivityIndicator color={COLORS.accent} /> : (
          <TouchableOpacity accessibilityRole="button" onPress={() => sync()} style={styles.smallButton}>
            <Text style={styles.buttonText}>{syncError ? 'Try again' : 'Sync'}</Text>
          </TouchableOpacity>
        )}
      </View>
      {!isOnline && <Text style={styles.caption}>Offline · search, bookmarks, and summaries are available on this device.</Text>}
      {cleanupError && <Text accessibilityRole="alert" style={styles.error}>{cleanupError}</Text>}
      {syncError && <Text accessibilityRole="alert" style={styles.error}>{syncError}</Text>}
      {/* Counters describe the last operation, including unsupported/deleted messages. */}
      {lastImport && !syncing && (
        <Text style={styles.caption}>
          {lastImport.imported ? `${lastImport.imported} new editions imported.` : 'No new editions in the selected date range.'}
          {lastImport.skipped > 0 ? ` ${lastImport.skipped} messages skipped.` : ''}
          {lastImport.rejected?.unverified > 0 ? ` ${lastImport.rejected.unverified} not verified as coming directly from TLDR.` : ''}
          {lastImport.rejected?.oversized > 0 ? ` ${lastImport.rejected.oversized} too large or complex.` : ''}
        </Text>
      )}
    </View>
  );
}
