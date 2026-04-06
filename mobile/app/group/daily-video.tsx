import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Video, ResizeMode } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { AxiosError } from 'axios';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api, buildAssetUrl } from '@/services/api';
import { useAppTheme } from '@/store/theme';
import { formatLocalDate } from '@/utils/date';

export default function DailyVideoScreen() {
  const { id, date } = useLocalSearchParams<{ id: string; date?: string }>();
  const groupId = Number(id);
  const queryClient = useQueryClient();
  const { isDark } = useAppTheme();
  const [downloading, setDownloading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const isRollingWindow = !date;
  const targetDate = date ?? formatLocalDate(new Date());
  const dailyQuery = useQuery({
    queryKey: ['daily-video', groupId, isRollingWindow ? 'rolling' : targetDate],
    enabled: Number.isFinite(groupId),
    queryFn: async () => {
      const response = await api.get(`/videos/group/${groupId}/daily`, {
        params: isRollingWindow ? undefined : { date: targetDate },
      });
      return response.data as { status: string; output_url?: string };
    },
  });
  const generateMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post(`/videos/group/${groupId}/daily`, null, {
        params: isRollingWindow ? undefined : { date: targetDate },
        timeout: 180000,
      });
      return response.data as { status: string; output_url?: string };
    },
    onMutate: () => setGenerating(true),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['daily-video', groupId, isRollingWindow ? 'rolling' : targetDate] });
    },
    onError: (err) => {
      const message =
        err instanceof AxiosError
          ? err.code === 'ECONNABORTED'
            ? '요약 영상 생성 시간이 길어지고 있습니다. 잠시 뒤 다시 확인해 주세요.'
            : (err.response?.data?.detail as string | undefined) ?? err.message
          : '요약 영상 생성에 실패했습니다.';
      Alert.alert('생성 실패', message);
    },
    onSettled: () => setGenerating(false),
  });
  const videoUrl =
    dailyQuery.data?.status === 'done' && dailyQuery.data.output_url
      ? `${buildAssetUrl(dailyQuery.data.output_url)}?v=${dailyQuery.dataUpdatedAt || Date.now()}`
      : '';

  const handleDownload = async () => {
    if (!videoUrl) {
      return;
    }
    try {
      setDownloading(true);
      const permission = await MediaLibrary.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('권한 필요', '갤러리에 저장하려면 사진 권한이 필요합니다.');
        return;
      }

      const localUri = `${FileSystem.documentDirectory}withlog-summary-${groupId}-${isRollingWindow ? 'recent-24h' : targetDate}.mp4`;
      const download = await FileSystem.downloadAsync(videoUrl, localUri);
      await MediaLibrary.saveToLibraryAsync(download.uri);
      Alert.alert('저장 완료', '오늘 요약 영상을 기기에 저장했어요.');
    } catch {
      Alert.alert('다운로드 실패', '영상을 저장하지 못했습니다.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, isDark && styles.containerDark]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, isDark && styles.titleDark]}>{isRollingWindow ? '최근 24시간 요약 영상' : '날짜별 요약 영상'}</Text>
        <Text style={[styles.sub, isDark && styles.subDark]}>{isRollingWindow ? '지금부터 직전 24시간 안의 기록을 인원수에 맞춰 세로 스택으로 묶어 보여줍니다.' : '선택한 날짜의 기록을 인원수에 맞춰 세로 스택으로 묶어 보여줍니다.'}</Text>
        <View style={[styles.infoCard, isDark && styles.infoCardDark]}>
          <Text style={styles.dateLabel}>{isRollingWindow ? '대상 구간 최근 24시간' : `대상 날짜 ${targetDate}`}</Text>
          <Text style={[styles.infoCopy, isDark && styles.infoCopyDark]}>실제 동영상이 만들어지면 먼저 확인하고, 그다음 저장할지 결정할 수 있어요.</Text>
          <Text style={[styles.infoNote, isDark && styles.infoNoteDark]}>생성된 영상은 24시간 후 자동 삭제된다.</Text>
        </View>
        {dailyQuery.isLoading ? (
          <View style={[styles.emptyBox, isDark && styles.emptyBoxDark]}>
            <ActivityIndicator color={isDark ? '#F8FAFC' : '#111827'} />
            <Text style={[styles.emptyText, { marginTop: 12 }]}>요약 영상을 불러오는 중입니다.</Text>
          </View>
        ) : videoUrl ? (
          <>
            <View style={[styles.videoShell, isDark && styles.videoShellDark]}>
              <Video
                key={videoUrl}
                source={{ uri: videoUrl }}
                style={styles.video}
                useNativeControls
                resizeMode={ResizeMode.CONTAIN}
                isMuted
                isLooping
              />
            </View>
            <View style={styles.buttonStack}>
              <TouchableOpacity style={[styles.button, generating && styles.buttonDisabled]} onPress={() => generateMutation.mutate()} disabled={generating}>
                <Text style={styles.buttonText}>{generating ? '다시 만드는 중...' : '지금 다시 만들기'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.secondaryButton, downloading && styles.buttonDisabled]} onPress={handleDownload} disabled={downloading}>
                <Text style={styles.secondaryButtonText}>{downloading ? '저장 중...' : '갤러리에 저장'}</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.helperText, isDark && styles.helperTextDark]} numberOfLines={2}>
              영상이 안 뜨면 서버 재시작 후 다시 만들기를 눌러 새 파일로 갱신하세요.
            </Text>
          </>
        ) : (
          <View style={[styles.emptyBox, isDark && styles.emptyBoxDark]}>
            <Text style={styles.emptyText}>요약 영상을 만든 뒤 먼저 보고, 마음에 들면 저장하면 됩니다.</Text>
            <TouchableOpacity style={[styles.button, generating && styles.buttonDisabled, { marginTop: 18, width: '100%' }]} onPress={() => generateMutation.mutate()} disabled={generating}>
              <Text style={styles.buttonText}>{generating ? '생성 중...' : '지금 만들기'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC', padding: 20 },
  containerDark: { backgroundColor: '#020617' },
  content: { paddingBottom: 32 },
  title: { color: '#0F172A', fontSize: 28, fontWeight: '800', marginTop: 16 },
  titleDark: { color: '#F8FAFC' },
  sub: { color: '#64748B', marginTop: 6, marginBottom: 10, lineHeight: 22 },
  subDark: { color: '#94A3B8' },
  infoCard: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 18, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 16 },
  infoCardDark: { backgroundColor: '#111827', borderColor: '#1E293B' },
  dateLabel: { color: '#2563EB', fontWeight: '800' },
  infoCopy: { color: '#475569', marginTop: 8, lineHeight: 20 },
  infoCopyDark: { color: '#94A3B8' },
  infoNote: { color: '#64748B', marginTop: 8, fontSize: 12, fontWeight: '700' },
  infoNoteDark: { color: '#94A3B8' },
  videoShell: { borderRadius: 28, overflow: 'hidden', backgroundColor: '#050505', borderWidth: 1, borderColor: '#E2E8F0' },
  videoShellDark: { borderColor: '#1E293B' },
  video: { width: '100%', aspectRatio: 9 / 16, backgroundColor: '#000' },
  buttonStack: { gap: 12, marginTop: 18 },
  button: { backgroundColor: '#111827', padding: 18, borderRadius: 18, alignItems: 'center' },
  buttonText: { color: 'white', fontWeight: '700' },
  secondaryButton: { backgroundColor: '#E2E8F0', padding: 18, borderRadius: 18, alignItems: 'center' },
  secondaryButtonText: { color: '#0F172A', fontWeight: '700' },
  buttonDisabled: { opacity: 0.5 },
  emptyBox: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, borderWidth: 1, borderColor: '#E2E8F0' },
  emptyBoxDark: { backgroundColor: '#111827', borderColor: '#1E293B' },
  emptyText: { color: '#64748B', fontWeight: '700', textAlign: 'center' },
  helperText: { color: '#64748B', marginTop: 12, textAlign: 'center', lineHeight: 20 },
  helperTextDark: { color: '#94A3B8' },
});
