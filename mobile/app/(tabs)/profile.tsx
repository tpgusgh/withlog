import { Alert, Image, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';

import { api, buildProfileImageUrl } from '@/services/api';
import { defaultProfileSettings, mapProfileToSettings, type LocalProfileSettings, type ProfilePayload } from '@/services/profile-settings';
import { useAuthStore } from '@/store/auth';
import { useAppTheme } from '@/store/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const logout = useAuthStore((s) => s.logout);
  const queryClient = useQueryClient();
  const { colors, isDark } = useAppTheme();
  const [refreshing, setRefreshing] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ['profile-settings'],
    queryFn: async () => {
      const response = await api.get('/auth/me');
      return mapProfileToSettings(response.data as ProfilePayload);
    },
  });
  const recommendedUsersQuery = useQuery({
    queryKey: ['recommended-users'],
    enabled: Boolean(user),
    queryFn: async () => {
      const response = await api.get('/auth/users');
      return response.data as {
        id: number;
        nickname: string;
        profile_image?: string | null;
        is_following: boolean;
        follower_count?: number;
      }[];
    },
  });
  const followMutation = useMutation({
    mutationFn: async ({ userId, following }: { userId: number; following: boolean }) => {
      if (following) {
        await api.delete(`/auth/follow/${userId}`);
        return false;
      }
      await api.post(`/auth/follow/${userId}`);
      return true;
    },
    onSuccess: async (_nextFollowing, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['recommended-users'] });
      await queryClient.invalidateQueries({ queryKey: ['follow-lists'] });
      if (!user) {
        return;
      }
      const delta = variables.following ? -1 : 1;
      await updateUser({
        ...user,
        followingCount: Math.max(0, (user.followingCount ?? 0) + delta),
      });
    },
  });
  const deleteAccountMutation = useMutation({
    mutationFn: async () => api.delete('/auth/me'),
    onSuccess: async () => {
      await logout();
      queryClient.clear();
      router.replace('/(auth)/login');
    },
    onError: (err) => {
      Alert.alert(
        '오류',
        err instanceof Error ? err.message : '회원탈퇴에 실패했습니다.',
      );
    },
  });

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['profile-settings'] }),
      queryClient.invalidateQueries({ queryKey: ['recommended-users'] }),
      queryClient.invalidateQueries({ queryKey: ['follow-lists'] }),
    ]);
    setRefreshing(false);
  }, [queryClient]);

  const confirmDeleteAccount = () => {
    Alert.alert('회원탈퇴', '정말 탈퇴할까요? 계정과 기록이 삭제됩니다.', [
      { text: '취소', style: 'cancel' },
      { text: '탈퇴', style: 'destructive', onPress: () => deleteAccountMutation.mutate() },
    ]);
  };

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  const settings = settingsQuery.data ?? defaultProfileSettings;
  const avatarUri = buildProfileImageUrl(user.profileImage, user.nickname);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} tintColor={colors.text} />}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.text }]}>프로필</Text>
        <TouchableOpacity style={[styles.editIconButton, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => router.push('/profile/edit')}>
          <Ionicons name="create-outline" size={18} color={colors.text} />
        </TouchableOpacity>
      </View>

      <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.avatarWrap}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: isDark ? '#2A2623' : '#E8E0D6' }]}>
              <Ionicons name="person-outline" size={30} color={colors.subtext} />
            </View>
          )}
        </View>
        <View style={styles.heroInfo}>
          <Text style={[styles.name, { color: colors.text }]}>{user.nickname}</Text>
          <Text style={[styles.sub, { color: colors.subtext }]}>{user.email}</Text>
          <View style={styles.followStats}>
            <TouchableOpacity style={styles.followStat} onPress={() => router.push('/profile/connections?tab=following')}>
              <Text style={[styles.followCount, { color: colors.text }]}>{user.followingCount ?? 0}</Text>
              <Text style={[styles.followLabel, { color: colors.subtext }]}>팔로잉</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.followStat} onPress={() => router.push('/profile/connections?tab=followers')}>
              <Text style={[styles.followCount, { color: colors.text }]}>{user.followerCount ?? 0}</Text>
              <Text style={[styles.followLabel, { color: colors.subtext }]}>팔로워</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>소개</Text>
        <Text style={[styles.body, { color: colors.subtext }]}>{settings.intro.trim() || '아직 소개글이 없습니다.'}</Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>추천 친구</Text>
        <Text style={[styles.helper, { color: colors.subtext }]}>공개 프로필만 추천에 표시됩니다.</Text>
        <View style={styles.recommendList}>
          {recommendedUsersQuery.data?.length ? (
            recommendedUsersQuery.data.map((person) => (
              <View key={`recommended-${person.id}`} style={[styles.recommendRow, { borderColor: colors.border, backgroundColor: isDark ? '#1F1B18' : '#F8F5F0' }]}>
                <TouchableOpacity style={styles.recommendMain} onPress={() => router.push(`/profile/${person.id}`)}>
                  <Image source={{ uri: buildProfileImageUrl(person.profile_image, person.nickname) }} style={styles.recommendAvatar} />
                  <View style={styles.recommendTextWrap}>
                    <Text style={[styles.recommendName, { color: colors.text }]}>{person.nickname}</Text>
                    <Text style={[styles.recommendMeta, { color: colors.subtext }]}>팔로워 {person.follower_count ?? 0}</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.followButton, { backgroundColor: person.is_following ? (isDark ? '#2A2623' : '#ECE4DB') : colors.text }]}
                  disabled={followMutation.isPending}
                  onPress={() => followMutation.mutate({ userId: person.id, following: person.is_following })}
                >
                  <Text style={[styles.followButtonText, { color: person.is_following ? colors.text : colors.background }]}>{person.is_following ? '팔로잉' : '팔로우'}</Text>
                </TouchableOpacity>
              </View>
            ))
          ) : (
            <Text style={[styles.helper, { color: colors.subtext }]}>지금은 추천할 공개 프로필이 없습니다.</Text>
          )}
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>설정 요약</Text>
        <View style={styles.summaryList}>
          <View style={[styles.summaryChip, { backgroundColor: isDark ? '#1F1B18' : '#F3ECE3', borderColor: colors.border }]}>
            <Text style={[styles.summaryLabel, { color: colors.subtext }]}>공개 범위</Text>
            <Text style={[styles.summaryValue, { color: colors.text }]}>{settings.isPublic ? '전체 공개' : '멤버만'}</Text>
          </View>
          <View style={[styles.summaryChip, { backgroundColor: isDark ? '#1F1B18' : '#F3ECE3', borderColor: colors.border }]}>
            <Text style={[styles.summaryLabel, { color: colors.subtext }]}>테마</Text>
            <Text style={[styles.summaryValue, { color: colors.text }]}>{settings.themeMode === 'dark' ? '다크' : '라이트'}</Text>
          </View>
          <View style={[styles.summaryChip, { backgroundColor: isDark ? '#1F1B18' : '#F3ECE3', borderColor: colors.border }]}>
            <Text style={[styles.summaryLabel, { color: colors.subtext }]}>시간대</Text>
            <Text style={[styles.summaryValue, { color: colors.text }]}>{settings.timezoneLabel}</Text>
          </View>
          <View style={[styles.summaryChip, { backgroundColor: isDark ? '#1F1B18' : '#F3ECE3', borderColor: colors.border }]}>
            <Text style={[styles.summaryLabel, { color: colors.subtext }]}>알림 제외</Text>
            <Text style={[styles.summaryValue, { color: colors.text }]}>{settings.quietHoursEnabled ? settings.quietHours : '사용 안 함'}</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity style={[styles.editButton, { backgroundColor: colors.text }]} onPress={() => router.push('/profile/edit')}>
        <Text style={[styles.editButtonText, { color: colors.background }]}>프로필 편집</Text>
      </TouchableOpacity>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>정책과 계정</Text>
        <TouchableOpacity style={[styles.policyRow, { borderColor: colors.border }]} onPress={() => router.push('/profile/privacy')}>
          <Text style={[styles.policyText, { color: colors.text }]}>개인정보 처리 방침</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.subtext} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.withdrawButton, deleteAccountMutation.isPending && styles.withdrawButtonDisabled]} onPress={confirmDeleteAccount} disabled={deleteAccountMutation.isPending}>
          <Text style={styles.withdrawButtonText}>{deleteAccountMutation.isPending ? '탈퇴 처리 중...' : '회원탈퇴'}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={() => void logout()}>
        <Text style={styles.logoutButtonText}>로그아웃</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 36, gap: 18 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  title: { fontSize: 30, fontWeight: '900' },
  editIconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCard: { borderRadius: 30, padding: 20, borderWidth: 1, flexDirection: 'row', gap: 16 },
  avatarWrap: { width: 92, height: 92, borderRadius: 999, overflow: 'hidden' },
  avatar: { width: '100%', height: '100%' },
  avatarPlaceholder: { width: '100%', height: '100%', borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  heroInfo: { flex: 1, justifyContent: 'center' },
  name: { fontSize: 24, fontWeight: '900' },
  sub: { marginTop: 4, fontWeight: '600' },
  followStats: { flexDirection: 'row', gap: 20, marginTop: 12 },
  followStat: { alignItems: 'center' },
  followCount: { fontSize: 18, fontWeight: '900' },
  followLabel: { fontWeight: '600', marginTop: 2 },
  card: { borderRadius: 28, padding: 20, borderWidth: 1 },
  sectionTitle: { fontSize: 18, fontWeight: '800', marginBottom: 10 },
  body: { lineHeight: 22, fontWeight: '600' },
  helper: { marginTop: 2, fontWeight: '600' },
  summaryList: { gap: 10 },
  summaryChip: { borderRadius: 18, borderWidth: 1, padding: 14 },
  summaryLabel: { fontSize: 12, fontWeight: '700', marginBottom: 4 },
  summaryValue: { fontSize: 15, fontWeight: '800' },
  editButton: { borderRadius: 18, padding: 16, alignItems: 'center' },
  editButtonText: { fontWeight: '800' },
  logoutButton: { backgroundColor: '#FEE2E2', borderRadius: 18, padding: 16, alignItems: 'center' },
  logoutButtonText: { color: '#B91C1C', fontWeight: '800' },
  recommendList: { gap: 10, marginTop: 14 },
  recommendRow: { borderWidth: 1, borderRadius: 20, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  recommendMain: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  recommendAvatar: { width: 44, height: 44, borderRadius: 22 },
  recommendTextWrap: { flex: 1 },
  recommendName: { fontSize: 15, fontWeight: '800' },
  recommendMeta: { marginTop: 2, fontWeight: '600' },
  followButton: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  followButtonText: { fontWeight: '800' },
  policyRow: {
    borderTopWidth: 1,
    paddingTop: 14,
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  policyText: { fontSize: 15, fontWeight: '700' },
  withdrawButton: { marginTop: 16, backgroundColor: '#FEE2E2', borderRadius: 18, padding: 16, alignItems: 'center' },
  withdrawButtonDisabled: { opacity: 0.5 },
  withdrawButtonText: { color: '#B91C1C', fontWeight: '800' },
});
