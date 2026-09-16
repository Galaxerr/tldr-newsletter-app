import React, { useState } from 'react';
import { Alert, Text, TouchableOpacity } from 'react-native';
import { useLibrary } from '../context/LibraryContext';
import { styles } from '../theme/css/AuthScreenStyles';

export function DeleteLocalDataButton() {
  const { clearLocalData } = useLibrary();
  const [busy, setBusy] = useState(false);
  const confirm = () => Alert.alert('Eliminare i dati locali?',
    'Saranno eliminati sommari, salvati e stato di lettura di questo account dal dispositivo. Uscirai dall’account. Le email su Gmail rimangono disponibili.', [
      { text: 'Annulla', style: 'cancel' },
      { text: 'Elimina', style: 'destructive', onPress: async () => {
        setBusy(true);
        try {
          await clearLocalData();
        } finally {
          setBusy(false);
        }
      } },
    ]);
  return <TouchableOpacity accessibilityRole="button" disabled={busy} style={styles.button} onPress={confirm}>
    <Text style={styles.buttonText}>{busy ? 'Eliminazione in corso…' : 'Elimina dati locali di questo account'}</Text>
  </TouchableOpacity>;
}
