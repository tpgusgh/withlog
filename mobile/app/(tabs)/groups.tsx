import { RefreshControl, ScrollView, View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { useRouter } from 'expo-router';
import { api } from '@/services/api';
import { useAuthStore } from '@/store/auth';
import { useAppTheme } from '@/store/theme';
import type { Group } from '@/types';

const uploadedMoodEmojis = ['🤍', '💛', '🧡', '💖', '✨', '🌟'];

const mapGroup = (group: {
  id: number;
  name: string;
  invite_code: string;
  invite_link: string;
  member_count: number;
  max_members: number;
  is_public?: boolean;
  owner_id: number;
  members: { id: number; nickname: string; profile_image?: string | null }[];
}): Group => ({
  id: group.id,
  name: group.name,
  inviteCode: group.invite_code,
  inviteLink: group.invite_link,
  memberCount: group.member_count,
  maxMembers: group.max_members,
  isPublic: group.is_public ?? false,
  ownerId: group.owner_id,
  members: group.members,
});

export default function GroupsScreen() {
  const { colors } = useAppTheme();
  const user = useAuthStore((state) => state.user);
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const groupsQuery = useQuery({
    queryKey: ['groups'],
    queryFn: async () => {
      const response = await api.get('/groups');
      return (response.data as Parameters<typeof mapGroup>[0][]).map(mapGroup);
    },
  });
  const publicGroupsQuery = useQuery({
    queryKey: ['public-groups'],
    queryFn: async () => {
      const response = await api.get('/groups/public');
      return (response.data as Parameters<typeof mapGroup>[0][]).map(mapGroup);
    },
  });
  const currentHour = new Date().getHours();
  const currentDate = new Date();
  const currentDateKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
  const uploadedGroupsQuery = useQuery({
    queryKey: ['groups-current-slot-uploaded', groupsQuery.data?.map((group) => group.id).join(','), currentDateKey, currentHour, user?.id],
    enabled: Boolean(groupsQuery.data?.length && user?.id),
    queryFn: async () => {
      const groups = groupsQuery.data ?? [];
      const responses = await Promise.all(
        groups.map((group) => api.get(`/groups/${group.id}/feed`, { params: { date: currentDateKey } })),
      );
      const uploadedGroupIds = new Set<number>();
      responses.forEach((response, index) => {
        const slots = response.data as { hour: number; posts?: { user: { id: number } }[] }[];
        const hasUploaded = slots.some(
          (slot) => slot.hour === currentHour && Array.isArray(slot.posts) && slot.posts.some((post) => post.user.id === user?.id),
        );
        if (hasUploaded) {
          uploadedGroupIds.add(groups[index].id);
        }
      });
      return uploadedGroupIds;
    },
  });
  const joinMutation = useMutation({
    mutationFn: async () => api.post('/groups/join', { invite_code: inviteCode.trim() }),
    onSuccess: async () => {
      setInviteCode('');
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
    onError: (err) => {
      const message =
        err instanceof AxiosError ? (err.response?.data?.detail as string | undefined) ?? err.message : '그룹 참여에 실패했습니다.';
      setError(message);
    },
  });
  const joinPublicMutation = useMutation({
    mutationFn: async (groupId: number) => api.post(`/groups/${groupId}/join-public`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['groups'] });
      await queryClient.invalidateQueries({ queryKey: ['public-groups'] });
    },
  });

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['groups'] }),
      queryClient.invalidateQueries({ queryKey: ['public-groups'] }),
    ]);
    setRefreshing(false);
  }, [queryClient]);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ padding: 20, gap: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} tintColor={colors.text} />}
    >
      <Text style={[styles.title, { color: colors.text }]}>그룹</Text>
      <View style={[styles.joinBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <TextInput value={inviteCode} onChangeText={setInviteCode} placeholder="초대코드 입력" placeholderTextColor="#64748B" style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]} />
        <TouchableOpacity style={styles.joinBtn} onPress={() => joinMutation.mutate()} disabled={joinMutation.isPending}>
          <Text style={styles.joinText}>{joinMutation.isPending ? '참여 중' : '참여'}</Text>
        </TouchableOpacity>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TouchableOpacity style={styles.createBtn} onPress={() => router.push('/group/create')}>
        <Text style={styles.createText}>새 그룹 만들기</Text>
      </TouchableOpacity>
      {publicGroupsQuery.data?.length ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>가입 가능한 공개 그룹</Text>
          {publicGroupsQuery.data.map((group) => (
            <View key={`public-${group.id}`} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardCopy}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>{group.name}</Text>
                <Text style={[styles.cardSub, { color: colors.subtext }]}>{group.memberCount}/{group.maxMembers}명 · 공개 그룹</Text>
              </View>
              <TouchableOpacity style={styles.publicJoinBtn} onPress={() => joinPublicMutation.mutate(group.id)} disabled={joinPublicMutation.isPending}>
                <Text style={styles.publicJoinText}>가입</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : null}
      {groupsQuery.data?.map((group) => (
        <TouchableOpacity key={group.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => router.push(`/group/${group.id}`)}>
          <View style={styles.groupCardTop}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{group.name}</Text>
            {uploadedGroupsQuery.data?.has(group.id) ? (
              <Text style={styles.groupUploadedEmoji}>{uploadedMoodEmojis[group.id % uploadedMoodEmojis.length]}</Text>
            ) : null}
          </View>
          <Text style={[styles.cardSub, { color: colors.subtext }]}>
            {group.memberCount}/{group.maxMembers}명 · {group.isPublic ? '공개' : group.inviteCode}
            {uploadedGroupsQuery.data?.has(group.id) ? ' · 올렸어요' : ''}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  title: { color: '#0F172A', fontSize: 30, fontWeight: '900', marginTop: 16 },
  joinBox: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 14, flexDirection: 'row', gap: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  input: { flex: 1, color: '#0F172A', backgroundColor: '#F8FAFC', borderRadius: 16, paddingHorizontal: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  joinBtn: { backgroundColor: '#171412', borderRadius: 16, paddingHorizontal: 18, justifyContent: 'center' },
  joinText: { color: 'white', fontWeight: '700' },
  createBtn: { backgroundColor: '#171412', borderRadius: 22, padding: 18, alignItems: 'center' },
  createText: { color: 'white', fontWeight: '700' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: '#E2E8F0' },
  groupCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  groupUploadedEmoji: { fontSize: 24 },
  cardCopy: { flex: 1 },
  cardTitle: { color: '#0F172A', fontWeight: '700', fontSize: 18 },
  cardSub: { color: '#64748B', marginTop: 8 },
  section: { gap: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '900' },
  publicJoinBtn: { backgroundColor: '#171412', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  publicJoinText: { color: '#FFFFFF', fontWeight: '800' },
  error: { color: '#DC2626' },
});
