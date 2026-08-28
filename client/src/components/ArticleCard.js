// src/components/ArticleCard.js
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Linking, Modal, ScrollView, Pressable } from 'react-native';
import { styles } from '../theme/css/ArticleCardStyles';

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
