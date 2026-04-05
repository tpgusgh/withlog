import { useMemo, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api, buildProfileImageUrl } from '@/services/api';
import { useAppTheme } from '@/store/theme';
import type { CommentItem } from '@/types';
import { formatCreatedAtLabel } from '@/utils/date';

const REACTION_OPTIONS = ['❤️', '😂', '🔥', '😮', '👏'] as const;

type ApiComment = {
  id: number;
  content: string;
  parent_id?: number | null;
  created_at?: string | null;
  reply_count?: number;
  my_reaction?: string | null;
  reactions?: { emoji: string; count: number }[];
  user: { id: number; nickname: string; profile_image?: string | null };
  replies?: ApiComment[];
};

const mapComment = (comment: ApiComment): CommentItem => ({
  id: comment.id,
  content: comment.content,
  createdAt: formatCreatedAtLabel(comment.created_at),
  parentId: comment.parent_id ?? null,
  replyCount: comment.reply_count ?? 0,
  myReaction: comment.my_reaction ?? null,
  reactions: comment.reactions ?? [],
  replies: (comment.replies ?? []).map(mapComment),
  user: {
    id: comment.user.id,
    nickname: comment.user.nickname,
    profileImage: buildProfileImageUrl(comment.user.profile_image, comment.user.nickname),
  },
});

