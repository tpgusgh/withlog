import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api, buildAssetUrl } from '@/services/api';
import { useAppTheme } from '@/store/theme';
import type { ChatMessage } from '@/types';
import { formatCreatedAtLabel } from '@/utils/date';

const AMBIENT_TRACKS = [
  { key: 'none', label: '배경음 없음', uri: '' },
  { key: 'rain', label: '잔잔한 비', uri: 'https://actions.google.com/sounds/v1/ambiences/rain_on_roof.ogg' },
  { key: 'forest', label: '숲 소리', uri: 'https://actions.google.com/sounds/v1/ambiences/forest_ambience.ogg' },
];

export default function GroupChatScreen() {
  const { id, quotePostId, quoteCaption, quoteThumbnail, quoteAuthor, quoteMode } = useLocalSearchParams<{
    id: string;
    quotePostId?: string;
    quoteCaption?: string;
    quoteThumbnail?: string;
    quoteAuthor?: string;
    quoteMode?: string;
  }>();
  const groupId = Number(id);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [selectedImage, setSelectedImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [ambientKey, setAmbientKey] = useState<'none' | 'rain' | 'forest'>('none');
  const soundRef = useRef<Audio.Sound | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);

  const quote = useMemo(
    () =>
      quotePostId
        ? {
            postId: Number(quotePostId),
            caption: quoteCaption ?? '',
            thumbnailUrl: quoteThumbnail ? decodeURIComponent(quoteThumbnail) : '',
            authorNickname: quoteAuthor ?? '',
            mode: quoteMode ?? 'quote',
          }
        : null,
    [quoteAuthor, quoteCaption, quoteMode, quotePostId, quoteThumbnail],
  );

  useEffect(() => {
    const syncAmbient = async () => {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      const track = AMBIENT_TRACKS.find((item) => item.key === ambientKey);
      if (!track || track.key === 'none') {
        return;
      }
      const { sound } = await Audio.Sound.createAsync({ uri: track.uri }, { shouldPlay: true, isLooping: true, volume: 0.35 });
      soundRef.current = sound;
    };
    void syncAmbient();
    return () => {
      void soundRef.current?.unloadAsync();
    };
  }, [ambientKey]);

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
            profileImage: message.user.profile_image ? buildAssetUrl(message.user.profile_image) : null,
          },
        }),
      );
    },
  });

  useEffect(() => {
    if (!chatQuery.data?.length) {
      return;
    }
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: false });
    });
  }, [chatQuery.data]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (selectedImage) {
        const formData = new FormData();
        formData.append('content', text.trim());
        if (quote?.postId) {
          formData.append('quote_post_id', String(quote.postId));
        }
        formData.append('file', {
          uri: selectedImage.uri,
          name: selectedImage.fileName ?? 'chat.jpg',
          type: selectedImage.mimeType ?? 'image/jpeg',
        } as never);
        const response = await api.post(`/groups/${groupId}/chat/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        return response.data;
      }
      const response = await api.post(`/groups/${groupId}/chat`, {
        content: text.trim(),
        quote_post_id: quote?.postId ?? null,
      });
      return response.data;
    },
    onSuccess: async () => {
      setText('');
      setSelectedImage(null);
      await queryClient.invalidateQueries({ queryKey: ['group-chat', groupId] });
      router.setParams({ quotePostId: undefined, quoteCaption: undefined, quoteThumbnail: undefined, quoteAuthor: undefined, quoteMode: undefined });
    },
    onError: (err) => {
      const message = err instanceof AxiosError ? (err.response?.data?.detail as string | undefined) ?? err.message : '채팅 전송에 실패했습니다.';
      Alert.alert('오류', message);
    },
  });

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (!result.canceled) {
      setSelectedImage(result.assets[0]);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior="padding"
      keyboardVerticalOffset={insets.top + (Platform.OS === 'ios' ? 10 : 0)}
    >
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.headerIcon} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>그룹 채팅</Text>
        <TouchableOpacity style={styles.headerIcon} onPress={() => setAmbientKey((current) => (current === 'none' ? 'rain' : 'none'))}>
          <Ionicons name={ambientKey === 'none' ? 'musical-notes-outline' : 'musical-notes'} size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.ambientRow}>
        {AMBIENT_TRACKS.map((track) => (
          <TouchableOpacity key={track.key} style={[styles.ambientChip, { backgroundColor: ambientKey === track.key ? colors.text : colors.card }]} onPress={() => setAmbientKey(track.key as 'none' | 'rain' | 'forest')}>
            <Text style={[styles.ambientText, { color: ambientKey === track.key ? colors.background : colors.text }]}>{track.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.messages}
        contentContainerStyle={[styles.messagesContent, { paddingBottom: 120 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {chatQuery.data?.map((message) => (
          <View key={message.id} style={styles.messageWrap}>
            <View style={styles.messageHead}>
              {message.user.profileImage ? <Image source={{ uri: message.user.profileImage }} style={styles.avatar} /> : <View style={styles.avatar} />}
              <Text style={[styles.author, { color: colors.text }]}>{message.user.nickname}</Text>
              <Text style={[styles.time, { color: colors.subtext }]}>{message.createdAt}</Text>
            </View>
            {message.quote ? (
              <View style={[styles.quoteCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {message.quote.thumbnailUrl ? <Image source={{ uri: message.quote.thumbnailUrl }} style={styles.quoteThumb} /> : null}
                <View style={styles.quoteCopy}>
                  <Text style={[styles.quoteAuthor, { color: colors.text }]}>{message.quote.authorNickname}</Text>
                  <Text style={[styles.quoteCaption, { color: colors.subtext }]} numberOfLines={2}>{message.quote.caption || '사진 인용'}</Text>
                </View>
              </View>
            ) : null}
            {message.mediaUrl ? <Image source={{ uri: message.mediaUrl }} style={styles.chatImage} /> : null}
            {!!message.content && <Text style={[styles.messageText, { color: colors.text }]}>{message.content}</Text>}
            {message.messageType === 'heart' ? <Text style={styles.heartText}>하트를 보냈어요</Text> : null}
          </View>
        ))}
      </ScrollView>

      {quote ? (
        <View style={[styles.quoteComposer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.quoteComposerLabel, { color: colors.text }]}>{quote.mode === 'heart' ? '하트 공유' : '사진 인용'}</Text>
          <Text style={[styles.quoteComposerText, { color: colors.subtext }]} numberOfLines={2}>{quote.authorNickname} · {quote.caption || '사진 기록'}</Text>
        </View>
      ) : null}
      {selectedImage ? <Image source={{ uri: selectedImage.uri }} style={styles.selectedImage} /> : null}

      <View style={[styles.composer, { borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TouchableOpacity style={styles.composerIcon} onPress={pickImage}>
          <Ionicons name="image-outline" size={22} color={colors.text} />
        </TouchableOpacity>
        <TextInput
          value={text}
          onChangeText={setText}
          style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
          placeholder="메시지 보내기"
          placeholderTextColor="#94A3B8"
        />
        <TouchableOpacity
          style={[styles.send, { backgroundColor: colors.text }, (!text.trim() && !selectedImage) && styles.sendDisabled]}
          onPress={() => sendMutation.mutate()}
          disabled={sendMutation.isPending || (!text.trim() && !selectedImage)}
        >
          <Ionicons name="paper-plane" size={18} color={colors.background} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 56, paddingBottom: 14, borderBottomWidth: 1 },
  headerIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '900' },
  ambientRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 14 },
  ambientChip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  ambientText: { fontWeight: '700' },
  messages: { flex: 1 },
  messagesContent: { padding: 20, gap: 14, paddingBottom: 160 },
  messageWrap: { gap: 8 },
  messageHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#CBD5E1' },
  author: { fontWeight: '800' },
  time: { fontSize: 12, fontWeight: '600' },
  quoteCard: { flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: 18, padding: 10 },
  quoteThumb: { width: 52, height: 52, borderRadius: 12, backgroundColor: '#CBD5E1' },
  quoteCopy: { flex: 1, justifyContent: 'center' },
  quoteAuthor: { fontWeight: '800' },
  quoteCaption: { marginTop: 4, lineHeight: 18 },
  chatImage: { width: 180, height: 220, borderRadius: 18, backgroundColor: '#CBD5E1' },
  messageText: { fontSize: 15, lineHeight: 22 },
  heartText: { color: '#FB7185', fontWeight: '800' },
  quoteComposer: { marginHorizontal: 20, borderWidth: 1, borderRadius: 18, padding: 12, marginBottom: 10 },
  quoteComposerLabel: { fontWeight: '800' },
  quoteComposerText: { marginTop: 4, lineHeight: 18 },
  selectedImage: { width: 72, height: 72, borderRadius: 14, marginHorizontal: 20, marginBottom: 10 },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 28, borderTopWidth: 1 },
  composerIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12 },
  send: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.45 },
});
