import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Alert,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { BlurView } from 'expo-blur';

import { FeedCard } from '@/components/FeedCard';
import { api, buildAssetUrl, buildProfileImageUrl } from '@/services/api';
import { useAuthStore } from '@/store/auth';
import { useAppTheme } from '@/store/theme';
import type { ChatMessage, Group, Post } from '@/types';
import { buildRecentHourTimeline, formatCreatedAtLabel, formatDisplayDate, formatLocalDate } from '@/utils/date';

const mapGroup = (group: {
  id: number;
  name: string;
  invite_code: string;
  invite_link: string;
  member_count: number;
  max_members: number;
  owner_id: number;
  members?: { id: number; nickname: string; profile_image?: string | null }[];
}): Group => ({
  id: group.id,
  name: group.name,
  inviteCode: group.invite_code,
  inviteLink: group.invite_link,
  memberCount: group.member_count,
  maxMembers: group.max_members,
  ownerId: group.owner_id,
  members: Array.isArray(group.members)
    ? group.members.map((member) => ({
        id: member.id,
        nickname: member.nickname,
        profileImage: buildProfileImageUrl(member.profile_image, member.nickname),
        isOwner: member.id === group.owner_id,
      }))
    : [],
});

type FeedPost = {
  id: number;
  caption: string;
  file_url: string;
  media_type: 'image' | 'video';
  filter: string;
  is_muted: boolean;
  likes: number;
  liked_by_me?: boolean;
  comments: number;
  created_at?: string | null;
  user: { id: number; nickname: string; profile_image?: string | null };
};

