import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';

import { api, buildProfileImageUrl } from '@/services/api';
import { useAppTheme } from '@/store/theme';

export default function ProfileConnectionsScreen() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const router = useRouter();
  const { colors } = useAppTheme();
  const activeTab = tab === 'followers' ? 'followers' : 'following';

  const followListsQuery = useQuery({
    queryKey: ['follow-lists'],
    queryFn: async () => {
      const response = await api.get('/auth/follows');
      return response.data as {
        following: { id: number; nickname: string; profile_image?: string | null }[];
        followers: { id: number; nickname: string; profile_image?: string | null }[];
      };
    },
  });

  const people = activeTab === 'followers' ? followListsQuery.data?.followers ?? [] : followListsQuery.data?.following ?? [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{activeTab === 'followers' ? '팔로워' : '팔로잉'}</Text>
        <View style={styles.headerButton} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {people.length ? (
          people.map((person) => (
            <TouchableOpacity
              key={`${activeTab}-${person.id}`}
              style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => router.push(`/profile/${person.id}`)}
            >
              <Image source={{ uri: buildProfileImageUrl(person.profile_image, person.nickname) }} style={styles.avatar} />
              <Text style={[styles.name, { color: colors.text }]}>{person.nickname}</Text>
            </TouchableOpacity>
          ))
        ) : (
          <Text style={[styles.empty, { color: colors.subtext }]}>아직 표시할 목록이 없습니다.</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 56, paddingHorizontal: 18, paddingBottom: 14, borderBottomWidth: 1 },
  headerButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '900' },
  content: { padding: 20, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 18, padding: 14 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#CBD5E1' },
  name: { fontSize: 16, fontWeight: '800' },
  empty: { fontWeight: '600' },
});
