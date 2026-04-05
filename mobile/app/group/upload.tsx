import { View, Text, TouchableOpacity, TextInput, StyleSheet, Dimensions, Image, ScrollView } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { Video, ResizeMode } from 'expo-av';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';

import { api } from '@/services/api';
import { useAuthStore } from '@/store/auth';
import { useAppTheme } from '@/store/theme';
import { formatLocalDate } from '@/utils/date';

const { width } = Dimensions.get('window');
const quickEmojis = ['😀', '😍', '🥹', '🔥', '✨', '🎉', '🖤', '💭'];

type CapturedAsset = {
  uri: string;
  type: 'image' | 'video';
  fileName?: string;
  mimeType?: string | null;
};

export default function UploadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const { isDark } = useAppTheme();
  const cameraRef = useRef<CameraView | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();
  const groupId = Number(id);
  const [asset, setAsset] = useState<CapturedAsset | null>(null);
  const [text, setText] = useState('지금 여기');
  const [captureMode, setCaptureMode] = useState<'image' | 'video'>('image');
  const [isMuted, setIsMuted] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'back' | 'front'>('back');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const x = useSharedValue(24);
  const y = useSharedValue(40);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isRecording) {
      setRecordingSeconds(0);
      return;
    }
    const timer = setInterval(() => {
      setRecordingSeconds((current) => Math.min(current + 1, 10));
    }, 1000);
    return () => clearInterval(timer);
  }, [isRecording]);

  const slotQuery = useQuery({
    queryKey: ['current-slot', groupId],
    enabled: Number.isFinite(groupId),
    queryFn: async () => {
      const response = await api.get(`/groups/${groupId}/current-slot`);
      return response.data as { slot_id: number; is_open: boolean };
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!asset || !slotQuery.data?.slot_id) {
        throw new Error('업로드할 파일을 먼저 선택하세요.');
      }

      const formData = new FormData();
      formData.append('media_type', asset.type);
      formData.append('is_muted', String(isMuted));
      formData.append('caption_text', text);
      formData.append('text_x', String(x.value / width));
      formData.append('text_y', String(y.value / (width * 1.35)));
      formData.append('file', {
        uri: asset.uri,
        name: asset.fileName ?? `upload.${asset.type === 'video' ? 'mp4' : 'jpg'}`,
        type: asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
      } as never);

      const response = await api.post(`/posts/slot/${slotQuery.data.slot_id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data as { id: number; file_url: string; is_muted: boolean };
    },
    onSuccess: async (uploaded) => {
      const createdAt = new Date().toISOString();
      const today = formatLocalDate();
      queryClient.setQueryData(['group-feed-window', groupId, today], (oldData: unknown) => {
        if (!Array.isArray(oldData) || !slotQuery.data || !user) {
          return oldData;
        }

        const nextPost = {
          id: uploaded.id,
          caption: text,
          file_url: uploaded.file_url,
          media_type: asset?.type === 'video' ? 'video' : 'image',
          filter: 'none',
          is_muted: uploaded.is_muted,
          likes: 0,
          liked_by_me: false,
          comments: 0,
          created_at: createdAt,
          user: {
            id: user.id,
            nickname: user.nickname,
            profile_image: user.profileImage ?? null,
          },
        };

        return oldData.map((day) => {
          const typedDay = day as { dateKey: string; slots?: { hour: number; posts?: typeof nextPost[] }[] };
          if (typedDay.dateKey !== today || !Array.isArray(typedDay.slots)) {
            return typedDay;
          }

          const hasCurrentSlot = typedDay.slots.some((slot) => slot.hour === new Date().getHours());
          const slots = (hasCurrentSlot ? typedDay.slots : [...typedDay.slots, { hour: new Date().getHours(), posts: [] }]).map((slot) => {
            if (slot.hour !== new Date().getHours()) {
              return slot;
            }
            const posts = Array.isArray(slot.posts) ? slot.posts.filter((post) => post.user.id !== user.id) : [];
            return { ...slot, posts: [nextPost, ...posts] };
          });
          return { ...typedDay, slots };
        });
      });

      queryClient.setQueryData(['home-feed', groupId], (oldData: unknown) => {
        if (!Array.isArray(oldData) || !user) {
          return oldData;
        }
        const nextPost = {
          id: uploaded.id,
          file_url: uploaded.file_url,
          created_at: createdAt,
          user: {
            id: user.id,
            nickname: user.nickname,
            profile_image: user.profileImage ?? null,
          },
        };
        return oldData.map((slot) => {
          const typedSlot = slot as { hour: number; posts?: typeof nextPost[] };
          if (typedSlot.hour !== new Date().getHours()) {
            return typedSlot;
          }
          const posts = Array.isArray(typedSlot.posts) ? typedSlot.posts.filter((post) => post.user.id !== user.id) : [];
          return { ...typedSlot, posts: [nextPost, ...posts] };
        });
      });

      await queryClient.invalidateQueries({ queryKey: ['group-feed-window', groupId] });
      await queryClient.invalidateQueries({ queryKey: ['home-feed', groupId] });
      await queryClient.invalidateQueries({ queryKey: ['current-slot', groupId] });
      router.back();
    },
    onError: (err) => {
      const message =
        err instanceof AxiosError ? (err.response?.data?.detail as string | undefined) ?? err.message : '업로드에 실패했습니다.';
      setError(message);
    },
  });

  const deadlineText = (() => {
    const slot = slotQuery.data;
    if (!slot) {
      return '슬롯 불러오는 중';
    }
    if (!slot.is_open) {
      return '이번 업로드 창이 닫혔어요';
    }
    return '지금 업로드 가능한 시간대예요';
  })();

  const gesture = Gesture.Pan().onChange((e) => {
    x.value += e.changeX;
    y.value += e.changeY;
  });

  const overlayStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }],
  }));

  const ensurePermissions = async (mode: 'image' | 'video') => {
    const nextCamera = cameraPermission?.granted ? cameraPermission : await requestCameraPermission();
    if (!nextCamera.granted) {
      setError('카메라 권한을 허용해야 촬영할 수 있어요.');
      return false;
    }
    if (mode === 'video') {
      const nextMic = microphonePermission?.granted ? microphonePermission : await requestMicrophonePermission();
      if (!nextMic.granted) {
        setError('영상 촬영에는 마이크 권한이 필요해요.');
        return false;
      }
    }
    return true;
  };

  const captureMedia = async (mode: 'image' | 'video') => {
    setCaptureMode(mode);
    setError(null);
    const allowed = await ensurePermissions(mode);
    if (!allowed || !cameraRef.current) {
      return;
    }

    if (asset) {
      setAsset(null);
      return;
    }

    if (mode === 'image') {
      const picture = await cameraRef.current.takePictureAsync({ quality: 1, shutterSound: false });
      setAsset({
        uri: picture.uri,
        type: 'image',
        fileName: `camera-${Date.now()}.jpg`,
        mimeType: 'image/jpeg',
      });
      setIsMuted(false);
      return;
    }

    if (isRecording) {
      cameraRef.current.stopRecording();
      return;
    }

    try {
      setIsRecording(true);
      setRecordingSeconds(0);
      const video = await cameraRef.current.recordAsync({ maxDuration: 10 });
      if (video?.uri) {
        setAsset({
          uri: video.uri,
          type: 'video',
          fileName: `camera-${Date.now()}.mp4`,
          mimeType: 'video/mp4',
        });
      }
    } finally {
      setIsRecording(false);
    }
  };

  return (
    <ScrollView style={[styles.container, isDark && styles.containerDark]} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={[styles.title, isDark && styles.titleDark]}>스토리 업로드</Text>
        <Text style={[styles.headerSub, isDark && styles.headerSubDark]}>{deadlineText}</Text>
      </View>

      <View style={[styles.infoCard, isDark && styles.infoCardDark]}>
        <Text style={styles.infoLabel}>현재 슬롯</Text>
        <Text style={[styles.infoHour, isDark && styles.infoHourDark]}>
          {slotQuery.data ? `${String(new Date().getHours()).padStart(2, '0')}:00` : '--:--'}
        </Text>
        <Text style={[styles.infoCopy, isDark && styles.infoCopyDark]}>
          {slotQuery.data?.is_open ? '앱 안 카메라로 바로 찍고 올릴 수 있어요.' : '다음 슬롯이 열리면 다시 시도할 수 있어요.'}
        </Text>
      </View>

      <View style={styles.captureRow}>
        <TouchableOpacity style={[styles.captureButton, isDark && styles.captureButtonDark, captureMode === 'image' && styles.captureButtonActive]} onPress={() => setCaptureMode('image')} disabled={isRecording}>
          <Text style={[styles.captureButtonText, isDark && styles.captureButtonTextDark, captureMode === 'image' && styles.captureButtonTextActive]}>사진 모드</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.captureButton, isDark && styles.captureButtonDark, captureMode === 'video' && styles.captureButtonActive]} onPress={() => setCaptureMode('video')} disabled={isRecording}>
          <Text style={[styles.captureButtonText, isDark && styles.captureButtonTextDark, captureMode === 'video' && styles.captureButtonTextActive]}>영상 모드</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.mediaBox, isDark && styles.mediaBoxDark]}>
        {asset ? (
          asset.type === 'video' ? (
            <Video source={{ uri: asset.uri }} style={styles.media} isMuted resizeMode={ResizeMode.COVER} shouldPlay isLooping />
          ) : (
            <Image source={{ uri: asset.uri }} style={styles.media} />
          )
        ) : cameraPermission?.granted ? (
          <CameraView
            ref={cameraRef}
            style={styles.media}
            facing={cameraFacing}
            mode={captureMode === 'video' ? 'video' : 'picture'}
            mute={captureMode === 'video' ? isMuted : false}
          />
        ) : (
          <TouchableOpacity style={styles.permissionButton} onPress={() => void ensurePermissions(captureMode)}>
            <Text style={styles.pickText}>카메라 권한 허용하고 촬영 시작</Text>
          </TouchableOpacity>
        )}
        <View style={styles.dateBadge}>
          <Text style={styles.dateText}>
            {now.getFullYear()}.{String(now.getMonth() + 1).padStart(2, '0')}.{String(now.getDate()).padStart(2, '0')}
          </Text>
        </View>
        {captureMode === 'video' && !asset ? (
          <View style={styles.recordingHud}>
            <View style={[styles.recordDot, isRecording && styles.recordDotActive]} />
            <Text style={styles.recordingText}>
              {isRecording ? `${recordingSeconds}초 / 10초` : '최대 10초'}
            </Text>
          </View>
        ) : null}
        <GestureDetector gesture={gesture}>
          <Animated.View style={[styles.overlayWrap, overlayStyle]}>
            <Text style={styles.overlayTime}>{`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`}</Text>
            <Text style={styles.overlay}>{text}</Text>
          </Animated.View>
        </GestureDetector>
      </View>

      <View style={styles.cameraActionRow}>
        <TouchableOpacity style={[styles.utilityButton, isDark && styles.captureButtonDark]} onPress={() => setCameraFacing((current) => (current === 'back' ? 'front' : 'back'))} disabled={Boolean(asset) || isRecording}>
          <Text style={[styles.utilityButtonText, isDark && styles.captureButtonTextDark]}>전환</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.shutterButton, captureMode === 'video' && styles.shutterButtonVideo]} onPress={() => void captureMedia(captureMode)}>
          <View style={[styles.shutterOuter, captureMode === 'video' && styles.shutterOuterVideo, isRecording && styles.shutterOuterRecording]}>
            <View style={[styles.shutterInner, captureMode === 'video' && styles.shutterInnerVideo, isRecording && styles.shutterInnerRecording]} />
          </View>
          <Text style={styles.shutterText}>
            {asset ? '다시 찍기' : captureMode === 'video' ? (isRecording ? `녹화 종료 ${recordingSeconds}초` : '10초 녹화') : '촬영'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.utilityButton, isDark && styles.captureButtonDark]} onPress={() => setAsset(null)} disabled={!asset || isRecording}>
          <Text style={[styles.utilityButtonText, isDark && styles.captureButtonTextDark]}>초기화</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.panel, isDark && styles.panelDark]}>
        <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>문구</Text>
        <TextInput value={text} onChangeText={setText} style={[styles.input, isDark && styles.inputDark]} placeholder="오늘의 한 줄을 적어보세요" placeholderTextColor="#94A3B8" />
        <View style={styles.row}>
          {quickEmojis.map((emoji) => (
            <TouchableOpacity key={emoji} style={[styles.emojiChip, isDark && styles.emojiChipDark]} onPress={() => setText((current) => `${current}${emoji}`)}>
              <Text style={styles.emojiText}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {(captureMode === 'video' || asset?.type === 'video') ? (
          <>
            <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>영상 소리</Text>
            <View style={styles.row}>
              <Chip dark={isDark} label="원본 소리" active={!isMuted} onPress={() => setIsMuted(false)} />
              <Chip dark={isDark} label="음소거" active={isMuted} onPress={() => setIsMuted(true)} />
            </View>
          </>
        ) : null}
      </View>

      <TouchableOpacity style={[styles.submit, (!slotQuery.data?.is_open || uploadMutation.isPending) && styles.submitDisabled]} onPress={() => uploadMutation.mutate()} disabled={uploadMutation.isPending || !slotQuery.data?.is_open}>
        <Text style={styles.submitText}>{uploadMutation.isPending ? '업로드 중...' : '이 스토리 올리기'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Chip({ label, active, onPress, dark }: { label: string; active: boolean; onPress: () => void; dark?: boolean }) {
  return <TouchableOpacity onPress={onPress} style={[styles.chip, dark && styles.chipDark, active && styles.chipActive]}><Text style={[styles.chipText, dark && styles.chipTextDark, active && styles.chipTextActive]}>{label}</Text></TouchableOpacity>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  containerDark: { backgroundColor: '#020617' },
  content: { padding: 20, paddingBottom: 36, gap: 18 },
  header: { marginTop: 12 },
  title: { color: '#0F172A', fontSize: 30, fontWeight: '900' },
  titleDark: { color: '#F8FAFC' },
  headerSub: { color: '#475569', marginTop: 8, fontWeight: '600' },
  headerSubDark: { color: '#94A3B8' },
  infoCard: { backgroundColor: '#ECFEFF', borderRadius: 26, padding: 20, borderWidth: 1, borderColor: '#CFFAFE' },
  infoCardDark: { backgroundColor: '#111827', borderColor: '#1E293B' },
  infoLabel: { color: '#0F766E', fontSize: 12, fontWeight: '800', letterSpacing: 0.9 },
  infoHour: { color: '#0F172A', fontSize: 38, fontWeight: '900', marginTop: 10 },
  infoHourDark: { color: '#F8FAFC' },
  infoCopy: { color: '#334155', fontWeight: '600', marginTop: 8, lineHeight: 20 },
  infoCopyDark: { color: '#CBD5E1' },
  captureRow: { flexDirection: 'row', gap: 10 },
  captureButton: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  captureButtonDark: { backgroundColor: '#111827', borderColor: '#1E293B' },
  captureButtonActive: { backgroundColor: '#111827', borderColor: '#111827' },
  captureButtonText: { color: '#334155', fontWeight: '800' },
  captureButtonTextDark: { color: '#CBD5E1' },
  captureButtonTextActive: { color: '#FFFFFF' },
  mediaBox: { width: width - 40, height: width * 1.2, borderRadius: 32, overflow: 'hidden', backgroundColor: '#CBD5E1', justifyContent: 'center', alignItems: 'center', position: 'relative' },
  mediaBoxDark: { backgroundColor: '#0F172A' },
  media: { width: '100%', height: '100%' },
  permissionButton: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pickText: { color: '#475569', fontWeight: '700' },
  dateBadge: { position: 'absolute', top: 22, right: 22 },
  dateText: { color: 'white', fontSize: 16, fontWeight: '500', letterSpacing: 0.3, textShadowColor: 'rgba(15,23,42,0.35)', textShadowRadius: 10 },
  recordingHud: {
    position: 'absolute',
    top: 22,
    left: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.38)',
  },
  recordDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.65)',
  },
  recordDotActive: {
    backgroundColor: '#EF4444',
  },
  recordingText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  overlayWrap: { position: 'absolute', left: 0, top: 0 },
  overlayTime: { color: 'white', fontSize: 44, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.25)', textShadowRadius: 12 },
  overlay: { color: 'white', fontSize: 26, fontWeight: '500', textShadowColor: 'rgba(0,0,0,0.3)', textShadowRadius: 12, marginTop: 4 },
  cameraActionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  utilityButton: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  utilityButtonText: { color: '#334155', fontWeight: '700' },
  shutterButton: { flex: 1.4, backgroundColor: '#171412', borderRadius: 20, paddingVertical: 14, alignItems: 'center', gap: 8 },
  shutterButtonVideo: { paddingVertical: 12 },
  shutterOuter: {
    width: 58,
    height: 58,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterOuterVideo: { borderColor: '#FCA5A5' },
  shutterOuterRecording: { borderColor: '#F87171' },
  shutterInner: {
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
  },
  shutterInnerVideo: { backgroundColor: '#EF4444' },
  shutterInnerRecording: { width: 24, height: 24, borderRadius: 8 },
  shutterText: { color: '#FFFFFF', fontWeight: '800' },
  panel: { backgroundColor: 'white', borderRadius: 28, padding: 18, borderWidth: 1, borderColor: '#E2E8F0', gap: 12 },
  panelDark: { backgroundColor: '#111827', borderColor: '#1E293B' },
  input: { backgroundColor: '#F8FAFC', borderRadius: 16, padding: 15, color: '#0F172A', borderWidth: 1, borderColor: '#E2E8F0' },
  inputDark: { backgroundColor: '#0F172A', borderColor: '#1E293B', color: '#F8FAFC' },
  sectionTitle: { color: '#0F172A', fontWeight: '800', marginTop: 4 },
  sectionTitleDark: { color: '#F8FAFC' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emojiChip: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emojiChipDark: {
    backgroundColor: '#0F172A',
    borderColor: '#1E293B',
  },
  emojiText: { fontSize: 20 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  chipDark: { backgroundColor: '#0F172A', borderColor: '#1E293B' },
  chipActive: { backgroundColor: '#111827', borderColor: '#111827' },
  chipText: { color: '#475569', fontWeight: '600' },
  chipTextDark: { color: '#CBD5E1' },
  chipTextActive: { color: 'white', fontWeight: '700' },
  submit: { backgroundColor: '#111827', borderRadius: 20, padding: 18, alignItems: 'center' },
  submitDisabled: { opacity: 0.45 },
  submitText: { color: 'white', fontWeight: '800', fontSize: 16 },
  error: { color: '#DC2626', marginTop: 2, fontWeight: '600' },
});
