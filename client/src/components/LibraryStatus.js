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
        {syncMode === 'older' ? 'Importazione delle edizioni precedenti…' : `Carica 30 giorni precedenti al ${new Date(historyBefore * 1000).toLocaleDateString('it-IT')}`}
      </Text>
    </TouchableOpacity>
  );
  return (
    <View style={styles.syncPanel}>
      {/* Retry the failed operation's mode, which may be refresh or older-history import. */}
      <View style={styles.syncRow}>
        <Text style={styles.caption}>
          {syncMode ? `Importazione in corso · ${progress} edizioni` :
            lastSyncedAt ? `Ultima sincronizzazione: ${new Date(lastSyncedAt).toLocaleString('it-IT')}` :
              'Importa le newsletter degli ultimi 30 giorni.'}
        </Text>
        {syncMode ? <ActivityIndicator color={COLORS.accent} /> : (
          <TouchableOpacity accessibilityRole="button" onPress={() => sync(syncError ? lastSyncMode : 'refresh')} style={styles.smallButton}>
            <Text style={styles.buttonText}>{syncError ? 'Riprova' : 'Sincronizza'}</Text>
          </TouchableOpacity>
        )}
      </View>
      {!isOnline && <Text style={styles.caption}>Offline · ricerca, salvati e sommari disponibili su questo dispositivo.</Text>}
      {syncError && <Text accessibilityRole="alert" style={styles.error}>{syncError}</Text>}
      {/* Counters describe the last operation, including unsupported/deleted messages. */}
      {lastImport && !syncMode && (
        <Text style={styles.caption}>
          {lastImport.imported ? `${lastImport.imported} nuove edizioni importate.` : 'Nessuna nuova edizione nel periodo controllato.'}
          {lastImport.skipped > 0 ? ` ${lastImport.skipped} messaggi senza articoli compatibili o non più disponibili.` : ''}
        </Text>
      )}
    </View>
  );
}
