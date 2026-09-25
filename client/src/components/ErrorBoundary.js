// src/components/ErrorBoundary.js
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS } from '../theme/colors';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    console.error('Interface error (UI-01)');
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            An unexpected error occurred. Try again. (UI-01)
          </Text>
          <TouchableOpacity style={styles.button} onPress={this.handleReset}>
            <Text style={styles.buttonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: COLORS.errorBackground },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.textOnColor, marginBottom: 8 },
  message: { fontSize: 14, color: COLORS.feedbackTextMuted, textAlign: 'center', marginBottom: 20 },
  button: { backgroundColor: COLORS.info, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  buttonText: { color: COLORS.textOnColor, fontWeight: '600' },
});
