import { ScrollView, TouchableOpacity, Text } from 'react-native';
import { CATEGORIES } from '../services/categories';

// Selection stays with the screen; each screen supplies its existing styles.
export const CategoryChips = ({ value, onChange, contentContainerStyle,
  chipStyle, activeChipStyle, textStyle, activeTextStyle }) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={contentContainerStyle}>
    {['All', ...CATEGORIES].map((category) => (
      <TouchableOpacity key={category} accessibilityRole="button" accessibilityState={{ selected: category === value }}
        onPress={() => onChange(category)} style={[chipStyle, category === value && activeChipStyle]}>
        <Text style={[textStyle, category === value && activeTextStyle]}>{category}</Text>
      </TouchableOpacity>
    ))}
  </ScrollView>
);
