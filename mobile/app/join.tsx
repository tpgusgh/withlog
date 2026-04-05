import { useEffect, useState } from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { AxiosError } from 'axios';

import { api } from '@/services/api';
import { useAppTheme } from '@/store/theme';

export default function JoinByLinkScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const { colors } = useAppTheme();
  const [joinedGroupId, setJoinedGroupId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      if (!code) {
        setError('초대 코드가 없습니다.');
        return;
      }
      try {
        const response = await api.post('/groups/join', { invite_code: code });
        setJoinedGroupId(response.data.group_id as number);
      } catch (err) {
        const message =
          err instanceof AxiosError ? (err.response?.data?.detail as string | undefined) ?? err.message : '그룹 참여에 실패했습니다.';
        setError(message);
      }
    };
    void run();
  }, [code]);

  if (joinedGroupId) {
    return <Redirect href={`/group/${joinedGroupId}`} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>{error ? '참여 실패' : '그룹에 참여하는 중...'}</Text>
      <Text style={[styles.sub, { color: colors.subtext }]}>{error ?? `초대 코드 ${code ?? ''}를 확인하고 있어요.`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 28, fontWeight: '900' },
  sub: { marginTop: 10, textAlign: 'center', lineHeight: 22 },
});
