import { useMemo } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import type { SlotSummary } from '@/types';
import { useAppTheme } from '@/store/theme';

const formatDeadline = (hour: string) => {
  const match = hour.match(/\d+/);
  const displayHour = match ? Number(match[0]) : hour;
  return `${displayHour}시 59분까지 업로드 가능`;
};

export function CountdownCard({ slot }: { slot: SlotSummary }) {
  const { colors } = useAppTheme();
  const activeMembers = Array.isArray(slot.activeMembers) ? slot.activeMembers : [];
  const deadlineText = useMemo(() => formatDeadline(slot.hour), [slot.hour]);

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>WITHLOG NOW</Text>
      </View>
      <Text style={[styles.title, { color: colors.subtext }]}>현재 업로드 슬롯</Text>
      <Text style={[styles.hour, { color: colors.text }]}>{slot.hour}</Text>
      <Text style={styles.sub}>{deadlineText}</Text>
      <View style={styles.memberRow}>
        {activeMembers.length ? (
          activeMembers.slice(0, 4).map((member) => (
            <View key={member.id} style={styles.memberItem}>
              {member.profileImage ? <Image source={{ uri: member.profileImage }} style={styles.avatar} /> : <View style={styles.avatar} />}
              <Text style={[styles.memberName, { color: colors.text }]}>{member.nickname}</Text>
            </View>
          ))
        ) : (
          <Text style={[styles.empty, { color: colors.subtext }]}>아직 업로드한 친구가 없어요</Text>
        )}
      </View>
      <Text style={[styles.helper, { color: colors.subtext }]}>{activeMembers.length}/{slot.memberCount}명이 이번 슬롯에 올렸어요</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#F8FAFC',
    borderRadius: 28,
    padding: 22,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#171412',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  badgeText: { color: '#F8FAFC', fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  title: { marginTop: 14, fontWeight: '700' },
  hour: { fontSize: 40, fontWeight: '900', marginTop: 8 },
  sub: { color: '#B8572D', marginTop: 8, fontWeight: '800', fontSize: 16 },
  memberRow: { flexDirection: 'row', gap: 12, marginTop: 16, alignItems: 'center', flexWrap: 'wrap' },
  memberItem: { alignItems: 'center', width: 58 },
  avatar: { width: 42, height: 42, borderRadius: 999, backgroundColor: '#CBD5E1' },
  memberName: { fontSize: 11, fontWeight: '700', marginTop: 6 },
  helper: { marginTop: 12, fontWeight: '600' },
  empty: { fontWeight: '600' },
});
