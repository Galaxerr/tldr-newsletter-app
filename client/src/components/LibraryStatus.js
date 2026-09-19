import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLibrary } from '../context/LibraryContext';
import { COLORS } from '../theme/colors';
import { styles } from '../theme/css/FeedScreenStyles';

/** Shared sync feedback; older=true renders only the history-loading footer button. */
export function LibraryStatus({ older = false }) {
  const { syncMode, lastSyncMode, syncError, lastSyncedAt, lastImport, progress, isOnline, sync, historyBefore } = useLibrary();
  // An older boundary exists only after a complete import. Disable duplicate requests
  // while any sync is active; failed history imports leave the boundary unchanged.
  if (older) return historyBefore === null ? null : (
    <TouchableOpacity accessibilityRole="button" disabled={!!syncMode} onPress={() => sync('older')} style={styles.loadButton}>
      <Text style={[styles.buttonText, syncMode && styles.disabled]}>
        {syncMode === 'older' ? 'Importing older editions…' : `Load 30 days before ${new Date(historyBefore * 1000).toLocaleDateString('en-US')}`}
      </Text>
    </TouchableOpacity>
  );
  return (
    <View style={styles.syncPanel}>
      {/* Retry the failed operation's mode, which may be refresh or older-history import. */}
      <View style={styles.syncRow}>
        <Text style={styles.caption}>
          {syncMode ? `Importing · ${progress} editions` :
            lastSyncedAt ? `Last synced: ${new Date(lastSyncedAt).toLocaleString('en-US')}` :
              'Import newsletters from the last 30 days.'}
        </Text>
        {syncMode ? <ActivityIndicator color={COLORS.accent} /> : (
          <TouchableOpacity accessibilityRole="button" onPress={() => sync(syncError ? lastSyncMode : 'refresh')} style={styles.smallButton}>
            <Text style={styles.buttonText}>{syncError ? 'Try again' : 'Sync'}</Text>
          </TouchableOpacity>
        )}
      </View>
      {!isOnline && <Text style={styles.caption}>Offline · search, bookmarks, and summaries are available on this device.</Text>}
      {syncError && <Text accessibilityRole="alert" style={styles.error}>{syncError}</Text>}
      {/* Counters describe the last operation, including unsupported/deleted messages. */}
      {lastImport && !syncMode && (
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
