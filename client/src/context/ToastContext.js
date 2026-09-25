// src/context/ToastContext.js
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { COLORS } from '../theme/colors';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null); // { message, type }
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimeout = useRef(null);

  const hide = useCallback(() => {
    Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setToast(null));
  }, [opacity]);

  const show = useCallback(
    (message, type = 'info', duration = 3000) => {
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
      setToast({ message, type });
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      hideTimeout.current = setTimeout(hide, duration);
    },
    [hide, opacity]
  );

  useEffect(() => {
    return () => {
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
    };
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast && (
        <Animated.View
          style={[styles.container, styles[toast.type] || styles.info, { opacity }]}
          pointerEvents="none"
        >
          <Text style={styles.text}>{toast.message}</Text>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

// Hook for use inside components, e.g.: const { show } = useToast(); show('You are offline.');
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 90,
    left: 20,
    right: 20,
    padding: 14,
    borderRadius: 10,
    elevation: 4,
    shadowColor: COLORS.shadow,
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  text: { color: COLORS.textOnColor, textAlign: 'center', fontSize: 14, fontWeight: '500' },
  info: { backgroundColor: COLORS.info },
  error: { backgroundColor: COLORS.error },
});
