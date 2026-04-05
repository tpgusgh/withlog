import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Video, ResizeMode } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';

import { api, buildAssetUrl } from '@/services/api';
import { useAppTheme } from '@/store/theme';
import { formatLocalDate } from '@/utils/date';

export default function DailyVideoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = Number(id);
  const { isDark } = useAppTheme();
  const [downloading, setDownloading] = useState(false);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayStr = formatLocalDate(yesterday);
  const dailyQuery = useQuery({
    queryKey: ['daily-video', groupId, yesterdayStr],
    enabled: Number.isFinite(groupId),
    queryFn: async () => {
      const response = await api.get(`/videos/group/${groupId}/daily`, { params: { date: yesterdayStr } });
      return response.data as { status: string; output_url?: string };
    },
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

      const localUri = `${FileSystem.documentDirectory}withlog-summary-${groupId}-${yesterdayStr}.mp4`;
      const download = await FileSystem.downloadAsync(buildAssetUrl(outputUrl), localUri);
      await MediaLibrary.saveToLibraryAsync(download.uri);
      Alert.alert('저장 완료', '어제 요약 영상을 기기에 저장했어요.');
    } catch {
      Alert.alert('다운로드 실패', '영상을 저장하지 못했습니다.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <Text style={[styles.title, isDark && styles.titleDark]}>오늘의 요약 영상</Text>
      <Text style={[styles.sub, isDark && styles.subDark]}>오늘 하루가 아직 끝나지 않아서 오늘 요약은 준비 전입니다.</Text>
      <Text style={styles.dateLabel}>대신 어제 요약 {yesterdayStr}</Text>
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
          <TouchableOpacity style={styles.button} onPress={handleDownload} disabled={downloading}>
            <Text style={styles.buttonText}>{downloading ? '저장 중...' : '영상 다운로드'}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <View style={[styles.emptyBox, isDark && styles.emptyBoxDark]}>
          <Text style={styles.emptyText}>어제 요약 영상이 아직 없습니다.</Text>
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
  button: { backgroundColor: '#111827', padding: 18, borderRadius: 18, marginTop: 18, alignItems: 'center' },
  buttonText: { color: 'white', fontWeight: '700' },
  emptyBox: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, borderWidth: 1, borderColor: '#E2E8F0' },
  emptyBoxDark: { backgroundColor: '#111827', borderColor: '#1E293B' },
  emptyText: { color: '#64748B', fontWeight: '700' },
});