function QuoteActivityRail({
  messages,
  onPress,
}: {
  messages: ChatMessage[];
  onPress?: () => void;
}) {
  const { colors, isDark } = useAppTheme();
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (messages.length <= 1) {
      return;
    }
    const timer = setInterval(() => {
      setActiveIndex((current) => (current + 1) % messages.length);
    }, 2500);
    return () => clearInterval(timer);
  }, [messages.length]);

  if (!messages.length) {
    return null;
  }

  const activeMessage = messages[activeIndex % messages.length];
  const summary = activeMessage.content?.trim() || '사진을 인용했어요';

  return (
    <TouchableOpacity
      style={styles.quoteRailShell}
      activeOpacity={0.9}
      onPress={onPress}
    >
      <BlurView
        intensity={isDark ? 42 : 58}
        tint={isDark ? 'dark' : 'light'}
        style={[
          styles.quoteRail,
          {
            backgroundColor: isDark ? 'rgba(21, 18, 16, 0.52)' : 'rgba(226, 217, 206, 0.12)',
            borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.72)',
          },
        ]}
      >
        <View style={styles.glassSheen} />
        <View style={styles.glassRim} />
        <View style={styles.quoteRailCurrentUser}>
          <View style={[styles.quoteRailAvatarWrap, { marginLeft: 0, borderColor: isDark ? 'rgba(29, 23, 20, 0.82)' : 'rgba(255, 251, 246, 0.9)' }]}>
            {activeMessage.user.profileImage ? <Image source={{ uri: activeMessage.user.profileImage }} style={styles.quoteRailAvatar} /> : <View style={styles.quoteRailAvatar} />}
          </View>
          <Text style={[styles.quoteRailName, { color: colors.text }]} numberOfLines={1}>
            {activeMessage.user.nickname}
          </Text>
        </View>
        <View style={styles.quoteRailCopy}>
          <Text style={[styles.quoteRailText, { color: colors.text }]} numberOfLines={1}>
            {summary}
          </Text>
          <Text style={[styles.quoteRailMeta, { color: colors.subtext }]}>
            {messages.length}개의 채팅 반응
          </Text>
        </View>
        <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.subtext} />
      </BlurView>
    </TouchableOpacity>
  );
}

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const groupId = Number(id);
  const { colors, isDark } = useAppTheme();
  const { width } = useWindowDimensions();
  const pageWidth = Math.max(width - 16, 1);
  const timelineRef = useRef<ScrollView>(null);
  const [now, setNow] = useState(new Date());
  const [activeIndex, setActiveIndex] = useState(23);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const groupQuery = useQuery({
    queryKey: ['group', groupId],
    enabled: Number.isFinite(groupId),
    queryFn: async () => {
      const response = await api.get(`/groups/${groupId}`);
      return mapGroup(response.data);
    },
  });

  const slotQuery = useQuery({
    queryKey: ['current-slot', groupId],
    enabled: Number.isFinite(groupId),
    queryFn: async () => {
      const response = await api.get(`/groups/${groupId}/current-slot`);
      return response.data as { slot_date: string; slot_hour: number; close_at: string; is_open: boolean };
    },
  });

  const anchorDate = slotQuery.data?.slot_date ?? formatLocalDate();
  const anchorHour = slotQuery.data?.slot_hour ?? now.getHours();
  const yesterday = new Date(`${anchorDate}T00:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  const previousDate = formatLocalDate(yesterday);

  const feedQuery = useQuery({
    queryKey: ['group-feed-window', groupId, anchorDate],
    enabled: Number.isFinite(groupId),
    queryFn: async () => {
      const [todayResponse, yesterdayResponse] = await Promise.all([
        api.get(`/groups/${groupId}/feed`, { params: { date: anchorDate } }),
        api.get(`/groups/${groupId}/feed`, { params: { date: previousDate } }),
      ]);
      return [
        { dateKey: anchorDate, slots: todayResponse.data as { hour: number; posts?: FeedPost[] }[] },
        { dateKey: previousDate, slots: yesterdayResponse.data as { hour: number; posts?: FeedPost[] }[] },
      ];
    },
  });
  const chatQuery = useQuery({
    queryKey: ['group-chat', groupId],
    enabled: Number.isFinite(groupId),
    queryFn: async () => {
      const response = await api.get(`/groups/${groupId}/chat`);
      return (response.data as {
        id: number;
        content?: string | null;
        message_type?: 'text' | 'quote' | 'heart' | 'image';
        media_url?: string | null;
        media_type?: 'image' | 'video' | null;
        quote?: { post_id?: number | null; caption?: string | null; thumbnail_url?: string | null; author_nickname?: string | null } | null;
        created_at?: string | null;
        user: { id: number; nickname: string; profile_image?: string | null };
      }[]).map(
        (message): ChatMessage => ({
          id: message.id,
          content: message.content ?? '',
          createdAt: formatCreatedAtLabel(message.created_at),
          messageType: message.message_type,
          mediaUrl: message.media_url ? buildAssetUrl(message.media_url) : null,
          mediaType: message.media_type,
          quote: message.quote
            ? {
                postId: message.quote.post_id ?? null,
                caption: message.quote.caption ?? null,
                thumbnailUrl: message.quote.thumbnail_url ? buildAssetUrl(message.quote.thumbnail_url) : null,
                authorNickname: message.quote.author_nickname ?? null,
              }
            : null,
          user: {
            id: message.user.id,
            nickname: message.user.nickname,
            profileImage: buildProfileImageUrl(message.user.profile_image, message.user.nickname),
          },
        }),
      );
    },
  });
  const blockListQuery = useQuery({
    queryKey: ['blocked-users'],
    queryFn: async () => {
      const response = await api.get('/auth/blocks');
      return response.data as {
        blocked: { id: number; nickname: string; profile_image?: string | null }[];
      };
    },
  });

  const leaveGroupMutation = useMutation({
    mutationFn: async () => api.delete(`/groups/${groupId}/leave`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['groups'] });
      router.replace('/(tabs)/groups');
    },
    onError: (err) => {
      const message =
        err instanceof AxiosError ? (err.response?.data?.detail as string | undefined) ?? err.message : '그룹 나가기에 실패했습니다.';
      Alert.alert('오류', message);
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async () => api.delete(`/groups/${groupId}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['groups'] });
      router.replace('/(tabs)/groups');
    },
    onError: (err) => {
      const message =
        err instanceof AxiosError ? (err.response?.data?.detail as string | undefined) ?? err.message : '그룹 삭제에 실패했습니다.';
      Alert.alert('오류', message);
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (memberId: number) => api.delete(`/groups/${groupId}/members/${memberId}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['group', groupId] });
      await queryClient.invalidateQueries({ queryKey: ['group-feed-window', groupId] });
      await queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
    onError: (err) => {
      const message =
        err instanceof AxiosError ? (err.response?.data?.detail as string | undefined) ?? err.message : '멤버 추방에 실패했습니다.';
      Alert.alert('오류', message);
    },
  });
  const blockMemberMutation = useMutation({
    mutationFn: async (memberId: number) => api.post(`/auth/block/${memberId}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['blocked-users'] });
      await queryClient.invalidateQueries({ queryKey: ['recommended-users'] });
      await queryClient.invalidateQueries({ queryKey: ['follow-lists'] });
      await queryClient.invalidateQueries({ queryKey: ['group', groupId] });
    },
    onError: (err) => {
      const message =
        err instanceof AxiosError ? (err.response?.data?.detail as string | undefined) ?? err.message : '멤버 차단에 실패했습니다.';
      Alert.alert('오류', message);
    },
  });

  const confirmRemoveMember = (memberId: number, nickname: string) => {
    Alert.alert('멤버 추방', `${nickname}님을 그룹에서 내보낼까요?`, [
      { text: '취소', style: 'cancel' },
      { text: '추방', style: 'destructive', onPress: () => removeMemberMutation.mutate(memberId) },
    ]);
  };
  const confirmBlockMember = (memberId: number, nickname: string) => {
    Alert.alert('멤버 차단', `${nickname}님을 차단할까요? 차단하면 그룹에서도 숨겨집니다.`, [
      { text: '취소', style: 'cancel' },
      { text: '차단', style: 'destructive', onPress: () => blockMemberMutation.mutate(memberId) },
    ]);
  };
  const confirmLeaveOrDeleteGroup = () => {
    const isOwner = group?.ownerId === user?.id;
    Alert.alert(
      isOwner ? '그룹 삭제' : '그룹 나가기',
      isOwner ? '이 그룹을 정말 삭제할까요? 그룹 기록도 함께 사라집니다.' : '이 그룹에서 나갈까요?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: isOwner ? '삭제' : '나가기',
          style: 'destructive',
          onPress: () => (isOwner ? deleteGroupMutation.mutate() : leaveGroupMutation.mutate()),
        },
      ],
    );
  };

  const deadlineText = (() => {
    const closeAt = slotQuery.data?.close_at;
    if (!closeAt) {
      return '현재 슬롯 확인 중';
    }
    const remain = new Date(closeAt).getTime() - now.getTime();
    if (remain <= 0) {
      return '이번 슬롯이 마감됐어요';
    }
    const minutes = Math.floor(remain / 1000 / 60);
    const seconds = Math.floor(remain / 1000) % 60;
    return `${minutes}분 ${String(seconds).padStart(2, '0')}초 후 마감`;
  })();

  const timeline = useMemo(() => buildRecentHourTimeline(anchorDate, anchorHour, 24), [anchorDate, anchorHour]);
  const blockedIds = useMemo(
    () => new Set((blockListQuery.data?.blocked ?? []).map((person) => person.id)),
    [blockListQuery.data],
  );
  const visibleMembers = useMemo(
    () => (groupQuery.data?.members ?? []).filter((member) => !blockedIds.has(member.id)),
    [blockedIds, groupQuery.data],
  );
  const postsBySlot = useMemo(() => {
    const map = new Map<string, FeedPost[]>();
    for (const day of feedQuery.data ?? []) {
      for (const slot of day.slots ?? []) {
        map.set(
          `${day.dateKey}-${slot.hour}`,
          Array.isArray(slot.posts) ? slot.posts.filter((post) => !blockedIds.has(post.user.id)) : [],
        );
      }
    }
    return map;
  }, [blockedIds, feedQuery.data]);
  const pages = useMemo(
    () =>
      timeline.map((slot) => ({
        ...slot,
        posts: postsBySlot.get(slot.key) ?? [],
      })),
    [timeline, postsBySlot],
  );
  const quoteActivityByPostId = useMemo(() => {
    const grouped = new Map<number, ChatMessage[]>();
    for (const message of chatQuery.data ?? []) {
      if (message.messageType === 'heart') {
        continue;
      }
      if (blockedIds.has(message.user.id)) {
        continue;
      }
      const postId = message.quote?.postId;
      if (!postId) {
        continue;
      }
      const current = grouped.get(postId) ?? [];
      current.push(message);
      grouped.set(postId, current);
    }
    return grouped;
  }, [blockedIds, chatQuery.data]);
  const currentIndex = Math.max(pages.length - 1, 0);
  const activePage = pages[activeIndex] ?? pages[currentIndex];
  const group = groupQuery.data;

  useEffect(() => {
    if (!pages.length) {
      return;
    }
    setActiveIndex(currentIndex);
    requestAnimationFrame(() => {
      timelineRef.current?.scrollTo({ x: pageWidth * currentIndex, animated: false });
    });
  }, [currentIndex, pageWidth, pages.length]);

  const handleTimelineScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    setActiveIndex(nextIndex);
  };

  const likeShareMutation = useMutation({
    mutationFn: async (post: Post) => {
      const likeResponse = await api.post(`/posts/${post.id}/like`);
      await api.post(`/groups/${groupId}/chat/share-post`, { post_id: post.id, mode: 'heart' });
      return { postId: post.id, liked: Boolean(likeResponse.data?.liked) };
    },
    onSuccess: async ({ postId, liked }) => {
      queryClient.setQueryData(['group-feed-window', groupId, anchorDate], (oldData: unknown) => {
        if (!Array.isArray(oldData)) {
          return oldData;
        }
        return oldData.map((day) => {
          const typedDay = day as { dateKey: string; slots?: { hour: number; posts?: FeedPost[] }[] };
          if (!Array.isArray(typedDay.slots)) {
            return typedDay;
          }
          return {
            ...typedDay,
            slots: typedDay.slots.map((slot) => ({
              ...slot,
              posts: Array.isArray(slot.posts)
                ? slot.posts.map((post) =>
                    post.id === postId
                      ? {
                          ...post,
                          liked_by_me: liked,
                          likes: Math.max(0, (post.likes ?? 0) + (liked ? 1 : -1)),
                        }
                      : post,
                  )
                : slot.posts,
            })),
          };
        });
      });
      await queryClient.invalidateQueries({ queryKey: ['group-feed-window', groupId] });
      await queryClient.invalidateQueries({ queryKey: ['group-chat', groupId] });
    },
    onError: (err) => {
      const message =
        err instanceof AxiosError ? (err.response?.data?.detail as string | undefined) ?? err.message : '하트 공유에 실패했습니다.';
      Alert.alert('오류', message);
    },
  });

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={[styles.headerShell, { borderBottomColor: colors.border }]}>
        <View style={styles.headerTopLine}>
          <Text style={[styles.headerLabel, { color: colors.subtext }]}>WITHLOG GROUP</Text>
          <View style={[styles.headerLine, { backgroundColor: colors.border }]} />
        </View>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={[styles.title, { color: colors.text }]}>{group?.name ?? '그룹'}</Text>
            <Text style={[styles.meta, { color: colors.subtext }]}>
              {group ? `${group.memberCount}/${group.maxMembers}명 · 최근 24시간 기록` : '불러오는 중...'}
            </Text>
          </View>
          <View style={styles.headerIcons}>
            <TouchableOpacity style={[styles.circleIcon, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => router.push(`/group/chat?id=${groupId}`)}>
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.circleIcon, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => router.push(`/group/daily-video?id=${groupId}`)}>
              <Ionicons name="play-circle-outline" size={18} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.leaveBtn, { backgroundColor: group?.ownerId === user?.id ? '#7F1D1D' : colors.card, borderColor: colors.border }]}
              onPress={confirmLeaveOrDeleteGroup}
              disabled={deleteGroupMutation.isPending || leaveGroupMutation.isPending}
            >
              <Text style={[styles.leaveText, { color: group?.ownerId === user?.id ? '#FEE2E2' : colors.text }]}>
                {group?.ownerId === user?.id ? (deleteGroupMutation.isPending ? '삭제 중' : '삭제') : leaveGroupMutation.isPending ? '나가는 중' : '나가기'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={[styles.liveCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.liveTop}>
          <View>
            <Text style={styles.liveLabel}>NOW OPEN</Text>
            <Text style={[styles.liveHour, { color: colors.text }]}>{slotQuery.data ? `${String(slotQuery.data.slot_hour).padStart(2, '0')}:00` : '--:--'}</Text>
          </View>
          <View style={[styles.liveBadge, { backgroundColor: colors.text }]}>
            <Text style={[styles.liveBadgeText, { color: colors.background }]}>WITHLOG ROOM</Text>
          </View>
        </View>
        <Text style={[styles.liveCopy, { color: colors.subtext }]}>{deadlineText}</Text>
      </View>

      <View style={styles.timelineHeader}>
        <View>
          <Text style={[styles.pageDate, { color: colors.subtext }]}>{activePage?.displayDate ?? formatDisplayDate(new Date())}</Text>
          <Text style={[styles.pageHour, { color: colors.text }]}>{activePage?.hourLabel ?? '--:--'}</Text>
        </View>
        <View style={styles.pageBadge}>
          <Text style={styles.pageBadgeText}>{activeIndex + 1}/24</Text>
        </View>
      </View>

      <ScrollView
        ref={timelineRef}
        horizontal
        decelerationRate="normal"
        snapToInterval={pageWidth}
        snapToAlignment="start"
        disableIntervalMomentum
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleTimelineScroll}
        contentContainerStyle={styles.timelineTrack}
      >
        {pages.map((page) => (
          <View key={page.key} style={[styles.page, { width: pageWidth }]}>
            <View style={styles.pageStack}>
              {visibleMembers.map((member) => {
                const post = page.posts.find((item) => item.user.id === member.id);
                const isMine = member.id === user?.id;
                const canKick = group?.ownerId === user?.id && !isMine;
                const canBlock = !isMine;
                const isCurrentSlot = page.dateKey === anchorDate && page.hour === anchorHour;
                if (!post) {
                  return (
                    <View key={`${page.key}-${member.id}`} style={styles.placeholderShell}>
                      <BlurView
                        intensity={isMine && isCurrentSlot ? (isDark ? 48 : 60) : isDark ? 36 : 50}
                        tint={isDark ? 'dark' : 'light'}
                        style={[
                          styles.placeholderCard,
                          {
                            backgroundColor: isMine && isCurrentSlot
                              ? isDark
                                ? 'rgba(25, 21, 19, 0.58)'
                                : 'rgba(226, 217, 206, 0.14)'
                              : isDark
                                ? 'rgba(21, 18, 16, 0.36)'
                                : 'rgba(226, 217, 206, 0.1)',
                            borderColor: isMine && isCurrentSlot ? 'rgba(255,255,255,0.24)' : isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.72)',
                          },
                        ]}
                      >
                        <View style={styles.glassSheen} />
                        <View style={styles.glassRim} />
                        {canKick || canBlock ? (
                          <View style={styles.cardActionRow}>
                            {canBlock ? (
                              <TouchableOpacity style={styles.blockButton} onPress={() => confirmBlockMember(member.id, member.nickname)}>
                                <Ionicons name="ban-outline" size={14} color="#FFFFFF" />
                              </TouchableOpacity>
                            ) : null}
                            {canKick ? (
                              <TouchableOpacity style={styles.kickButton} onPress={() => confirmRemoveMember(member.id, member.nickname)}>
                                <Ionicons name="close" size={14} color="#FFFFFF" />
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        ) : null}
                        {!isMine || !isCurrentSlot ? (
                          <View style={styles.placeholderHead}>
                            <TouchableOpacity style={styles.placeholderUser} activeOpacity={0.85} onPress={() => router.push(`/profile/${member.id}`)}>
                              <Image source={{ uri: member.profileImage || buildProfileImageUrl(null, member.nickname) }} style={styles.placeholderAvatar} />
                              <View style={styles.placeholderNameRow}>
                                <Text style={[styles.placeholderName, { color: colors.text }]}>{member.nickname}</Text>
                                {member.isOwner ? <MaterialCommunityIcons name="crown" size={14} color="#F59E0B" /> : null}
                              </View>
                            </TouchableOpacity>
                          </View>
                        ) : null}
                        {isMine && isCurrentSlot ? (
                          <View style={styles.placeholderCenter}>
                            <TouchableOpacity style={styles.plusButtonSquare} onPress={() => router.push(`/group/upload?id=${groupId}`)}>
                              <Text style={[styles.plusMark, { color: colors.text }]}>+</Text>
                              <Text style={[styles.plusText, { color: colors.text }]}>사진등록하기</Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <View style={styles.placeholderBody}>
                            <Text style={[styles.placeholderHour, { color: colors.text }]}>{page.hourLabel}</Text>
                            <Text style={styles.placeholderEmoji}>😴💤</Text>
                          </View>
                        )}
                      </BlurView>
                    </View>
                  );
                }

                const mapped: Post = {
                  id: post.id,
                  createdAt: formatCreatedAtLabel(post.created_at),
                  dateLabel: page.displayDate,
                  caption: post.caption ?? '',
                  likes: post.likes,
                  likedByMe: post.liked_by_me ?? false,
                  comments: post.comments,
                  filter: post.filter || 'none',
                  thumbnail: buildAssetUrl(post.file_url),
                  mediaType: post.media_type,
                  isMuted: post.is_muted,
                  user: {
                    id: post.user.id,
                    nickname: post.user.nickname,
                    profileImage: buildProfileImageUrl(post.user.profile_image, post.user.nickname),
                    isOwner: post.user.id === group?.ownerId,
                  },
                };

                return (
                  <View key={post.id} style={styles.postWrap}>
                    {canKick || canBlock ? (
                      <View style={styles.cardActionRowFloating}>
                        {canBlock ? (
                          <TouchableOpacity style={styles.blockButton} onPress={() => confirmBlockMember(member.id, member.nickname)}>
                            <Ionicons name="ban-outline" size={14} color="#FFFFFF" />
                          </TouchableOpacity>
                        ) : null}
                        {canKick ? (
                          <TouchableOpacity style={styles.kickButton} onPress={() => confirmRemoveMember(member.id, member.nickname)}>
                            <Ionicons name="close" size={14} color="#FFFFFF" />
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    ) : null}
                    <FeedCard
                      post={mapped}
                      onPressProfile={(selectedPost) => router.push(`/profile/${selectedPost.user.id}`)}
                      onComment={(selectedPost) =>
                        router.push({
                          pathname: '/comments/[postId]',
                          params: {
                            postId: String(selectedPost.id),
                            groupId: String(groupId),
                          },
                        })
                      }
                      onQuote={(quotedPost) =>
                        router.push({
                          pathname: '/group/chat',
                          params: {
                            id: String(groupId),
                            quotePostId: String(quotedPost.id),
                            quoteCaption: quotedPost.caption,
                            quoteThumbnail: encodeURIComponent(quotedPost.thumbnail),
                            quoteAuthor: quotedPost.user.nickname,
                            quoteMode: 'quote',
                          },
                        })
                      }
                      onHeart={(heartedPost) => likeShareMutation.mutate(heartedPost)}
                    />
                    <View style={styles.quoteRailWrap}>
                      <QuoteActivityRail
                        messages={quoteActivityByPostId.get(post.id) ?? []}
                        onPress={() =>
                          router.push({
                            pathname: '/group/chat',
                            params: {
                              id: String(groupId),
                              quotePostId: String(mapped.id),
                              quoteCaption: mapped.caption,
                              quoteThumbnail: encodeURIComponent(mapped.thumbnail),
                              quoteAuthor: mapped.user.nickname,
                              quoteMode: 'quote',
                            },
                          })
                        }
                      />
                    </View>
                  </View>
                );
              })}
              {Array.from({ length: Math.max((group?.maxMembers ?? 0) - visibleMembers.length, 0) }, (_, index) => (
                <TouchableOpacity
                  key={`invite-${page.key}-${index}`}
                  style={styles.placeholderShell}
                  onPress={() => group?.inviteLink ? Share.share({ message: `${group.name} 초대 링크\n${group.inviteLink}` }) : undefined}
                >
                  <BlurView
                    intensity={isDark ? 34 : 50}
                    tint={isDark ? 'dark' : 'light'}
                    style={[
                      styles.placeholderCard,
                      {
                        backgroundColor: isDark ? 'rgba(21, 18, 16, 0.34)' : 'rgba(226, 217, 206, 0.09)',
                        borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.68)',
                      },
                    ]}
                  >
                    <View style={styles.glassSheen} />
                    <View style={styles.glassRim} />
                    <View style={styles.placeholderHead}>
                      <View style={styles.placeholderUser}>
                        <View style={styles.placeholderAvatar} />
                        <Text style={[styles.placeholderName, { color: colors.text }]}>빈 자리</Text>
                      </View>
                      <Ionicons name="person-add-outline" size={18} color={colors.subtext} />
                    </View>
                    <View style={styles.placeholderCenter}>
                      <View style={styles.plusButtonSquare}>
                        <Text style={[styles.plusText, { color: colors.text }]}>초대 링크 보내기</Text>
                      </View>
                    </View>
                  </BlurView>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      <Text style={[styles.timelineHint, { color: colors.subtext }]}>옆으로 넘기면 시간대가 바뀝니다. 미래 시간대는 열리지 않고 최근 24시간만 볼 수 있습니다.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 120, gap: 20 },
  headerShell: { gap: 12, paddingTop: 2, paddingBottom: 2 },
  headerTopLine: { gap: 10 },
  headerLabel: { fontSize: 12, fontWeight: '900', letterSpacing: 1.3 },
  headerLine: { height: 1, width: '100%' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 12, gap: 12 },
  headerCopy: { flex: 1 },
  title: { fontSize: 30, fontWeight: '900' },
  meta: { marginTop: 6, fontWeight: '600' },
  leaveBtn: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1 },
  leaveText: { fontWeight: '800' },
  headerIcons: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  circleIcon: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  liveCard: { borderRadius: 32, borderWidth: 1, padding: 22 },
  liveTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  liveLabel: { color: '#D46C3D', fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  liveHour: { fontSize: 42, fontWeight: '900', marginTop: 8 },
  liveCopy: { marginTop: 8, fontWeight: '700' },
  liveBadge: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  liveBadgeText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  timelineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pageDate: { fontSize: 14, fontWeight: '700' },
  pageHour: { fontSize: 30, fontWeight: '900', marginTop: 4 },
  pageBadge: { backgroundColor: '#171412', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  pageBadgeText: { color: '#FFFFFF', fontWeight: '800' },
  timelineTrack: { alignItems: 'flex-start' },
  page: { paddingHorizontal: 0, paddingRight: 16 },
  pageStack: { gap: 20, alignItems: 'center' },
  postWrap: { width: '100%', alignSelf: 'center' },
  placeholderShell: {
    width: '100%',
    alignSelf: 'center',
    borderRadius: 36,
    overflow: 'hidden',
  },
  cardActionRow: {
    position: 'absolute',
    top: 14,
    right: 14,
    flexDirection: 'row',
    gap: 8,
    zIndex: 4,
  },
  cardActionRowFloating: {
    position: 'absolute',
    top: 16,
    right: 16,
    flexDirection: 'row',
    gap: 8,
    zIndex: 5,
  },
  blockButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(127,29,29,0.86)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kickButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderCard: {
    borderRadius: 36,
    borderWidth: 1,
    padding: 22,
    minHeight: 220,
    justifyContent: 'space-between',
    shadowColor: '#ffffff',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  placeholderHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  placeholderBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  placeholderHour: { fontSize: 28, fontWeight: '900', marginBottom: 8 },
  placeholderEmoji: { fontSize: 34, marginBottom: 12 },
  placeholderUser: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  placeholderAvatar: { width: 40, height: 40, borderRadius: 999, backgroundColor: '#CBD5E1' },
  placeholderNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  placeholderName: { fontSize: 16, fontWeight: '800' },
  placeholderState: { fontWeight: '700' },
  placeholderCopy: { lineHeight: 22, fontWeight: '700', textAlign: 'center' },
  placeholderCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  plusButtonSquare: {
    width: 144,
    height: 144,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  plusMark: { fontSize: 28, fontWeight: '900' },
  plusText: { marginTop: 6, fontWeight: '800' },
  timelineHint: { fontWeight: '600', lineHeight: 22 },
  quoteRailWrap: { marginTop: -18, paddingHorizontal: 10, zIndex: 2 },
  quoteRailShell: {
    borderRadius: 26,
    overflow: 'hidden',
  },
  quoteRail: {
    minHeight: 78,
    borderRadius: 26,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#6A584A',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  quoteRailCurrentUser: { width: 84, alignItems: 'center', gap: 6 },
  quoteRailAvatarWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    overflow: 'hidden',
  },
  quoteRailAvatar: { width: '100%', height: '100%', borderRadius: 999, backgroundColor: '#CBD5E1' },
  quoteRailName: { fontSize: 12, fontWeight: '800' },
  quoteRailCopy: { flex: 1, gap: 3 },
  quoteRailText: { fontWeight: '800', fontSize: 14 },
  quoteRailMeta: { fontWeight: '600', fontSize: 12 },
  glassSheen: {
    position: 'absolute',
    top: 0,
    left: 14,
    right: 14,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  glassRim: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
});
