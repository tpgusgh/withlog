import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import type { StoryItem } from '@/types';
import { useAppTheme } from '@/store/theme';

export function StoryStrip({ items, onPress }: { items: StoryItem[]; onPress: (item: StoryItem) => void }) {
  const { colors, isDark } = useAppTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
      {items.map((item) => (
        <TouchableOpacity key={item.userId} style={styles.item} onPress={() => onPress(item)}>
          <View style={[styles.ring, { backgroundColor: isDark ? '#F5C8A8' : '#171412' }, !item.hasStory && styles.ringMuted]}>
            {item.profileImage ? <Image source={{ uri: item.profileImage }} style={styles.avatar} /> : <View style={styles.avatar} />}
            {!item.hasStory && item.nickname === '내 스토리' ? (
              <View style={[styles.plusBadge, { backgroundColor: isDark ? '#F7F2EC' : '#171412' }]}>
                <Text style={styles.plusText}>+</Text>
              </View>
            ) : null}
          </View>
          <Text numberOfLines={1} style={[styles.name, { color: colors.subtext }]}>{item.nickname}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  item: { alignItems: 'center', width: 76 },
  ring: {
    width: 68,
    height: 68,
    borderRadius: 999,
    padding: 3,
    backgroundColor: '#111827',
  },
  ringMuted: {
    backgroundColor: '#CBBEAF',
  },
  avatar: { width: '100%', height: '100%', borderRadius: 999, backgroundColor: '#E2E8F0' },
  plusBadge: { position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFDFC' },
  plusText: { color: '#FFFDFC', fontSize: 14, fontWeight: '900', lineHeight: 14 },
  name: { fontSize: 12, marginTop: 8, fontWeight: '600' },
});
