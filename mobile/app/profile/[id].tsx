import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';

import { api, buildProfileImageUrl } from '@/services/api';
import { useAuthStore } from '@/store/auth';
import { useAppTheme } from '@/store/theme';

export default function FriendProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const { colors, isDark } = useAppTheme();
  const userId = Number(id);

  const profileQuery = useQuery({
    queryKey: ['user-profile', userId],
    enabled: Number.isFinite(userId),
    queryFn: async () => {
      const response = await api.get(`/auth/users/${userId}`);
      return response.data as {
        id: number;
        email: string;
        nickname: string;
        profile_image?: string | null;
        is_public: boolean;
        follower_count: number;
        following_count: number;
        is_following: boolean;
        follows_you: boolean;
        public_groups?: {
          id: number;
          name: string;
          member_count: number;
          max_members: number;
          is_joined: boolean;
        }[];
      };
    },
  });

  const followMutation = useMutation({
    mutationFn: async (following: boolean) => {
      if (following) {
        await api.delete(`/auth/follow/${userId}`);
        return false;
      }
      await api.post(`/auth/follow/${userId}`);
      return true;
    },
    onSuccess: async (nextFollowing, previousFollowing) => {
      queryClient.setQueryData(['user-profile', userId], (oldData: unknown) => {
        if (!oldData || typeof oldData !== 'object') {
          return oldData;
        }
        const typed = oldData as {
          follower_count: number;
          is_following: boolean;
        };
        return {
          ...typed,
          is_following: nextFollowing,
          follower_count: Math.max(0, typed.follower_count + (previousFollowing ? -1 : 1)),
        };
      });
      await queryClient.invalidateQueries({ queryKey: ['recommended-users'] });
      await queryClient.invalidateQueries({ queryKey: ['follow-lists'] });
      if (currentUser) {
        await updateUser({
          ...currentUser,
          followingCount: Math.max(0, (currentUser.followingCount ?? 0) + (previousFollowing ? -1 : 1)),
        });
      }
    },
  });

  const joinPublicMutation = useMutation({
    mutationFn: async (groupId: number) => api.post(`/groups/${groupId}/join-public`),
    onSuccess: async (_, groupId) => {
      queryClient.setQueryData(['user-profile', userId], (oldData: unknown) => {
        if (!oldData || typeof oldData !== 'object') {
          return oldData;
        }
        const typed = oldData as {
          public_groups?: { id: number; member_count: number; is_joined: boolean }[];
        };
        return {
          ...typed,
          public_groups: typed.public_groups?.map((group) =>
            group.id === groupId
              ? { ...group, is_joined: true, member_count: group.member_count + 1 }
              : group,
          ),
        };
      });
      await queryClient.invalidateQueries({ queryKey: ['groups'] });
      await queryClient.invalidateQueries({ queryKey: ['public-groups'] });
    },
    onError: (err) => {
      const message =
        err instanceof AxiosError ? (err.response?.data?.detail as string | undefined) ?? err.message : '공개 그룹 가입에 실패했습니다.';
      console.warn(message);
    },
  });

  const profile = profileQuery.data;
  const avatarUri = buildProfileImageUrl(profile?.profile_image, profile?.nickname);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>친구 프로필</Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: isDark ? '#2A2623' : '#E8E0D6', alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="person-outline" size={34} color={colors.subtext} />
            </View>
          )}
          <Text style={[styles.name, { color: colors.text }]}>{profile?.nickname ?? '불러오는 중...'}</Text>
          <Text style={[styles.sub, { color: colors.subtext }]}>{profile?.follows_you ? '나를 팔로우하고 있어요' : '공개 프로필'}</Text>
          {profile && currentUser?.id !== profile.id ? (
            <TouchableOpacity
              style={[styles.followButton, { backgroundColor: profile.is_following ? (isDark ? '#2A2623' : '#ECE4DB') : colors.text }]}
              onPress={() => followMutation.mutate(profile.is_following)}
              disabled={followMutation.isPending}
            >
              <Text style={[styles.followButtonText, { color: profile.is_following ? colors.text : colors.background }]}>
                {profile.is_following ? '팔로잉' : '팔로우'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={[styles.statsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.statItem}>
            <Text style={[styles.statCount, { color: colors.text }]}>{profile?.following_count ?? 0}</Text>
            <Text style={[styles.statLabel, { color: colors.subtext }]}>팔로잉</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statCount, { color: colors.text }]}>{profile?.follower_count ?? 0}</Text>
            <Text style={[styles.statLabel, { color: colors.subtext }]}>팔로워</Text>
          </View>
        </View>

        {profile?.public_groups?.length ? (
          <View style={[styles.groupCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.groupTitle, { color: colors.text }]}>공개 그룹</Text>
            {profile.public_groups.map((group) => (
              <View key={group.id} style={[styles.groupRow, { borderTopColor: colors.border }]}>
                <View style={styles.groupCopy}>
                  <Text style={[styles.groupName, { color: colors.text }]}>{group.name}</Text>
                  <Text style={[styles.groupMeta, { color: colors.subtext }]}>{group.member_count}/{group.max_members}명</Text>
                </View>
                <TouchableOpacity
                  style={[styles.groupButton, { backgroundColor: group.is_joined ? (isDark ? '#2A2623' : '#ECE4DB') : colors.text }]}
                  onPress={() => (group.is_joined ? router.push(`/group/${group.id}`) : joinPublicMutation.mutate(group.id))}
                  disabled={joinPublicMutation.isPending}
                >
                  <Text style={[styles.groupButtonText, { color: group.is_joined ? colors.text : colors.background }]}>
                    {group.is_joined ? '들어가기' : '가입'}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 56, paddingHorizontal: 18, paddingBottom: 14, borderBottomWidth: 1 },
  headerButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '900' },
  content: { padding: 20, gap: 16 },
  heroCard: { borderWidth: 1, borderRadius: 30, padding: 24, alignItems: 'center' },
  avatar: { width: 104, height: 104, borderRadius: 52 },
  name: { fontSize: 24, fontWeight: '900', marginTop: 14 },
  sub: { marginTop: 6, fontWeight: '600' },
  followButton: { marginTop: 16, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 12 },
  followButtonText: { fontWeight: '800' },
  statsCard: { borderWidth: 1, borderRadius: 26, padding: 18, flexDirection: 'row', alignItems: 'center' },
  statItem: { flex: 1, alignItems: 'center' },
  statCount: { fontSize: 22, fontWeight: '900' },
  statLabel: { marginTop: 4, fontWeight: '700' },
  statDivider: { width: 1, height: 42, backgroundColor: '#D6CBBE' },
  groupCard: { borderWidth: 1, borderRadius: 26, paddingHorizontal: 18, paddingVertical: 8 },
  groupTitle: { fontSize: 18, fontWeight: '900', marginVertical: 10 },
  groupRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderTopWidth: 1 },
  groupCopy: { flex: 1, paddingRight: 12 },
  groupName: { fontWeight: '800', fontSize: 16 },
  groupMeta: { marginTop: 4, fontWeight: '600' },
  groupButton: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  groupButtonText: { fontWeight: '800' },
});
