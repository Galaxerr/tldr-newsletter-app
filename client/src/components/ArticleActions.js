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
        accessibilityLabel={state.bookmarked ? 'Remove bookmark' : 'Save article'}
        accessibilityState={{ selected: !!state.bookmarked }}
        onPress={() => toggleArticle(id, 'bookmarked')} style={styles.actionButton}>
        <Text style={[styles.actionText, state.bookmarked && styles.actionActive]}>{state.bookmarked ? '★ Saved' : '☆ Save'}</Text>
      </TouchableOpacity>
      {/* Only this explicit action marks reading state; viewing/opening a URL does not. */}
      <TouchableOpacity accessibilityRole="button"
        accessibilityLabel={state.read ? 'Mark as unread' : 'Mark as read'}
        accessibilityState={{ selected: !!state.read }}
        onPress={() => toggleArticle(id, 'read')} style={styles.actionButton}>
        <Text style={[styles.actionText, state.read && styles.actionActive]}>{state.read ? '✓ Read' : '○ Unread'}</Text>
      </TouchableOpacity>
    </View>
  );
}
