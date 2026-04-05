import { useRouter } from 'expo-router';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Switch } from 'react-native';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { api } from '@/services/api';
import { useAppTheme } from '@/store/theme';

const memberOptions = [2, 3, 4, 5, 6, 8, 10];

export default function CreateGroupScreen() {
  const { colors, isDark } = useAppTheme();
  const [name, setName] = useState('');
  const [maxMembers, setMaxMembers] = useState(4);
  const [isPublic, setIsPublic] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const queryClient = useQueryClient();
  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/groups', { name, max_members: maxMembers, is_public: isPublic });
      return response.data as { id: number };
    },
    onSuccess: async (group) => {
      await queryClient.invalidateQueries({ queryKey: ['groups'] });
      router.replace(`/group/${group.id}`);
    },
    onError: (err) => {
      const message =
        err instanceof AxiosError ? (err.response?.data?.detail as string | undefined) ?? err.message : '그룹 생성에 실패했습니다.';
      setError(message);
    },
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>새 그룹 만들기</Text>
      <Text style={[styles.label, { color: colors.text }]}>그룹 이름</Text>
      <TextInput value={name} onChangeText={setName} style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]} placeholder="예: withlog 크루" placeholderTextColor={colors.subtext} />
      <Text style={[styles.label, { color: colors.text }]}>몇 명이랑 할지</Text>
      <View style={styles.row}>
        {memberOptions.map((count) => (
          <TouchableOpacity key={count} style={[styles.chip, { backgroundColor: colors.card, borderColor: colors.border }, maxMembers === count && styles.chipActive]} onPress={() => setMaxMembers(count)}>
            <Text style={[styles.chipText, { color: colors.text }, maxMembers === count && styles.chipTextActive]}>{count}명</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={[styles.visibilityCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.visibilityCopy}>
          <Text style={[styles.visibilityTitle, { color: colors.text }]}>공개 그룹</Text>
          <Text style={[styles.visibilitySub, { color: colors.subtext }]}>켜면 다른 사람들이 공개 그룹 목록에서 보고 바로 가입할 수 있어요.</Text>
        </View>
        <Switch value={isPublic} onValueChange={setIsPublic} />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TouchableOpacity style={[styles.button, { backgroundColor: colors.text }]} onPress={() => createMutation.mutate()} disabled={createMutation.isPending}>
        <Text style={[styles.buttonText, { color: colors.background }]}>{createMutation.isPending ? '생성 중...' : '생성하기'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 30, fontWeight: '900', marginTop: 16 },
  label: { fontWeight: '800', marginTop: 18, marginBottom: 8 },
  input: { borderRadius: 16, padding: 14, borderWidth: 1 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  chipActive: { backgroundColor: '#111827', borderColor: '#111827' },
  chipText: { fontWeight: '700' },
  chipTextActive: { color: '#FFFFFF' },
  visibilityCard: { borderRadius: 20, padding: 16, borderWidth: 1, marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 12 },
  visibilityCopy: { flex: 1 },
  visibilityTitle: { fontWeight: '800', fontSize: 16 },
  visibilitySub: { marginTop: 4, lineHeight: 20, fontWeight: '600' },
  button: { borderRadius: 16, padding: 16, alignItems: 'center', marginTop: 22 },
  buttonText: { fontWeight: '700' },
  error: { color: '#DC2626', marginTop: 12 },
});
