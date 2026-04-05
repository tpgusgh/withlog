import { useEffect, useState } from 'react';
import { Alert, Image, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { api, buildProfileImageUrl } from '@/services/api';
import { syncLocalNotifications } from '@/services/notifications';
import { TIMEZONE_OPTIONS, defaultProfileSettings, mapProfileToSettings, type LocalProfileSettings, type ProfilePayload } from '@/services/profile-settings';
import { useAuthStore, type AuthUser } from '@/store/auth';
import { useAppTheme, useThemeStore } from '@/store/theme';

const normalizeProfile = (payload: ProfilePayload): AuthUser => ({
  id: payload.id,
  email: payload.email,
  nickname: payload.nickname,
  profileImage: payload.profile_image ?? null,
  isPublic: payload.is_public ?? true,
  intro: payload.intro ?? '',
  pushEnabled: payload.push_enabled ?? true,
  musicPreview: payload.music_preview ?? true,
  themeMode: payload.theme_mode === 'dark' ? 'dark' : 'light',
  timezoneLabel: payload.timezone_label ?? 'Asia/Seoul',
  quietHoursEnabled: payload.quiet_hours_enabled ?? false,
  quietHours: payload.quiet_hours ?? '22:00 - 08:00',
  followerCount: payload.follower_count ?? 0,
  followingCount: payload.following_count ?? 0,
});

export default function ProfileEditScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const logout = useAuthStore((s) => s.logout);
  const setThemeMode = useThemeStore((s) => s.setMode);
  const queryClient = useQueryClient();
  const { colors, isDark } = useAppTheme();
  const [nickname, setNickname] = useState(user?.nickname ?? '');
  const [selectedImage, setSelectedImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<LocalProfileSettings>(defaultProfileSettings);
  const [timePickerTarget, setTimePickerTarget] = useState<'start' | 'end' | null>(null);

  const settingsQuery = useQuery({
    queryKey: ['profile-settings'],
    queryFn: async () => {
      const response = await api.get('/auth/me');
      return mapProfileToSettings(response.data as ProfilePayload);
    },
  });

  useEffect(() => {
    if (settingsQuery.data) {
      setSettings(settingsQuery.data);
    }
  }, [settingsQuery.data]);

  const saveSettings = async (next: LocalProfileSettings) => {
    setSettings(next);
    await setThemeMode(next.themeMode);
    await syncLocalNotifications(next);
  };

  const profileMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append('nickname', nickname.trim() || user?.nickname || 'User');
      formData.append('is_public', settings.isPublic ? 'true' : 'false');
      formData.append('intro', settings.intro);
      formData.append('push_enabled', settings.pushEnabled ? 'true' : 'false');
      formData.append('music_preview', settings.musicPreview ? 'true' : 'false');
      formData.append('theme_mode', settings.themeMode);
      formData.append('timezone_label', settings.timezoneLabel);
      formData.append('quiet_hours_enabled', settings.quietHoursEnabled ? 'true' : 'false');
      formData.append('quiet_hours', settings.quietHours);
      if (selectedImage) {
        formData.append('profile_image', {
          uri: selectedImage.uri,
          name: selectedImage.fileName ?? 'profile.jpg',
          type: selectedImage.mimeType ?? 'image/jpeg',
        } as never);
      }
      const response = await api.patch('/auth/me', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return normalizeProfile(response.data);
    },
    onSuccess: async (nextUser) => {
      await updateUser(nextUser);
      await setThemeMode(nextUser.themeMode ?? 'light');
      await syncLocalNotifications(mapProfileToSettings({
        is_public: nextUser.isPublic,
        intro: nextUser.intro,
        push_enabled: nextUser.pushEnabled,
        music_preview: nextUser.musicPreview,
        theme_mode: nextUser.themeMode,
        timezone_label: nextUser.timezoneLabel,
        quiet_hours_enabled: nextUser.quietHoursEnabled,
        quiet_hours: nextUser.quietHours,
      }));
      await queryClient.invalidateQueries({ queryKey: ['profile-settings'] });
      await queryClient.invalidateQueries({ queryKey: ['recommended-users'] });
      setSelectedImage(null);
      setError(null);
      router.back();
    },
    onError: (err) => {
      const message =
        err instanceof AxiosError ? (err.response?.data?.detail as string | undefined) ?? err.message : '프로필 저장에 실패했습니다.';
      setError(message);
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async () => api.delete('/auth/me'),
    onSuccess: async () => {
      await logout();
      await queryClient.clear();
      router.replace('/(auth)/login');
    },
    onError: (err) => {
      const message =
        err instanceof AxiosError ? (err.response?.data?.detail as string | undefined) ?? err.message : '회원탈퇴에 실패했습니다.';
      setError(message);
    },
  });

  const pickProfileImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (!result.canceled) {
      setSelectedImage(result.assets[0]);
    }
  };

  const avatarUri = selectedImage?.uri ?? buildProfileImageUrl(user?.profileImage, user?.nickname);
  const [quietStart, quietEnd] = settings.quietHours.split(' - ');

  const parseTimeToDate = (value: string) => {
    const [hour, minute] = value.split(':').map(Number);
    const next = new Date();
    next.setHours(hour || 0, minute || 0, 0, 0);
    return next;
  };

  const updateQuietHours = async (target: 'start' | 'end', date: Date) => {
    const formatted = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    const next = target === 'start' ? `${formatted} - ${quietEnd ?? '08:00'}` : `${quietStart ?? '22:00'} - ${formatted}`;
    await saveSettings({ ...settings, quietHours: next });
  };

  const confirmDeleteAccount = () => {
    Alert.alert('회원탈퇴', '정말 탈퇴할까요? 계정과 기록이 삭제됩니다.', [
      { text: '취소', style: 'cancel' },
      { text: '탈퇴', style: 'destructive', onPress: () => deleteAccountMutation.mutate() },
    ]);
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={[styles.backButton, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={18} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>프로필 편집</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <TouchableOpacity style={styles.avatarWrap} onPress={pickProfileImage}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatarPlaceholder, { backgroundColor: isDark ? '#2A2623' : '#E8E0D6' }]}>
              <Ionicons name="camera-outline" size={28} color={colors.subtext} />
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={[styles.photoButton, { backgroundColor: isDark ? '#1F1B18' : '#F3ECE3', borderColor: colors.border }]} onPress={pickProfileImage}>
          <Text style={[styles.photoButtonText, { color: colors.text }]}>프로필 사진 바꾸기</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>기본 정보</Text>
        <Text style={[styles.fieldLabel, { color: colors.text }]}>닉네임</Text>
        <TextInput
          value={nickname}
          onChangeText={setNickname}
          style={[styles.input, { backgroundColor: isDark ? '#1F1B18' : '#F8F5F0', borderColor: colors.border, color: colors.text }]}
          placeholder="닉네임"
          placeholderTextColor={colors.subtext}
        />
        <Text style={[styles.fieldLabel, { color: colors.text }]}>소개글</Text>
        <TextInput
          value={settings.intro}
          onChangeText={(intro) => void saveSettings({ ...settings, intro })}
          style={[styles.input, styles.multiline, { backgroundColor: isDark ? '#1F1B18' : '#F8F5F0', borderColor: colors.border, color: colors.text }]}
          placeholder="오늘의 무드나 소개를 적어보세요"
          placeholderTextColor={colors.subtext}
          multiline
        />
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>공개와 알림</Text>
        <View style={styles.sectionGap}>
          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.text }]}>프로필 공개</Text>
            <Switch value={settings.isPublic} onValueChange={(isPublic) => void saveSettings({ ...settings, isPublic })} />
          </View>
          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.text }]}>푸시 알림</Text>
            <Switch value={settings.pushEnabled} onValueChange={(pushEnabled) => void saveSettings({ ...settings, pushEnabled })} />
          </View>
          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.text }]}>배경음 자동 미리듣기</Text>
            <Switch value={settings.musicPreview} onValueChange={(musicPreview) => void saveSettings({ ...settings, musicPreview })} />
          </View>
          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.text }]}>다크모드</Text>
            <Switch value={settings.themeMode === 'dark'} onValueChange={(enabled) => void saveSettings({ ...settings, themeMode: enabled ? 'dark' : 'light' })} />
          </View>
        </View>
        <Text style={[styles.fieldLabel, { color: colors.text }]}>시간대</Text>
        <View style={[styles.pickerWrap, { backgroundColor: isDark ? '#1F1B18' : '#F8F5F0', borderColor: colors.border }]}>
          <Picker selectedValue={settings.timezoneLabel} onValueChange={(timezoneLabel) => void saveSettings({ ...settings, timezoneLabel })}>
            {TIMEZONE_OPTIONS.map((option) => (
              <Picker.Item key={option} label={option} value={option} />
            ))}
          </Picker>
        </View>
        <View style={[styles.row, styles.quietToggle]}>
          <Text style={[styles.label, { color: colors.text }]}>알림 제외 시간 사용</Text>
          <Switch value={settings.quietHoursEnabled} onValueChange={(quietHoursEnabled) => void saveSettings({ ...settings, quietHoursEnabled })} />
        </View>
        {settings.quietHoursEnabled ? (
          <View style={styles.timeRow}>
            <TouchableOpacity style={[styles.timeChip, { backgroundColor: isDark ? '#1F1B18' : '#F8F5F0', borderColor: colors.border }]} onPress={() => setTimePickerTarget('start')}>
              <Text style={[styles.timeChipLabel, { color: colors.subtext }]}>시작</Text>
              <Text style={[styles.timeChipValue, { color: colors.text }]}>{quietStart}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.timeChip, { backgroundColor: isDark ? '#1F1B18' : '#F8F5F0', borderColor: colors.border }]} onPress={() => setTimePickerTarget('end')}>
              <Text style={[styles.timeChipLabel, { color: colors.subtext }]}>종료</Text>
              <Text style={[styles.timeChipValue, { color: colors.text }]}>{quietEnd}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={[styles.helper, { color: colors.subtext }]}>필요할 때만 켜서 밤 시간 알림을 멈출 수 있어요.</Text>
        )}
        {settings.quietHoursEnabled && timePickerTarget ? (
          <DateTimePicker
            value={parseTimeToDate(timePickerTarget === 'start' ? quietStart : quietEnd)}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(event: DateTimePickerEvent, date?: Date) => {
              if (Platform.OS !== 'ios') {
                setTimePickerTarget(null);
              }
              if (event.type === 'set' && date) {
                void updateQuietHours(timePickerTarget, date);
              }
            }}
          />
        ) : null}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>정책과 계정</Text>
        <TouchableOpacity style={[styles.linkRow, { borderColor: colors.border }]} onPress={() => router.push('/profile/privacy')}>
          <Text style={[styles.linkText, { color: colors.text }]}>개인정보 처리 방침</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.subtext} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.withdrawButton, deleteAccountMutation.isPending && styles.withdrawButtonDisabled]} onPress={confirmDeleteAccount} disabled={deleteAccountMutation.isPending}>
          <Text style={styles.withdrawButtonText}>{deleteAccountMutation.isPending ? '탈퇴 처리 중...' : '회원탈퇴'}</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.text }]} onPress={() => profileMutation.mutate()} disabled={profileMutation.isPending}>
        <Text style={[styles.primaryButtonText, { color: colors.background }]}>{profileMutation.isPending ? '저장 중...' : '저장하기'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 36, gap: 18 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  backButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '900' },
  headerSpacer: { width: 40 },
  heroCard: { borderRadius: 30, padding: 20, borderWidth: 1, alignItems: 'center', gap: 14 },
  avatarWrap: { width: 110, height: 110, borderRadius: 999, overflow: 'hidden' },
  avatar: { width: '100%', height: '100%' },
  avatarPlaceholder: { width: '100%', height: '100%', borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  photoButton: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  photoButtonText: { fontWeight: '800' },
  card: { borderRadius: 28, padding: 20, borderWidth: 1 },
  sectionTitle: { fontSize: 18, fontWeight: '800', marginBottom: 12 },
  fieldLabel: { fontWeight: '700', marginBottom: 8, marginTop: 4 },
  input: { borderWidth: 1, borderRadius: 16, padding: 14 },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  sectionGap: { gap: 6, marginBottom: 8 },
  row: { paddingVertical: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontWeight: '700' },
  pickerWrap: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  quietToggle: { marginTop: 8 },
  timeRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  timeChip: { flex: 1, borderWidth: 1, borderRadius: 16, padding: 14 },
  timeChipLabel: { fontWeight: '700', marginBottom: 4 },
  timeChipValue: { fontWeight: '800', fontSize: 16 },
  helper: { marginTop: 8, lineHeight: 20, fontWeight: '600' },
  primaryButton: { borderRadius: 18, padding: 16, alignItems: 'center' },
  primaryButtonText: { fontWeight: '800' },
  error: { color: '#DC2626', fontWeight: '600' },
  linkRow: {
    borderTopWidth: 1,
    paddingTop: 14,
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  linkText: { fontSize: 15, fontWeight: '700' },
  withdrawButton: {
    marginTop: 16,
    backgroundColor: '#FEE2E2',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
  },
  withdrawButtonDisabled: { opacity: 0.5 },
  withdrawButtonText: { color: '#B91C1C', fontWeight: '800' },
});