function CommentCard({
  comment,
  colors,
  onLongPress,
  replyTargetId,
}: {
  comment: CommentItem;
  colors: { background: string; card: string; border: string; text: string; subtext: string };
  onLongPress: (comment: CommentItem) => void;
  replyTargetId?: number | null;
}) {
  return (
    <View style={styles.commentBlock}>
      <View style={styles.commentRow}>
        <Image source={{ uri: comment.user.profileImage || buildProfileImageUrl(null, comment.user.nickname) }} style={styles.avatar} />
        <TouchableOpacity
          activeOpacity={0.92}
          delayLongPress={220}
          onLongPress={() => onLongPress(comment)}
          style={[styles.commentCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <View style={styles.commentMeta}>
            <Text style={[styles.commentAuthor, { color: colors.text }]}>{comment.user.nickname}</Text>
            <Text style={[styles.commentTime, { color: colors.subtext }]}>{comment.createdAt}</Text>
          </View>
          <Text style={[styles.commentContent, { color: colors.text }]}>{comment.content}</Text>
          <View style={styles.commentFooter}>
            <Text style={[styles.replyButton, { color: replyTargetId === comment.id ? colors.text : colors.subtext }]}>
              {replyTargetId === comment.id ? '답글 작성 중' : '길게 눌러 답글 또는 반응'}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reactionRow}>
              {REACTION_OPTIONS.map((emoji) => {
                const count = comment.reactions.find((reaction) => reaction.emoji === emoji)?.count ?? 0;
                const active = comment.myReaction === emoji;
                return (
                  <View
                    key={`${comment.id}-${emoji}`}
                    style={[
                      styles.reactionChip,
                      {
                        backgroundColor: active ? colors.text : colors.background,
                        borderColor: active ? colors.text : colors.border,
                      },
                    ]}
                  >
                    <Text style={styles.reactionEmoji}>{emoji}</Text>
                    {count > 0 ? (
                      <Text style={[styles.reactionCount, { color: active ? colors.background : colors.text }]}>{count}</Text>
                    ) : null}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </View>
      {comment.replies.length ? (
        <View style={styles.replyList}>
          {comment.replies.map((reply) => (
            <CommentCard
              key={reply.id}
              comment={reply}
              colors={colors}
              onLongPress={onLongPress}
              replyTargetId={replyTargetId}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function CommentScreen() {
  const { postId, groupId } = useLocalSearchParams<{ postId: string; groupId?: string }>();
  const queryClient = useQueryClient();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const postIdNumber = Number(postId);
  const groupIdNumber = Number(groupId);
  const [text, setText] = useState('');
  const [replyTarget, setReplyTarget] = useState<CommentItem | null>(null);
  const [selectedComment, setSelectedComment] = useState<CommentItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const commentsQuery = useQuery({
    queryKey: ['comments', postIdNumber],
    enabled: Number.isFinite(postIdNumber),
    queryFn: async () => {
      const response = await api.get(`/comments/post/${postIdNumber}`);
      return (response.data as ApiComment[]).map(mapComment);
    },
  });

  const flatCount = useMemo(
    () => (commentsQuery.data ?? []).reduce((total, comment) => total + 1 + comment.replies.length, 0),
    [commentsQuery.data],
  );

  const createCommentMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        content: text.trim(),
        parent_id: replyTarget?.id ?? null,
      };
      return api.post(`/comments/post/${postIdNumber}`, payload);
    },
    onSuccess: async () => {
      setText('');
      setReplyTarget(null);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['comments', postIdNumber] });
      if (Number.isFinite(groupIdNumber)) {
        await queryClient.invalidateQueries({ queryKey: ['group-feed-window', groupIdNumber] });
      }
    },
    onError: (err) => {
      const message = err instanceof AxiosError ? (err.response?.data?.detail as string | undefined) ?? err.message : '댓글 등록에 실패했습니다.';
      setError(message);
    },
  });

  const reactMutation = useMutation({
    mutationFn: async ({ commentId, emoji }: { commentId: number; emoji: string }) =>
      api.post(`/comments/${commentId}/reaction`, { emoji }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['comments', postIdNumber] });
    },
  });

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 8 : 0}
    >
      <ScrollView
        style={styles.list}
        contentContainerStyle={[styles.listContent, { paddingBottom: 28 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.summaryLabel, { color: colors.subtext }]}>COMMENT ROOM</Text>
          <Text style={[styles.summaryValue, { color: colors.text }]}>{flatCount}개</Text>
          <Text style={[styles.summaryCopy, { color: colors.subtext }]}>이모티콘 반응과 답글을 남길 수 있어요.</Text>
        </View>

        {(commentsQuery.data ?? []).map((comment) => (
          <CommentCard
            key={comment.id}
            comment={comment}
            colors={colors}
            onLongPress={setSelectedComment}
            replyTargetId={replyTarget?.id}
          />
        ))}

        {!commentsQuery.isLoading && !(commentsQuery.data ?? []).length ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>첫 댓글을 남겨보세요</Text>
            <Text style={[styles.emptyText, { color: colors.subtext }]}>짧게 남겨도 되고, 바로 답글로 이어가도 됩니다.</Text>
          </View>
        ) : null}
      </ScrollView>

      {replyTarget ? (
        <View style={[styles.replyBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.replyBannerCopy}>
            <Text style={[styles.replyBannerLabel, { color: colors.text }]}>{replyTarget.user.nickname}님에게 답글</Text>
            <Text style={[styles.replyBannerText, { color: colors.subtext }]} numberOfLines={1}>{replyTarget.content}</Text>
          </View>
          <TouchableOpacity onPress={() => setReplyTarget(null)}>
            <Text style={[styles.replyCancel, { color: colors.subtext }]}>취소</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <Modal visible={Boolean(selectedComment)} transparent animationType="fade" onRequestClose={() => setSelectedComment(null)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setSelectedComment(null)}>
          <View style={[styles.actionSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.actionTitle, { color: colors.text }]}>댓글 액션</Text>
            <Text style={[styles.actionCaption, { color: colors.subtext }]} numberOfLines={2}>
              {selectedComment?.content}
            </Text>
            <View style={styles.actionEmojiRow}>
              {REACTION_OPTIONS.map((emoji) => (
                <TouchableOpacity
                  key={`sheet-${emoji}`}
                  style={[styles.actionEmojiButton, { backgroundColor: colors.background, borderColor: colors.border }]}
                  onPress={() => {
                    if (selectedComment) {
                      reactMutation.mutate({ commentId: selectedComment.id, emoji });
                    }
                    setSelectedComment(null);
                  }}
                >
                  <Text style={styles.actionEmojiText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[styles.actionPrimary, { backgroundColor: colors.text }]}
              onPress={() => {
                if (selectedComment) {
                  setReplyTarget(selectedComment);
                }
                setSelectedComment(null);
              }}
            >
              <Text style={[styles.actionPrimaryText, { color: colors.background }]}>답글 달기</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionSecondary} onPress={() => setSelectedComment(null)}>
              <Text style={[styles.actionSecondaryText, { color: colors.subtext }]}>닫기</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <View style={[styles.composerShell, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={[styles.composer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            textAlignVertical="top"
            style={[styles.input, { color: colors.text }]}
            placeholder={replyTarget ? '답글을 입력하세요' : '댓글을 입력하세요'}
            placeholderTextColor="#94A3B8"
          />
          <TouchableOpacity
            style={[styles.sendButton, { backgroundColor: colors.text }, !text.trim() && styles.sendButtonDisabled]}
            onPress={() => createCommentMutation.mutate()}
            disabled={createCommentMutation.isPending || !text.trim()}
          >
            <Text style={[styles.sendButtonText, { color: colors.background }]}>등록</Text>
          </TouchableOpacity>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { flex: 1 },
  listContent: { padding: 16, gap: 14 },
  summaryCard: { borderWidth: 1, borderRadius: 24, padding: 18 },
  summaryLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  summaryValue: { fontSize: 30, fontWeight: '900', marginTop: 6 },
  summaryCopy: { marginTop: 8, lineHeight: 20, fontWeight: '600' },
  commentBlock: { gap: 10 },
  commentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#CBD5E1' },
  commentCard: { flex: 1, borderWidth: 1, borderRadius: 22, padding: 14, gap: 10 },
  commentMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  commentAuthor: { fontWeight: '800' },
  commentTime: { fontSize: 12, fontWeight: '600' },
  commentContent: { fontSize: 15, lineHeight: 22 },
  commentFooter: { gap: 10 },
  replyButton: { fontWeight: '700' },
  reactionRow: { gap: 8 },
  reactionChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { fontSize: 12, fontWeight: '800' },
  replyList: { marginLeft: 44, gap: 10 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.42)', justifyContent: 'flex-end', padding: 16 },
  actionSheet: { borderWidth: 1, borderRadius: 28, padding: 18, gap: 14 },
  actionTitle: { fontSize: 18, fontWeight: '900' },
  actionCaption: { lineHeight: 20, fontWeight: '600' },
  actionEmojiRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  actionEmojiButton: { flex: 1, borderWidth: 1, borderRadius: 18, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  actionEmojiText: { fontSize: 24 },
  actionPrimary: { borderRadius: 18, paddingVertical: 15, alignItems: 'center' },
  actionPrimaryText: { fontWeight: '800' },
  actionSecondary: { alignItems: 'center', paddingVertical: 8 },
  actionSecondaryText: { fontWeight: '700' },
  emptyCard: { borderWidth: 1, borderRadius: 24, padding: 20, alignItems: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '900' },
  emptyText: { marginTop: 6, lineHeight: 20, textAlign: 'center' },
  replyBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderWidth: 1, borderRadius: 18, marginHorizontal: 16, marginBottom: 10, padding: 12 },
  replyBannerCopy: { flex: 1, gap: 4 },
  replyBannerLabel: { fontWeight: '800' },
  replyBannerText: { fontWeight: '600' },
  replyCancel: { fontWeight: '700' },
  composerShell: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, borderWidth: 1, borderRadius: 26, paddingHorizontal: 12, paddingVertical: 10 },
  input: { flex: 1, minHeight: 22, maxHeight: 110, fontSize: 15, lineHeight: 22, paddingVertical: 8 },
  sendButton: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 11 },
  sendButtonDisabled: { opacity: 0.45 },
  sendButtonText: { fontWeight: '800' },
  error: { color: '#DC2626', fontWeight: '600', marginTop: 8, marginLeft: 4 },
});
