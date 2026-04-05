import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View, Image } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';

export default function MediaViewerScreen() {
  const router = useRouter();
  const { uri, type } = useLocalSearchParams<{ uri?: string; type?: string }>();
  const resolvedUri = uri ? decodeURIComponent(uri) : '';
  const isVideo = type === 'video';

  return (
    <View style={styles.container}>
      <Pressable style={styles.closeButton} onPress={() => router.back()}>
        <Ionicons name="close" size={26} color="#FFFFFF" />
      </Pressable>
      {resolvedUri ? (
        isVideo ? (
          <Video source={{ uri: resolvedUri }} style={styles.media} useNativeControls resizeMode={ResizeMode.CONTAIN} shouldPlay />
        ) : (
          <Image source={{ uri: resolvedUri }} style={styles.media} resizeMode="contain" />
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center' },
  closeButton: {
    position: 'absolute',
    top: 56,
    right: 20,
    zIndex: 10,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(15,23,42,0.54)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  media: { width: '100%', height: '100%' },
});
