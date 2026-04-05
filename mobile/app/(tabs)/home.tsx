import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { RefreshControl, ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CountdownCard } from '@/components/CountdownCard';
import { StoryStrip } from '@/components/StoryStrip';
import { api, buildAssetUrl, buildProfileImageUrl } from '@/services/api';
import { useAuthStore } from '@/store/auth';
import { useAppTheme } from '@/store/theme';
import type { Group, SlotSummary, StoryItem } from '@/types';
import { formatLocalDate } from '@/utils/date';

const mapGroup = (group: {
  id: number;
  name: string;
  invite_code: string;
  invite_link: string;
  member_count: number;
  max_members: number;
  owner_id: number;
  members: { id: number; nickname: string; profile_image?: string | null }[];
}): Group => ({
  id: group.id,
  name: group.name,
  inviteCode: group.invite_code,
  inviteLink: group.invite_link,
  memberCount: group.member_count,
  maxMembers: group.max_members,
  ownerId: group.owner_id,
  members: group.members.map((member) => ({
    id: member.id,
    nickname: member.nickname,
    profileImage: buildProfileImageUrl(member.profile_image, member.nickname),
  })),
});

export default function HomeScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const { colors } = useAppTheme();
  const [now, setNow] = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const groupsQuery = useQuery({
    queryKey: ['groups'],
    queryFn: async () => {
      const response = await api.get('/groups');
      return (response.data as Parameters<typeof mapGroup>[0][]).map(mapGroup);
    },
  });
  const primaryGroup = groupsQuery.data?.[0];
  const slotQuery = useQuery({
    queryKey: ['current-slot', primaryGroup?.id],
    enabled: Boolean(primaryGroup?.id),
    queryFn: async () => {
      const response = await api.get(`/groups/${primaryGroup?.id}/current-slot`);
      return response.data as { slot_hour: number; close_at: string };
    },
  });
  const feedQuery = useQuery({
    queryKey: ['home-feed', primaryGroup?.id],
    enabled: Boolean(primaryGroup?.id),
    queryFn: async () => {
      const date = formatLocalDate();
      const response = await api.get(`/groups/${primaryGroup?.id}/feed`, { params: { date } });
      return response.data as {
        hour: number;
        posts: { id: number; file_url: string; created_at?: string | null; user: { id: number; nickname: string; profile_image?: string | null } }[];
      }[];
    },
  });
  const storyQuery = useQuery({
    queryKey: ['home-stories'],
    queryFn: async () => {
      const response = await api.get('/stories/feed');
      return response.data as {
        id: number;
        file_url: string;
        user: { id: number; nickname: string; profile_image?: string | null };
      }[];
    },
  });
  const myStory = user
    ? {
        userId: user.id,
        nickname: '내 스토리',
        profileImage: buildProfileImageUrl(user.profileImage, user.nickname),
        thumbnail: storyQuery.data?.find((story) => story.user.id === user.id)?.file_url
          ? buildAssetUrl(storyQuery.data.find((story) => story.user.id === user.id)!.file_url)
          : null,
        hasStory: Boolean(storyQuery.data?.some((story) => story.user.id === user.id)),
      }
    : null;
  const followingStoryItems: StoryItem[] =
    storyQuery.data
      ?.filter((story) => story.user.id !== user?.id)
      .map((story) => ({
        userId: story.user.id,
        nickname: story.user.nickname,
        profileImage: buildProfileImageUrl(story.user.profile_image, story.user.nickname),
        thumbnail: story.file_url ? buildAssetUrl(story.file_url) : null,
        hasStory: true,
      })) ?? [];
  const storyItems: StoryItem[] = myStory ? [myStory, ...followingStoryItems] : followingStoryItems;
  const activeMembers =
    feedQuery.data
      ?.flatMap((slot) => slot.posts)
      .map((post) => ({
        id: post.user.id,
        nickname: post.user.nickname,
        profileImage: buildProfileImageUrl(post.user.profile_image, post.user.nickname),
      }))
      .filter((member, index, arr) => arr.findIndex((item) => item.id === member.id) === index) ?? [];
  const currentSlot: SlotSummary | null = slotQuery.data
    ? {
        hour: `${String(slotQuery.data.slot_hour).padStart(2, '0')}:00`,
        closeAt: slotQuery.data.close_at,
        activeMembers,
        memberCount: primaryGroup?.memberCount ?? 0,
      }
    : null;

  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ['groups'] });
      void queryClient.invalidateQueries({ queryKey: ['home-stories'] });
      if (primaryGroup?.id) {
        void queryClient.invalidateQueries({ queryKey: ['current-slot', primaryGroup.id] });
        void queryClient.invalidateQueries({ queryKey: ['home-feed', primaryGroup.id] });
      }
    }, [primaryGroup?.id, queryClient]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['groups'] }),
      queryClient.invalidateQueries({ queryKey: ['home-stories'] }),
      primaryGroup?.id ? queryClient.invalidateQueries({ queryKey: ['current-slot', primaryGroup.id] }) : Promise.resolve(),
      primaryGroup?.id ? queryClient.invalidateQueries({ queryKey: ['home-feed', primaryGroup.id] }) : Promise.resolve(),
    ]);
    setRefreshing(false);
  }, [primaryGroup?.id, queryClient]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} tintColor={colors.text} />}
      >
        <View style={styles.topBar}>
          <Text style={[styles.topLabel, { color: colors.subtext }]}>WITHLOG</Text>
          <View style={[styles.topLine, { backgroundColor: colors.border }]} />
        </View>
        <View style={styles.heroWrap}>
          <Text style={[styles.hero, { color: colors.text }]}>지금, 친구들이 뭘 하고 있는지</Text>
          <Text style={[styles.heroSub, { color: colors.subtext }]}>{`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')} 기준으로 친구들의 순간을 보고 있어요.`}</Text>
        </View>
        {currentSlot ? <CountdownCard slot={currentSlot} /> : null}
        {storyItems.length ? (
          <StoryStrip
            items={storyItems}
            onPress={(item) => {
              if (item.userId === user?.id && !item.hasStory) {
                router.push('/story/create');
                return;
              }
              router.push(`/story/${item.userId}`);
            }}
          />
        ) : null}
        <TouchableOpacity style={styles.primary} onPress={() => router.push('/group/create')}>
          <Text style={styles.primaryText}>새 그룹 만들기</Text>
        </TouchableOpacity>
        {!groupsQuery.isLoading && !groupsQuery.data?.length ? <Text style={[styles.empty, { color: colors.subtext }]}>아직 참여한 그룹이 없습니다.</Text> : null}
        {groupsQuery.data?.map((group) => (
          <TouchableOpacity key={group.id} style={[styles.groupCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => router.push(`/group/${group.id}`)}>
            <View>
              <Text style={[styles.groupTitle, { color: colors.text }]}>{group.name}</Text>
              <Text style={[styles.groupMeta, { color: colors.subtext }]}>{group.memberCount}/{group.maxMembers}명 · 초대코드 {group.inviteCode}</Text>
            </View>
            <Text style={[styles.groupAction, { color: colors.text }]}>열기</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 20, paddingBottom: 36, gap: 18 },
  topBar: { gap: 10, paddingTop: 2 },
  topLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '800', letterSpacing: 1.3 },
  topLine: { height: 1, backgroundColor: '#E2E8F0', width: '100%' },
  heroWrap: { gap: 8, marginBottom: 2 },
  hero: { color: '#0F172A', fontSize: 30, fontWeight: '900' },
  heroSub: { color: '#64748B', fontSize: 15, lineHeight: 22, fontWeight: '500' },
  primary: { backgroundColor: '#171412', borderRadius: 22, padding: 18, alignItems: 'center' },
  primaryText: { color: 'white', fontWeight: '700' },
  groupCard: { backgroundColor: '#FFFFFF', borderRadius: 28, padding: 20, borderWidth: 1, borderColor: '#E2E8F0', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  groupTitle: { color: '#0F172A', fontSize: 18, fontWeight: '700' },
  groupMeta: { color: '#64748B', marginTop: 6 },
  groupAction: { color: '#111827', fontWeight: '800' },
  empty: { color: '#64748B' },
});
