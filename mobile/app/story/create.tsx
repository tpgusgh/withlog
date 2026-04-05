import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';

import { api } from '@/services/api';

type StoryAsset = ImagePicker.ImagePickerAsset & {
  localId: string;
};

export default function CreateStoryScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [assets, setAssets] = useState<StoryAsset[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [caption, setCaption] = useState('');
  const [mode, setMode] = useState<'image' | 'video'>('image');
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeAsset = assets[activeIndex] ?? null;
  const hasVideo = useMemo(() => assets.some((item) => item.type === 'video'), [assets]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!assets.length) {
        throw new Error('스토리를 먼저 추가해 주세요.');
      }

      for (const asset of assets) {
        const formData = new FormData();
        formData.append('media_type', asset.type === 'video' ? 'video' : 'image');
        formData.append('caption_text', caption);
        formData.append('is_muted', String(asset.type === 'video' ? isMuted : false));
        formData.append('file', {
          uri: asset.uri,
          name: asset.fileName ?? `story.${asset.type === 'video' ? 'mp4' : 'jpg'}`,
          type: asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
        } as never);
        await api.post('/stories', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['home-stories'] });
      router.back();
    },
    onError: (err) => {
      const message = err instanceof AxiosError ? (err.response?.data?.detail as string | undefined) ?? err.message : '스토리 업로드에 실패했습니다.';
      setError(message);
    },
  });

  const appendAssets = (nextAssets: ImagePicker.ImagePickerAsset[]) => {
    if (!nextAssets.length) {
      return;
    }
    setAssets((current) => {
      const appended = nextAssets.map((asset, index) => ({
        ...asset,
        localId: `${Date.now()}-${index}-${asset.assetId ?? asset.fileName ?? 'story'}`,
      }));
      const updated = [...current, ...appended];
      setActiveIndex(updated.length - appended.length);
      return updated;
    });
    if (nextAssets.every((asset) => asset.type !== 'video')) {
      setIsMuted(false);
    }
  };

  const capture = async (nextMode: 'image' | 'video') => {
    setMode(nextMode);
    setError(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError('카메라 권한이 필요합니다.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: nextMode === 'video' ? ['videos'] : ['images'],
      allowsEditing: nextMode === 'image',
      quality: 1,
      videoMaxDuration: 5,
    });
    if (!result.canceled) {
      appendAssets(result.assets);
    }
  };

  const pickFromGallery = async (nextMode: 'image' | 'video') => {
    setMode(nextMode);
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('갤러리 접근 권한이 필요합니다.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: nextMode === 'video' ? ['videos'] : ['images'],
      allowsEditing: false,
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 1,
    });
    if (!result.canceled) {
      appendAssets(result.assets);
    }
  };

  const removeAsset = (localId: string) => {
    setAssets((current) => {
      const next = current.filter((item) => item.localId !== localId);
      setActiveIndex((index) => Math.max(Math.min(index, next.length - 1), 0));
      return next;
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>홈 스토리 올리기</Text>
      <Text style={styles.sub}>여러 장을 한 번에 담을 수 있어요. 찍은 뒤 계속 추가해도 됩니다.</Text>

      <View style={styles.actions}>
        <TouchableOpacity style={[styles.actionButton, mode === 'image' && styles.actionButtonActive]} onPress={() => setMode('image')}>
          <Text style={[styles.actionText, mode === 'image' && styles.actionTextActive]}>사진</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, mode === 'video' && styles.actionButtonActive]} onPress={() => setMode('video')}>
          <Text style={[styles.actionText, mode === 'video' && styles.actionTextActive]}>영상</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionButton} onPress={() => capture(mode)}>
          <Text style={styles.actionText}>{mode === 'video' ? '카메라로 영상 추가' : '카메라로 사진 추가'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={() => pickFromGallery(mode)}>
          <Text style={styles.actionText}>{mode === 'video' ? '갤러리 영상 여러 개' : '갤러리 사진 여러 장'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.preview}>
        {activeAsset ? (
          activeAsset.type === 'video' ? (
            <Video source={{ uri: activeAsset.uri }} style={styles.media} shouldPlay isLooping resizeMode={ResizeMode.COVER} isMuted={isMuted} />
          ) : (
            <Image source={{ uri: activeAsset.uri }} style={styles.media} />
          )
        ) : (
          <Text style={styles.placeholder}>카메라로 찍거나 갤러리에서 여러 개 가져오기</Text>
        )}
      </View>

      {assets.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbRow}>
          {assets.map((asset, index) => (
            <TouchableOpacity key={asset.localId} style={[styles.thumbWrap, index === activeIndex && styles.thumbWrapActive]} onPress={() => setActiveIndex(index)}>
              {asset.type === 'video' ? (
                <Video source={{ uri: asset.uri }} style={styles.thumb} resizeMode={ResizeMode.COVER} isMuted shouldPlay={false} />
              ) : (
                <Image source={{ uri: asset.uri }} style={styles.thumb} />
              )}
              <TouchableOpacity style={styles.removeButton} onPress={() => removeAsset(asset.localId)}>
                <Ionicons name="close" size={14} color="#FFFFFF" />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}

      <Text style={styles.assetCount}>선택한 스토리 {assets.length}개</Text>
      <TextInput value={caption} onChangeText={setCaption} style={styles.input} placeholder="한 줄 남기기" placeholderTextColor="#94A3B8" />

      {hasVideo ? (
        <View style={styles.actions}>
          <TouchableOpacity style={[styles.actionButton, !isMuted && styles.actionButtonActive]} onPress={() => setIsMuted(false)}>
            <Text style={[styles.actionText, !isMuted && styles.actionTextActive]}>원본 소리</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, isMuted && styles.actionButtonActive]} onPress={() => setIsMuted(true)}>
            <Text style={[styles.actionText, isMuted && styles.actionTextActive]}>음소거</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TouchableOpacity style={[styles.submit, createMutation.isPending && styles.submitDisabled]} disabled={createMutation.isPending} onPress={() => createMutation.mutate()}>
        <Text style={styles.submitText}>{createMutation.isPending ? '올리는 중...' : `${assets.length || 0}개 스토리 올리기`}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { padding: 20, gap: 16, paddingBottom: 32 },
  title: { color: '#0F172A', fontSize: 28, fontWeight: '900', marginTop: 16 },
  sub: { color: '#64748B', fontWeight: '600', lineHeight: 21 },
  actions: { flexDirection: 'row', gap: 10 },
  actionButton: { flex: 1, borderRadius: 16, paddingVertical: 14, alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0' },
  actionButtonActive: { backgroundColor: '#111827', borderColor: '#111827' },
  actionText: { color: '#334155', fontWeight: '800', textAlign: 'center', paddingHorizontal: 6 },
  actionTextActive: { color: '#FFFFFF' },
  preview: { width: '100%', aspectRatio: 0.9, borderRadius: 28, overflow: 'hidden', backgroundColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  media: { width: '100%', height: '100%' },
  placeholder: { color: '#475569', fontWeight: '700', paddingHorizontal: 24, textAlign: 'center' },
  thumbRow: { gap: 10 },
  thumbWrap: { width: 86, height: 112, borderRadius: 18, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' },
  thumbWrapActive: { borderColor: '#111827' },
  thumb: { width: '100%', height: '100%' },
  removeButton: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(15,23,42,0.7)', alignItems: 'center', justifyContent: 'center' },
  assetCount: { color: '#475569', fontWeight: '700' },
  input: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 14, borderWidth: 1, borderColor: '#E2E8F0', color: '#0F172A' },
  submit: { backgroundColor: '#111827', borderRadius: 18, padding: 16, alignItems: 'center' },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: '#FFFFFF', fontWeight: '800' },
  error: { color: '#DC2626', fontWeight: '600' },
});
