import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
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
