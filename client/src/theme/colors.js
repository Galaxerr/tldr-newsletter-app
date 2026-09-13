// src/theme/colors.js
import { Platform } from 'react-native';

export const COLORS = {
  background: '#14161C',
  surface: '#1C1F28',
  surfaceBorder: '#2A2E3A',
  accent: '#E3A33E',
  accentMuted: 'rgba(227, 163, 62, 0.14)',
  textPrimary: '#F5F3EE',
  textSecondary: '#9AA0AC',
  textTertiary: '#6B7280',
  danger: '#E5696D',
  dangerMuted: 'rgba(229, 105, 109, 0.12)',
};

export const FONTS = {
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
};

// Tonalità delle categorie: deliberatamente distinte dall'accent dorato
// dell'app, per non creare ambiguità con badge "attivo"/notifica.
export const CATEGORY_COLORS = {
  Tech: '#5B8DEF',
  AI: '#A385E0',
  InfoSec: '#E5696D',
  Dev: '#4FBE8E',
  IT: '#4FB6C4',
  // Hardware participates in the same badge system as all other library categories.
  Hardware: '#D89563',
};

export const CATEGORY_COLOR_DEFAULT = '#8B93A7';

export function hexToRgba(hex, alpha) {
  const parsed = hex.replace('#', '');
  const bigint = parseInt(parsed, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
