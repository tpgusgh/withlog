import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Dimensions, Image, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import { AxiosError } from 'axios';

import { api, buildAssetUrl } from '@/services/api';
import { useAuthStore } from '@/store/auth';
import { formatLocalDate } from '@/utils/date';

const { width, height } = Dimensions.get('window');

export default function StoryViewerScreen() {
  const { id, groupId } = useLocalSearchParams<{ id: string; groupId?: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const userId = Number(id);
  const resolvedGroupId = groupId ? Number(groupId) : null;
  const date = formatLocalDate();
  const [activeIndex, setActiveIndex] = useState(0);
  const isOwnHomeStory = !resolvedGroupId && user?.id === userId;

  const feedQuery = useQuery({
    queryKey: ['story-viewer', resolvedGroupId ?? 'home', userId, date],
    enabled: Number.isFinite(userId),
    queryFn: async () => {
      if (resolvedGroupId) {
        const response = await api.get(`/groups/${resolvedGroupId}/feed`, { params: { date } });
        return response.data as {
          hour: number;
          posts: {
            id: number;
            caption: string;
            file_url: string;
            media_type?: 'image' | 'video';
            is_muted?: boolean;
            created_at?: string | null;
            user: { id: number; nickname: string; profile_image?: string | null };
          }[];
        }[];
      }

      const response = await api.get(`/stories/user/${userId}`);
      return [
        {
          hour: 0,
          posts: response.data as {
            id: number;
            caption: string;
            file_url: string;
            media_type?: 'image' | 'video';
            is_muted?: boolean;
            created_at?: string | null;
            user: { id: number; nickname: string; profile_image?: string | null };
          }[],
        },
      ];
    },
  });

  const stories = feedQuery.data?.flatMap((slot) =>
    slot.posts
      .filter((post) => post.user.id === userId)
      .map((post) => ({
        id: post.id,
        nickname: post.user.nickname,
        caption: post.caption,
        imageUrl: buildAssetUrl(post.file_url),
        mediaType: post.media_type ?? 'image',
        isMuted: post.is_muted ?? true,
        hour: post.created_at ? new Date(post.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }) : `${String(slot.hour).padStart(2, '0')}:00`,
        profileImage: post.user.profile_image ? buildAssetUrl(post.user.profile_image) : '',
      })),
  ) ?? [];
  const activeStory = stories[activeIndex] ?? stories[0];

  const deleteMutation = useMutation({
    mutationFn: async (storyId: number) => api.delete(`/stories/${storyId}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['home-stories'] });
      await queryClient.invalidateQueries({ queryKey: ['story-viewer', 'home', userId, date] });
      if (stories.length <= 1) {
        router.back();
      }
    },
    onError: (err) => {
      const message =
        err instanceof AxiosError ? (err.response?.data?.detail as string | undefined) ?? err.message : '스토리 삭제에 실패했습니다.';
      Alert.alert('오류', message);
    },
  });

  const handleDelete = () => {
    if (!activeStory) {
      return;
    }
    Alert.alert('스토리 삭제', '이 스토리를 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => deleteMutation.mutate(activeStory.id),
      },
    ]);
  };

  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
    setActiveIndex(nextIndex);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {isOwnHomeStory && activeStory ? (
          <TouchableOpacity style={styles.deleteButton} onPress={handleDelete} disabled={deleteMutation.isPending}>
            <Ionicons name="trash-outline" size={22} color="white" />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
          <Ionicons name="close" size={24} color="white" />
        </TouchableOpacity>
      </View>
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={handleScrollEnd}>
        {stories.map((story) => (
          <View key={story.id} style={styles.page}>
            {story.mediaType === 'video' ? (
              <Video source={{ uri: story.imageUrl }} style={styles.image} isMuted resizeMode={ResizeMode.COVER} shouldPlay isLooping />
            ) : (
              <Image source={{ uri: story.imageUrl }} style={styles.image} />
            )}
            <View style={styles.overlay}>
              <View style={styles.topBar}>
                <View style={styles.userWrap}>
                  {story.profileImage ? <Image source={{ uri: story.profileImage }} style={styles.avatar} /> : <View style={styles.avatar} />}
                  <Text style={styles.nickname}>{story.nickname}</Text>
                </View>
                <Text style={styles.hour}>{story.hour}</Text>
              </View>
              <View style={styles.centerCopy}>
                <Text style={styles.mainHour}>{story.hour}</Text>
                <Text style={styles.caption}>{story.caption || '오늘의 기록'}</Text>
              </View>
            </View>
          </View>
        ))}
        {!stories.length ? (
          <View style={styles.emptyPage}>
            <Text style={styles.emptyText}>아직 올라온 스토리가 없어요.</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  header: { position: 'absolute', top: 56, right: 20, zIndex: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  deleteButton: { width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(127,29,29,0.72)', alignItems: 'center', justifyContent: 'center' },
  closeButton: { width: 40, height: 40, borderRadius: 999, backgroundColor: 'rgba(15,23,42,0.48)', alignItems: 'center', justifyContent: 'center' },
  page: { width, height, padding: 14, justifyContent: 'center' },
  image: { width: width - 28, height: height - 120, borderRadius: 32, backgroundColor: '#334155' },
  overlay: { ...StyleSheet.absoluteFillObject, paddingHorizontal: 36, paddingVertical: 42, justifyContent: 'space-between' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 70 },
  userWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 42, height: 42, borderRadius: 999, backgroundColor: '#CBD5E1' },
  nickname: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
  hour: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  centerCopy: { alignItems: 'center', marginBottom: 130 },
  mainHour: { color: '#FFFFFF', fontSize: 54, fontWeight: '900' },
  caption: { color: '#FFFFFF', fontSize: 28, fontWeight: '500', marginTop: 8, textAlign: 'center' },
  emptyPage: { width, height, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
});
