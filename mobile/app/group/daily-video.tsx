import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Video, ResizeMode } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { AxiosError } from 'axios';

import { api, buildAssetUrl } from '@/services/api';
import { useAppTheme } from '@/store/theme';
import { formatLocalDate } from '@/utils/date';

export default function DailyVideoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = Number(id);
  const queryClient = useQueryClient();
  const { isDark } = useAppTheme();
  const [downloading, setDownloading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const todayStr = formatLocalDate(new Date());
  const dailyQuery = useQuery({
    queryKey: ['daily-video', groupId, todayStr],
    enabled: Number.isFinite(groupId),
    queryFn: async () => {
      const response = await api.get(`/videos/group/${groupId}/daily`, { params: { date: todayStr } });
      return response.data as { status: string; output_url?: string };
    },
  });
  const generateMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post(`/videos/group/${groupId}/daily`, null, {
        params: { date: todayStr },
      });
      return response.data as { status: string; output_url?: string };
    },
    onMutate: () => setGenerating(true),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['daily-video', groupId, todayStr] });
    },
    onError: (err) => {
      const message =
        err instanceof AxiosError ? (err.response?.data?.detail as string | undefined) ?? err.message : '요약 영상 생성에 실패했습니다.';
      Alert.alert('생성 실패', message);
    },
    onSettled: () => setGenerating(false),
  });

  const handleDownload = async () => {
    const outputUrl = dailyQuery.data?.output_url;
    if (!outputUrl) {
      return;
    }
    try {
      setDownloading(true);
      const permission = await MediaLibrary.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('권한 필요', '갤러리에 저장하려면 사진 권한이 필요합니다.');
        return;
      }

      const localUri = `${FileSystem.documentDirectory}withlog-summary-${groupId}-${todayStr}.mp4`;
      const download = await FileSystem.downloadAsync(buildAssetUrl(outputUrl), localUri);
      await MediaLibrary.saveToLibraryAsync(download.uri);
      Alert.alert('저장 완료', '오늘 요약 영상을 기기에 저장했어요.');
    } catch {
      Alert.alert('다운로드 실패', '영상을 저장하지 못했습니다.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <Text style={[styles.title, isDark && styles.titleDark]}>오늘의 요약 영상</Text>
      <Text style={[styles.sub, isDark && styles.subDark]}>오늘 새벽 12시부터 밤 12시까지 올라온 기록을 기준으로 바로 만들 수 있어요.</Text>
      <Text style={styles.dateLabel}>대상 날짜 {todayStr}</Text>
      {dailyQuery.data?.status === 'done' && dailyQuery.data.output_url ? (
        <>
          <Video
            source={{ uri: buildAssetUrl(dailyQuery.data.output_url) }}
            style={styles.video}
            useNativeControls
            resizeMode={ResizeMode.COVER}
            isMuted
            isLooping
          />
          <View style={styles.buttonRow}>
            <TouchableOpacity style={[styles.secondaryButton, generating && styles.buttonDisabled]} onPress={() => generateMutation.mutate()} disabled={generating}>
              <Text style={styles.secondaryButtonText}>{generating ? '다시 만드는 중...' : '지금 다시 만들기'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, downloading && styles.buttonDisabled]} onPress={handleDownload} disabled={downloading}>
              <Text style={styles.buttonText}>{downloading ? '저장 중...' : '갤러리에 저장'}</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <View style={[styles.emptyBox, isDark && styles.emptyBoxDark]}>
          <Text style={styles.emptyText}>오늘 요약 영상이 아직 없습니다.</Text>
          <TouchableOpacity style={[styles.button, generating && styles.buttonDisabled, { marginTop: 18, width: '100%' }]} onPress={() => generateMutation.mutate()} disabled={generating}>
            <Text style={styles.buttonText}>{generating ? '생성 중...' : '지금 만들기'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC', padding: 20 },
  containerDark: { backgroundColor: '#020617' },
  title: { color: '#0F172A', fontSize: 28, fontWeight: '800', marginTop: 16 },
  titleDark: { color: '#F8FAFC' },
  sub: { color: '#64748B', marginTop: 6, marginBottom: 10, lineHeight: 22 },
  subDark: { color: '#94A3B8' },
  dateLabel: { color: '#2563EB', fontWeight: '800', marginBottom: 16 },
  video: { width: '100%', aspectRatio: 9/16, borderRadius: 24, overflow: 'hidden', backgroundColor: '#000' },
  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 18 },
  button: { backgroundColor: '#111827', padding: 18, borderRadius: 18, marginTop: 18, alignItems: 'center' },
  buttonText: { color: 'white', fontWeight: '700' },
  secondaryButton: { flex: 1, backgroundColor: '#E2E8F0', padding: 18, borderRadius: 18, alignItems: 'center' },
  secondaryButtonText: { color: '#0F172A', fontWeight: '700' },
  buttonDisabled: { opacity: 0.5 },
  emptyBox: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, borderWidth: 1, borderColor: '#E2E8F0' },
  emptyBoxDark: { backgroundColor: '#111827', borderColor: '#1E293B' },
  emptyText: { color: '#64748B', fontWeight: '700', textAlign: 'center' },
});
