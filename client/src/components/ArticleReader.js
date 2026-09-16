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
      show('La fonte originale richiede Internet. Il sommario è disponibile offline.');
      return;
    }
    if (!article.sourceVerified || !destination) return;
    const open = () => Linking.openURL(destination.url).catch(() => show('Impossibile aprire la fonte originale.', 'error'));
    if (destination.insecure) {
      Alert.alert('Connessione non cifrata', `Aprire ${destination.hostname} tramite HTTP? La connessione al sito non è protetta.`, [
        { text: 'Annulla', style: 'cancel' }, { text: 'Apri sito', onPress: open },
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
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Chiudi sommario" onPress={closeArticle} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>Chiudi</Text>
            </TouchableOpacity>
          </View>
          {/* Scroll long, selectable summaries while keeping actions outside the scroll area. */}
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.readerContent}>
            <Text selectable style={styles.modalTitle}>{article.title}</Text>
            <Text style={styles.provenance}>Sommario della newsletter · disponibile offline</Text>
            <Text selectable style={styles.modalSummary}>{article.summary || 'Questa risorsa non contiene un sommario nella newsletter.'}</Text>
            {article.readingMinutes ? <Text style={styles.readerMeta}>Tempo indicato per la fonte originale: {article.readingMinutes} min.</Text> : null}
            {article.subject && <Text style={styles.readerMeta}>Da: {article.subject}</Text>}
            {article.occurrences?.length > 1 && (
              <Text style={styles.readerMeta}>Altre edizioni: {article.occurrences.slice(1).map((item) => `${item.category} · ${item.date}`).join('; ')}</Text>
            )}
          </ScrollView>
          {/* Removing a bookmark may remove its card, but this reader remains mounted. */}
          <ArticleActions article={article} />
          {!article.sourceVerified && <Text style={styles.readerMeta}>Edizione non verificata. Sincronizza con Gmail per verificare la fonte.</Text>}
          {destination && <Text selectable style={styles.readerMeta}>Destinazione: {destination.hostname}{destination.insecure ? ' · HTTP' : ''}</Text>}
          <TouchableOpacity accessibilityRole="button" disabled={!article.sourceVerified || !destination} onPress={openSource} style={styles.sourceButton}>
            <Text style={styles.sourceButtonText}>Leggi fonte originale {isOnline ? '↗' : '· online'}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
