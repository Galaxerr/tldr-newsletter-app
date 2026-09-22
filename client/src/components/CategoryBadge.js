import { View, Text } from 'react-native';
import { CATEGORY_COLORS, CATEGORY_COLOR_DEFAULT, hexToRgba } from '../theme/colors';

// Callers retain their badge layout and typography, including Detail's spacing.
export const CategoryBadge = ({ category, style, textStyle }) => {
  const color = CATEGORY_COLORS[category] || CATEGORY_COLOR_DEFAULT;
  return (
    <View style={[style, { backgroundColor: hexToRgba(color, 0.16) }]}>
      <Text style={[textStyle, { color }]}>{(category || 'General').toUpperCase()}</Text>
    </View>
  );
};
