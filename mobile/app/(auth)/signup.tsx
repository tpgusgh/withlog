import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useState } from 'react';
import { AxiosError } from 'axios';

import { useAuthStore } from '@/store/auth';
import { useAppTheme } from '@/store/theme';
import { api } from '@/services/api';

const normalizeProfile = (payload: {
  id: number;
  email: string;
  nickname: string;
  profile_image?: string | null;
  is_public?: boolean;
  follower_count?: number;
  following_count?: number;
}) => ({
  id: payload.id,
  email: payload.email,
  nickname: payload.nickname,
  profileImage: payload.profile_image ?? null,
  isPublic: payload.is_public ?? true,
  followerCount: payload.follower_count ?? 0,
  followingCount: payload.following_count ?? 0,
});

export default function SignupScreen() {
  const router = useRouter();
  const { colors, isDark } = useAppTheme();
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [requestingCode, setRequestingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setSession = useAuthStore((state) => state.setSession);

  const handleRequestCode = async () => {
    try {
      setRequestingCode(true);
      setError(null);
      setVerificationToken(null);
      const response = await api.post('/auth/email/request', { email });
      setDevCode((response.data.dev_code as string | undefined) ?? null);
    } catch (err) {
      const message =
        err instanceof AxiosError ? (err.response?.data?.detail as string | undefined) ?? err.message : '인증번호 발송에 실패했습니다.';
      setError(message);
    } finally {
      setRequestingCode(false);
    }
  };

  const handleVerifyCode = async () => {
    try {
      setVerifyingCode(true);
      setError(null);
      const response = await api.post('/auth/email/verify', { email, code: verificationCode });
      setVerificationToken(response.data.verification_token as string);
    } catch (err) {
      const message =
        err instanceof AxiosError ? (err.response?.data?.detail as string | undefined) ?? err.message : '이메일 인증에 실패했습니다.';
      setError(message);
    } finally {
      setVerifyingCode(false);
    }
  };

  const handleSignup = async () => {
    try {
      setSubmitting(true);
      setError(null);
      if (!verificationToken) {
        setError('이메일 인증을 먼저 완료해 주세요.');
        return;
      }

      const tokenResponse = await api.post('/auth/signup', { nickname, email, password, verification_token: verificationToken });
      const token = tokenResponse.data.access_token as string;
      const meResponse = await api.get('/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });

      await setSession({ token, user: normalizeProfile(meResponse.data) });
      router.replace('/(tabs)/home');
    } catch (err) {
      const message =
        err instanceof AxiosError ? (err.response?.data?.detail as string | undefined) ?? err.message : '회원가입에 실패했습니다.';
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
            <Text style={[styles.title, { color: colors.text }]}>회원가입</Text>
            <Text style={[styles.subtitle, { color: colors.subtext }]}>같은 시간의 순간을 남기기 전에 이메일 인증부터 마쳐주세요.</Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.text }]}>닉네임</Text>
            <TextInput style={[styles.input, { backgroundColor: isDark ? '#1F1B18' : '#F8F5F0', borderColor: colors.border, color: colors.text }]} value={nickname} onChangeText={setNickname} placeholder="닉네임" placeholderTextColor={colors.subtext} />

            <Text style={[styles.label, { color: colors.text }]}>이메일</Text>
            <TextInput style={[styles.input, { backgroundColor: isDark ? '#1F1B18' : '#F8F5F0', borderColor: colors.border, color: colors.text }]} value={email} onChangeText={setEmail} autoCapitalize="none" placeholder="이메일" placeholderTextColor={colors.subtext} />

            <TouchableOpacity style={[styles.secondaryButton, { backgroundColor: isDark ? '#1F1B18' : '#F1E7DC', borderColor: colors.border }, requestingCode && styles.buttonDisabled]} disabled={requestingCode || !email.trim()} onPress={handleRequestCode}>
              <Text style={[styles.secondaryButtonText, { color: colors.text }]}>{requestingCode ? '보내는 중...' : '인증번호 받기'}</Text>
            </TouchableOpacity>

            <Text style={[styles.label, { color: colors.text }]}>인증번호</Text>
            <TextInput style={[styles.input, { backgroundColor: isDark ? '#1F1B18' : '#F8F5F0', borderColor: colors.border, color: colors.text }]} value={verificationCode} onChangeText={setVerificationCode} keyboardType="number-pad" placeholder="6자리 코드" placeholderTextColor={colors.subtext} />
            <TouchableOpacity style={[styles.secondaryButton, { backgroundColor: isDark ? '#1F1B18' : '#F1E7DC', borderColor: colors.border }, verifyingCode && styles.buttonDisabled]} disabled={verifyingCode || !verificationCode.trim()} onPress={handleVerifyCode}>
              <Text style={[styles.secondaryButtonText, { color: colors.text }]}>{verifyingCode ? '확인 중...' : verificationToken ? '인증 완료됨' : '이메일 인증 확인'}</Text>
            </TouchableOpacity>

            {devCode ? <Text style={styles.devCode}>개발용 인증코드: {devCode}</Text> : null}

            <Text style={[styles.label, { color: colors.text }]}>비밀번호</Text>
            <TextInput style={[styles.input, { backgroundColor: isDark ? '#1F1B18' : '#F8F5F0', borderColor: colors.border, color: colors.text }]} value={password} secureTextEntry onChangeText={setPassword} placeholder="비밀번호" placeholderTextColor={colors.subtext} />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity style={[styles.button, { backgroundColor: colors.text }, (submitting || !verificationToken) && styles.buttonDisabled]} disabled={submitting || !verificationToken} onPress={handleSignup}>
              <Text style={[styles.buttonText, { color: colors.background }]}>{submitting ? '생성 중...' : '계정 만들기'}</Text>
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
  content: { flexGrow: 1, padding: 24, paddingTop: 72, paddingBottom: 40 },
  hero: { gap: 8, marginBottom: 22 },
  brand: { fontSize: 12, fontWeight: '900', letterSpacing: 1.5 },
  title: { fontSize: 34, fontWeight: '900' },
  subtitle: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  card: { borderRadius: 32, padding: 22, borderWidth: 1 },
  label: { fontWeight: '800', marginBottom: 8, marginTop: 6 },
  input: { borderRadius: 18, paddingHorizontal: 16, paddingVertical: 15, marginBottom: 12, borderWidth: 1, fontSize: 15 },
  secondaryButton: { borderRadius: 18, padding: 14, alignItems: 'center', marginBottom: 14, borderWidth: 1 },
  secondaryButtonText: { fontWeight: '800' },
  button: { borderRadius: 18, padding: 16, alignItems: 'center', marginTop: 10 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontWeight: '800' },
  devCode: { color: '#B45309', marginBottom: 10, fontWeight: '800' },
  error: { color: '#C2410C', marginBottom: 8, fontWeight: '700' },
});
