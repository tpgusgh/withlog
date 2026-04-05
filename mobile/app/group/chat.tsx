import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
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

import { api, buildAssetUrl, buildProfileImageUrl } from '@/services/api';
import { useAuthStore } from '@/store/auth';
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
  const currentUser = useAuthStore((state) => state.user);
  const [text, setText] = useState('');
  const [selectedImage, setSelectedImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [ambientKey, setAmbientKey] = useState<'none' | 'rain' | 'forest'>('none');
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);
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
        reply?: { message_id?: number | null; content?: string | null; author_nickname?: string | null } | null;
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
          reply: message.reply
            ? {
                messageId: message.reply.message_id ?? null,
                content: message.reply.content ?? null,
                authorNickname: message.reply.author_nickname ?? null,
              }
            : null,
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
        if (replyTarget?.id) {
          formData.append('reply_message_id', String(replyTarget.id));
        }
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
        reply_message_id: replyTarget?.id ?? null,
      });
      return response.data;
    },
    onSuccess: async () => {
      setText('');
      setSelectedImage(null);
      setReplyTarget(null);
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
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 6 : 0}
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
        contentContainerStyle={styles.messagesContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {chatQuery.data?.map((message) => (
          <View key={message.id} style={[styles.messageRow, message.user.id === currentUser?.id ? styles.messageRowMine : styles.messageRowTheirs]}>
            {message.user.id !== currentUser?.id ? <Image source={{ uri: message.user.profileImage || buildProfileImageUrl(null, message.user.nickname) }} style={styles.avatar} /> : null}
            <View style={[styles.messageWrap, message.user.id === currentUser?.id ? styles.messageWrapMine : styles.messageWrapTheirs]}>
              <View style={[styles.messageMeta, message.user.id === currentUser?.id ? styles.messageMetaMine : styles.messageMetaTheirs]}>
                {message.user.id === currentUser?.id ? <Image source={{ uri: message.user.profileImage || buildProfileImageUrl(null, message.user.nickname) }} style={styles.myAvatar} /> : null}
                {message.user.id !== currentUser?.id ? <Text style={[styles.author, { color: colors.text }]}>{message.user.nickname}</Text> : null}
                <Text style={[styles.time, { color: colors.subtext }]}>{message.createdAt}</Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.92}
                delayLongPress={220}
                onLongPress={() => setSelectedMessage(message)}
                style={[
                  styles.bubble,
                  message.user.id === currentUser?.id
                    ? [styles.bubbleMine, { backgroundColor: colors.text }]
                    : [styles.bubbleTheirs, { backgroundColor: colors.card, borderColor: colors.border }],
                ]}
              >
                {message.reply ? (
                  <View
                    style={[
                      styles.replyCard,
                      message.user.id === currentUser?.id
                        ? styles.quoteCardMine
                        : [styles.quoteCardTheirs, { backgroundColor: colors.background, borderColor: colors.border }],
                    ]}
                  >
                    <Text style={[styles.replyAuthor, { color: message.user.id === currentUser?.id ? colors.background : colors.text }]}>
                      {message.reply.authorNickname}
                    </Text>
                    <Text
                      style={[styles.replyContent, { color: message.user.id === currentUser?.id ? 'rgba(247,242,236,0.78)' : colors.subtext }]}
                      numberOfLines={2}
                    >
                      {message.reply.content || '사진을 보냈어요'}
                    </Text>
                  </View>
                ) : null}
                {message.quote ? (
                  <View
                    style={[
                      styles.quoteCard,
                      message.user.id === currentUser?.id
                        ? styles.quoteCardMine
                        : [styles.quoteCardTheirs, { backgroundColor: colors.background, borderColor: colors.border }],
                    ]}
                  >
                    {message.quote.thumbnailUrl ? <Image source={{ uri: message.quote.thumbnailUrl }} style={styles.quoteThumb} /> : null}
                    <View style={styles.quoteCopy}>
                      <Text style={[styles.quoteAuthor, { color: message.user.id === currentUser?.id ? colors.background : colors.text }]}>
                        {message.quote.authorNickname}
                      </Text>
                      <Text
                        style={[styles.quoteCaption, { color: message.user.id === currentUser?.id ? 'rgba(247,242,236,0.78)' : colors.subtext }]}
                        numberOfLines={2}
                      >
                        {message.quote.caption || '사진 인용'}
                      </Text>
                    </View>
                  </View>
                ) : null}
                {message.mediaUrl ? <Image source={{ uri: message.mediaUrl }} style={styles.chatImage} /> : null}
                {!!message.content && (
                  <Text style={[styles.messageText, { color: message.user.id === currentUser?.id ? colors.background : colors.text }]}>
                    {message.content}
                  </Text>
                )}
                {message.messageType === 'heart' ? (
                  <Text style={[styles.heartText, { color: message.user.id === currentUser?.id ? '#FFD5DE' : '#FB7185' }]}>하트를 보냈어요</Text>
                ) : null}
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      {replyTarget ? (
        <View style={[styles.replyComposer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.replyComposerCopy}>
            <Text style={[styles.replyComposerLabel, { color: colors.text }]}>{replyTarget.user.nickname}님에게 답장</Text>
            <Text style={[styles.replyComposerText, { color: colors.subtext }]} numberOfLines={1}>
              {replyTarget.content || (replyTarget.mediaUrl ? '사진을 보냈어요' : '')}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setReplyTarget(null)}>
            <Ionicons name="close" size={18} color={colors.subtext} />
          </TouchableOpacity>
        </View>
      ) : null}
      {quote ? (
        <View style={[styles.quoteComposer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.quoteComposerLabel, { color: colors.text }]}>{quote.mode === 'heart' ? '하트 공유' : '사진 인용'}</Text>
          <Text style={[styles.quoteComposerText, { color: colors.subtext }]} numberOfLines={2}>{quote.authorNickname} · {quote.caption || '사진 기록'}</Text>
        </View>
      ) : null}
      {selectedImage ? <Image source={{ uri: selectedImage.uri }} style={styles.selectedImage} /> : null}

      <Modal visible={Boolean(selectedMessage)} transparent animationType="fade" onRequestClose={() => setSelectedMessage(null)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setSelectedMessage(null)}>
          <View style={[styles.actionSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.actionTitle, { color: colors.text }]}>메시지 액션</Text>
            <Text style={[styles.actionCaption, { color: colors.subtext }]} numberOfLines={2}>
              {selectedMessage?.content || (selectedMessage?.mediaUrl ? '사진을 보냈어요' : '')}
            </Text>
            <TouchableOpacity
              style={[styles.actionPrimary, { backgroundColor: colors.text }]}
              onPress={() => {
                if (selectedMessage) {
                  setReplyTarget(selectedMessage);
                }
                setSelectedMessage(null);
              }}
            >
              <Text style={[styles.actionPrimaryText, { color: colors.background }]}>답장하기</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionSecondary} onPress={() => setSelectedMessage(null)}>
              <Text style={[styles.actionSecondaryText, { color: colors.subtext }]}>닫기</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <View style={[styles.composerShell, { borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={[styles.composer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TouchableOpacity style={[styles.composerIcon, { backgroundColor: colors.background }]} onPress={pickImage}>
            <Ionicons name="image-outline" size={22} color={colors.text} />
          </TouchableOpacity>
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            textAlignVertical="top"
            style={[styles.input, { color: colors.text }]}
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
  messagesContent: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 28, gap: 16 },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  messageRowMine: { justifyContent: 'flex-end' },
  messageRowTheirs: { justifyContent: 'flex-start' },
  messageWrap: { maxWidth: '78%', gap: 6 },
  messageWrapMine: { alignItems: 'flex-end' },
  messageWrapTheirs: { alignItems: 'flex-start' },
  messageMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  messageMetaMine: { justifyContent: 'flex-end' },
  messageMetaTheirs: { justifyContent: 'flex-start', paddingLeft: 4 },
  avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#CBD5E1' },
  myAvatar: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#CBD5E1' },
  author: { fontWeight: '800' },
  time: { fontSize: 12, fontWeight: '600' },
  bubble: { gap: 10, padding: 12, borderWidth: 1, borderRadius: 24 },
  bubbleMine: { borderColor: 'transparent', borderBottomRightRadius: 8 },
  bubbleTheirs: { borderBottomLeftRadius: 8 },
  replyCard: { borderWidth: 1, borderRadius: 16, padding: 10, gap: 4 },
  replyAuthor: { fontWeight: '800' },
  replyContent: { lineHeight: 18 },
  quoteCard: { flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: 16, padding: 10 },
  quoteCardMine: { borderColor: 'rgba(247,242,236,0.18)', backgroundColor: 'rgba(247,242,236,0.08)' },
  quoteCardTheirs: {},
  quoteThumb: { width: 52, height: 52, borderRadius: 12, backgroundColor: '#CBD5E1' },
  quoteCopy: { flex: 1, justifyContent: 'center' },
  quoteAuthor: { fontWeight: '800' },
  quoteCaption: { marginTop: 4, lineHeight: 18 },
  chatImage: { width: 200, height: 240, borderRadius: 18, backgroundColor: '#CBD5E1' },
  messageText: { fontSize: 15, lineHeight: 22 },
  heartText: { fontWeight: '800' },
  replyComposer: { marginHorizontal: 20, borderWidth: 1, borderRadius: 18, padding: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  replyComposerCopy: { flex: 1, gap: 4 },
  replyComposerLabel: { fontWeight: '800' },
  replyComposerText: { lineHeight: 18 },
  quoteComposer: { marginHorizontal: 20, borderWidth: 1, borderRadius: 18, padding: 12, marginBottom: 10 },
  quoteComposerLabel: { fontWeight: '800' },
  quoteComposerText: { marginTop: 4, lineHeight: 18 },
  selectedImage: { width: 72, height: 72, borderRadius: 14, marginHorizontal: 20, marginBottom: 10 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.42)', justifyContent: 'flex-end', padding: 16 },
  actionSheet: { borderWidth: 1, borderRadius: 28, padding: 18, gap: 14 },
  actionTitle: { fontSize: 18, fontWeight: '900' },
  actionCaption: { lineHeight: 20, fontWeight: '600' },
  actionPrimary: { borderRadius: 18, paddingVertical: 15, alignItems: 'center' },
  actionPrimaryText: { fontWeight: '800' },
  actionSecondary: { alignItems: 'center', paddingVertical: 8 },
  actionSecondaryText: { fontWeight: '700' },
  composerShell: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, borderWidth: 1, borderRadius: 28, paddingHorizontal: 10, paddingVertical: 10 },
  composerIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, minHeight: 22, maxHeight: 100, paddingHorizontal: 2, paddingVertical: 8, fontSize: 15, lineHeight: 22 },
  send: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { opacity: 0.45 },
});
