import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { articleId } from '../services/library';
import { useLibrary } from '../context/LibraryContext';
import { styles } from '../theme/css/ArticleCardStyles';

/** Shared bookmark/read buttons for both cards and the full summary reader. */
export function ArticleActions({ article }) {
  const { articleState, toggleArticle } = useLibrary();
  const id = articleId(article);
  // No record yet means unread and unsaved. Persistence is handled by the store.
  const state = articleState[id] || {};
  return (
    <View style={styles.articleActions}>
      {/* Bookmark and read flags are independent; changing either preserves the other. */}
      <TouchableOpacity accessibilityRole="button"
        accessibilityLabel={state.bookmarked ? 'Rimuovi dai salvati' : 'Salva articolo'}
        accessibilityState={{ selected: !!state.bookmarked }}
        onPress={() => toggleArticle(id, 'bookmarked')} style={styles.actionButton}>
        <Text style={[styles.actionText, state.bookmarked && styles.actionActive]}>{state.bookmarked ? '★ Salvato' : '☆ Salva'}</Text>
      </TouchableOpacity>
      {/* Only this explicit action marks reading state; viewing/opening a URL does not. */}
      <TouchableOpacity accessibilityRole="button"
        accessibilityLabel={state.read ? 'Segna come da leggere' : 'Segna come letto'}
        accessibilityState={{ selected: !!state.read }}
        onPress={() => toggleArticle(id, 'read')} style={styles.actionButton}>
        <Text style={[styles.actionText, state.read && styles.actionActive]}>{state.read ? '✓ Letto' : '○ Da leggere'}</Text>
      </TouchableOpacity>
    </View>
  );
}
