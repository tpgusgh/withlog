import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/store/theme';

const sections = [
  {
    title: '수집하는 정보',
    body: '이메일, 닉네임, 프로필 이미지, 그룹 활동 기록, 스토리, 댓글, 알림 설정을 서비스 운영을 위해 저장합니다.',
  },
  {
    title: '이용 목적',
    body: '계정 식별, 그룹 기능 제공, 스토리 및 슬롯 기록 표시, 알림 전송, 서비스 안정화에 사용합니다.',
  },
  {
    title: '보관 기간',
    body: '스토리와 슬롯 업로드 파일은 일정 기간 후 자동 삭제될 수 있으며, 회원탈퇴 시 계정 및 관련 데이터는 서비스 내에서 삭제됩니다.',
  },
  {
    title: '문의',
    body: '개인정보 처리 관련 문의가 있으면 서비스 운영자에게 연락해 주세요.',
  },
];

export default function PrivacyScreen() {
  const { colors } = useAppTheme();

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: colors.text }]}>개인정보 처리 방침</Text>
      <Text style={[styles.updated, { color: colors.subtext }]}>최종 업데이트: 2026년 4월 6일</Text>
      {sections.map((section) => (
        <View key={section.title} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{section.title}</Text>
          <Text style={[styles.sectionBody, { color: colors.subtext }]}>{section.body}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 36, gap: 14 },
  title: { fontSize: 28, fontWeight: '900', marginTop: 16 },
  updated: { fontWeight: '600' },
  card: { borderRadius: 24, borderWidth: 1, padding: 18, gap: 8 },
  sectionTitle: { fontSize: 17, fontWeight: '800' },
  sectionBody: { lineHeight: 22, fontWeight: '600' },
});
