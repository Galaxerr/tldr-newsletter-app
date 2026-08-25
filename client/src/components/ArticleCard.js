// src/components/ArticleCard.js
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Modal, ScrollView, Pressable } from 'react-native';

export const ArticleCard = ({ article }) => {
  const [isModalVisible, setModalVisible] = useState(false);

  const openModal = () => setModalVisible(true);
  const closeModal = () => setModalVisible(false);

  const openSource = () => {
    if (article.url) {
      Linking.openURL(article.url);
    }
  };

  return (
    <>
      <TouchableOpacity style={styles.card} onPress={openModal} activeOpacity={0.8}>
        <View style={styles.headerRow}>
          <Text style={styles.category}>{article.category.toUpperCase()}</Text>
          <Text style={styles.time}>{article.readingTime}</Text>
        </View>
        <Text style={styles.title}>{article.title}</Text>
        <Text style={styles.summary} numberOfLines={3}>
          {article.summary}
        </Text>
        <Text style={styles.hint}>Tocca per leggere il sommario →</Text>
      </TouchableOpacity>

      <Modal
        visible={isModalVisible}
        animationType="fade"
        transparent
        onRequestClose={closeModal} // gestisce il tasto "indietro" su Android
      >
        {/* Il backdrop chiude il popup se toccato fuori dal contenuto */}
        <Pressable style={styles.backdrop} onPress={closeModal}>
          {/* Pressable interno "assorbe" il tap per non propagarlo al backdrop */}
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.headerRow}>
              <Text style={styles.category}>{article.category.toUpperCase()}</Text>
              <Text style={styles.time}>{article.readingTime}</Text>
            </View>

            <ScrollView style={styles.modalScroll}>
              <Text style={styles.modalTitle}>{article.title}</Text>
              <Text style={styles.modalSummary}>{article.summary}</Text>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.closeButton} onPress={closeModal}>
                <Text style={styles.closeButtonText}>Chiudi</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sourceButton} onPress={openSource}>
                <Text style={styles.sourceButtonText}>Leggi fonte originale →</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1e1e1e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  category: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0066cc',
  },
  time: {
    fontSize: 12,
    color: '#888',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  summary: {
    fontSize: 14,
    color: '#6d6d6d',
    lineHeight: 20,
    marginBottom: 8,
  },
  hint: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0066cc',
  },

  // --- Modal ---
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#1e1e1e',
    borderRadius: 16,
    padding: 20,
    maxHeight: '80%',
  },
  modalScroll: {
    marginVertical: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 12,
  },
  modalSummary: {
    fontSize: 15,
    color: '#c0c0c0',
    lineHeight: 22,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  closeButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
  },
  sourceButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#0066cc',
    borderRadius: 8,
  },
  sourceButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
});