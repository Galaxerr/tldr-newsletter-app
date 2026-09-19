import React from 'react';
import { Text, Linking, Alert, Modal, ScrollView, Pressable, View, TouchableOpacity } from 'react-native';
import { useLibrary } from '../context/LibraryContext';
import { useToast } from '../context/ToastContext';
import { validateArticleUrl } from '../services/articleIdentity';
import { ArticleActions } from './ArticleActions';
import { styles } from '../theme/css/ArticleCardStyles';

// The reader lives outside the list so filtering/removing a saved article does
// not close its summary while the user is reading.
export function ArticleReader() {
  const { selectedArticle: article, closeArticle, isOnline } = useLibrary();
  const { show } = useToast();
  if (!article) return null;
  const destination = validateArticleUrl(article.url);
  // The stored summary needs no network. Only opening the original website does.
  const openSource = async () => {
    if (!isOnline) {
      show('The original source requires an internet connection. The summary is available offline.');
      return;
    }
    if (!article.sourceVerified || !destination) return;
    const open = () => Linking.openURL(destination.url).catch(() => show('Unable to open the original source.', 'error'));
    if (destination.insecure) {
      Alert.alert('Unencrypted connection', `Open ${destination.hostname} over HTTP? The connection to this site is not secure.`, [
        { text: 'Cancel', style: 'cancel' }, { text: 'Open website', onPress: open },
      ]);
    } else await open();
  };
  // Native back dismissal and backdrop taps both clear the shared reader selection.
  return (
    <Modal visible animationType="fade" transparent onRequestClose={closeArticle}>
      <Pressable style={styles.backdrop} onPress={closeArticle} accessible={false}>
        <Pressable style={styles.modalCard} onPress={() => {}} accessible={false} accessibilityViewIsModal>
          <View style={styles.headerRow}>
            <Text style={styles.provenance}>{article.category} · {article.date}</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close summary" onPress={closeArticle} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
          {/* Scroll long, selectable summaries while keeping actions outside the scroll area. */}
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.readerContent}>
            <Text selectable style={styles.modalTitle}>{article.title}</Text>
            <Text style={styles.provenance}>Newsletter summary · available offline</Text>
            <Text selectable style={styles.modalSummary}>{article.summary || 'This resource has no summary in the newsletter.'}</Text>
            {article.readingMinutes ? <Text style={styles.readerMeta}>Estimated reading time for the original source: {article.readingMinutes} min.</Text> : null}
            {article.subject && <Text style={styles.readerMeta}>From: {article.subject}</Text>}
            {article.occurrences?.length > 1 && (
              <Text style={styles.readerMeta}>Other editions: {article.occurrences.slice(1).map((item) => `${item.category} · ${item.date}`).join('; ')}</Text>
            )}
          </ScrollView>
          {/* Removing a bookmark may remove its card, but this reader remains mounted. */}
          <ArticleActions article={article} />
          {!article.sourceVerified && <Text style={styles.readerMeta}>Unverified edition. Sync with Gmail to verify the source.</Text>}
          {destination && <Text selectable style={styles.readerMeta}>Destination: {destination.hostname}{destination.insecure ? ' · HTTP' : ''}</Text>}
          <TouchableOpacity accessibilityRole="button" disabled={!article.sourceVerified || !destination} onPress={openSource} style={styles.sourceButton}>
            <Text style={styles.sourceButtonText}>Read original source {isOnline ? '↗' : '· online'}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
