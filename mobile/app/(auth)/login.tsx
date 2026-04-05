import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useState } from 'react';
import { AxiosError } from 'axios';

import { useAuthStore } from '@/store/auth';
import { useAppTheme } from '@/store/theme';
import { api } from '@/services/api';
import { ensureFirstLoginPermissions } from '@/services/permissions';
import type { ProfilePayload } from '@/services/profile-settings';
import type { AuthUser } from '@/store/auth';

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

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const setSession = useAuthStore((state) => state.setSession);
  const { colors, isDark } = useAppTheme();

  const handleLogin = async () => {
    try {
      setSubmitting(true);
      setError(null);

      const tokenResponse = await api.post('/auth/login', { email, password });
      const token = tokenResponse.data.access_token as string;
      const meResponse = await api.get('/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });

      const nextUser = normalizeProfile(meResponse.data);
      await setSession({ token, user: nextUser });
      await ensureFirstLoginPermissions(nextUser.id);
      router.replace('/(tabs)/home');
    } catch (err) {
      const message =
        err instanceof AxiosError ? (err.response?.data?.detail as string | undefined) ?? err.message : '로그인에 실패했습니다.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LinearGradient
      colors={isDark ? ['#11100F', '#171412', '#11100F'] : ['#F6F1EA', '#EFE5D8', '#F6F1EA']}
      style={styles.container}
    >
      <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Text style={[styles.brand, { color: colors.subtext }]}>WITHLOG</Text>
            <Text style={[styles.title, { color: colors.text }]}>친구들과 같은 시간을 남기는 기록</Text>
            <Text style={[styles.subtitle, { color: colors.subtext }]}>매 시간 열리는 작은 슬롯에 사진과 영상을 남겨보세요.</Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>로그인</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="이메일"
              placeholderTextColor={colors.subtext}
              autoCapitalize="none"
              keyboardType="email-address"
              style={[styles.input, { backgroundColor: isDark ? '#1F1B18' : '#F8F5F0', borderColor: colors.border, color: colors.text }]}
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="비밀번호"
              placeholderTextColor={colors.subtext}
              secureTextEntry
              style={[styles.input, { backgroundColor: isDark ? '#1F1B18' : '#F8F5F0', borderColor: colors.border, color: colors.text }]}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <TouchableOpacity style={[styles.button, { backgroundColor: colors.text }, submitting && styles.buttonDisabled]} disabled={submitting} onPress={handleLogin}>
              <Text style={[styles.buttonText, { color: colors.background }]}>{submitting ? '로그인 중...' : '로그인'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.linkWrap} onPress={() => router.push('/(auth)/signup')}>
              <Text style={[styles.link, { color: colors.subtext }]}>계정이 없다면 회원가입</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  keyboard: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingBottom: 40 },
  hero: { marginBottom: 22, gap: 8 },
  brand: { fontSize: 12, fontWeight: '900', letterSpacing: 1.5 },
  title: { fontSize: 34, lineHeight: 40, fontWeight: '900' },
  subtitle: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  card: { borderRadius: 32, padding: 22, borderWidth: 1 },
  cardTitle: { fontSize: 22, fontWeight: '900', marginBottom: 16 },
  input: { borderRadius: 18, paddingHorizontal: 16, paddingVertical: 15, marginBottom: 12, borderWidth: 1, fontSize: 15 },
  button: { borderRadius: 18, padding: 16, alignItems: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontWeight: '800' },
  linkWrap: { marginTop: 14, alignItems: 'center' },
  link: { fontWeight: '700' },
  error: { color: '#C2410C', marginBottom: 4, fontWeight: '700' },
});
