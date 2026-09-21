import { useState } from 'react';
import { Alert, Text, TouchableOpacity } from 'react-native';
import { useLibrary } from '../context/LibraryContext';
import { styles } from '../theme/css/AuthScreenStyles';

export function DeleteLocalDataButton() {
  const { clearLocalData } = useLibrary();
  const [busy, setBusy] = useState(false);
  const confirm = () => Alert.alert('Delete local data?',
    'This will delete this account’s summaries, bookmarks, and reading status from the device and sign you out. Your emails will remain available in Gmail.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setBusy(true);
        try {
          await clearLocalData();
        } finally {
          setBusy(false);
        }
      } },
    ]);
  return <TouchableOpacity accessibilityRole="button" disabled={busy} style={styles.button} onPress={confirm}>
    <Text style={styles.buttonText}>{busy ? 'Deleting…' : 'Delete local data for this account'}</Text>
  </TouchableOpacity>;
}
