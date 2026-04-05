import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import type { Post } from '@/types';
import { useAppTheme } from '@/store/theme';
import { formatDisplayDate } from '@/utils/date';

const filterLabels: Record<string, string> = {
  none: '필터 없음',
  warm: '따뜻하게',
  cool: '차분하게',
  mono: '흑백',
  vivid: '선명하게',
};

export function FeedCard({
  post,
  onQuote,
  onHeart,
  onComment,
  onPressProfile,
  onOpenMedia,
}: {
  post: Post;
  onQuote?: (post: Post) => void;
  onHeart?: (post: Post) => void;
  onComment?: (post: Post) => void;
  onPressProfile?: (post: Post) => void;
  onOpenMedia?: (post: Post) => void;
}) {
  const { isDark } = useAppTheme();
  const displayDate = post.dateLabel ?? formatDisplayDate(new Date());

  return (
    <View style={[styles.card, isDark && styles.cardDark]}>
      <TouchableOpacity activeOpacity={0.96} onPress={() => onOpenMedia?.(post)}>
        {post.mediaType === 'video' ? (
          <Video source={{ uri: post.thumbnail }} style={styles.image} isMuted resizeMode={ResizeMode.COVER} shouldPlay isLooping />
        ) : (
          <Image source={{ uri: post.thumbnail }} style={styles.image} />
        )}
      </TouchableOpacity>
      <View style={styles.overlay}>
        <View style={styles.topRow}>
          <TouchableOpacity style={styles.userBadge} activeOpacity={onPressProfile ? 0.8 : 1} onPress={() => onPressProfile?.(post)} disabled={!onPressProfile}>
            <View style={styles.ring}>
              {post.user.profileImage ? <Image source={{ uri: post.user.profileImage }} style={styles.avatar} /> : <View style={styles.avatar} />}
            </View>
            <View style={styles.namePill}>
              <View style={styles.userRow}>
                <Text style={styles.user}>{post.user.nickname}</Text>
                {post.user.isOwner ? <MaterialCommunityIcons name="crown" size={13} color="#F59E0B" /> : null}
              </View>
            </View>
          </TouchableOpacity>
          <Text style={styles.date}>{displayDate}</Text>
        </View>

        <View style={styles.centerCopy}>
          <Text style={styles.time}>{post.createdAt || '--:--'}</Text>
          {!!post.caption && <Text style={styles.caption}>{post.caption}</Text>}
        </View>

        <View style={styles.bottomRow}>
          <Text style={styles.filter}>{filterLabels[post.filter] ?? post.filter}</Text>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.iconButton} onPress={() => onQuote?.(post)}>
              <Ionicons name="arrow-undo-outline" size={24} color="white" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={() => onComment?.(post)}>
              <Ionicons name="chatbubble-outline" size={23} color="white" />
              <Text style={styles.count}>{post.comments}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={() => onHeart?.(post)}>
              <Ionicons name={post.likedByMe ? 'heart' : 'heart-outline'} size={24} color={post.likedByMe ? '#FF4D6D' : 'white'} />
              <Text style={styles.count}>{post.likes}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 36,
    overflow: 'hidden',
    shadowColor: '#6A584A',
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
  },
  cardDark: { backgroundColor: '#1B1917', shadowColor: '#000000' },
  image: { width: '100%', aspectRatio: 1, backgroundColor: '#E2E8F0' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    padding: 28,
    justifyContent: 'space-between',
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  userBadge: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ring: {
    width: 42,
    height: 42,
    borderRadius: 999,
    padding: 3,
    borderWidth: 3,
    borderColor: '#3BE6D1',
    backgroundColor: '#F48CE7',
  },
  avatar: { width: '100%', height: '100%', borderRadius: 999, backgroundColor: '#CBD5E1' },
  namePill: {
    backgroundColor: 'rgba(51,65,85,0.82)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 120,
  },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  user: { color: 'white', fontWeight: '700' },
  date: { color: 'white', fontSize: 18, fontWeight: '500', letterSpacing: 0.4 },
  centerCopy: { alignItems: 'center', marginTop: 46 },
  time: {
    color: 'white',
    fontSize: 42,
    lineHeight: 46,
    fontWeight: '900',
    textShadowColor: 'rgba(15,23,42,0.28)',
    textShadowRadius: 14,
  },
  caption: {
    color: 'white',
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '500',
    marginTop: 8,
    textAlign: 'center',
    textShadowColor: 'rgba(15,23,42,0.24)',
    textShadowRadius: 12,
  },
  bottomRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  filter: {
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '700',
    backgroundColor: 'rgba(15,23,42,0.26)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actions: { alignItems: 'center', gap: 18, paddingBottom: 8 },
  iconButton: { alignItems: 'center', justifyContent: 'center' },
  count: { color: 'white', fontSize: 12, fontWeight: '700', marginTop: 2 },
});
