import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { useAuthStore } from '@/store/auth';

export default function Index() {
  const hydrated = useAuthStore((state) => state.hydrated);
  const user = useAuthStore((state) => state.user);

  if (!hydrated) {
    return <View style={{ flex: 1, backgroundColor: '#020617' }} />;
  }

  return <Redirect href={user ? "/(tabs)/home" : "/(auth)/login"} />;
}
