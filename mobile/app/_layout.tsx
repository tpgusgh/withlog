import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { checkActivityNotifications, resetActivityNotificationState, syncLocalNotifications } from '@/services/notifications';
import { defaultProfileSettings } from '@/services/profile-settings';
import { useAuthStore } from '@/store/auth';
import { useAppTheme, useThemeStore } from '@/store/theme';

const queryClient = new QueryClient();

export default function RootLayout() {
  const initializeAuth = useAuthStore((state) => state.initialize);
  const user = useAuthStore((state) => state.user);
  const initializeTheme = useThemeStore((state) => state.initialize);
  const mode = useThemeStore((state) => state.mode);
  const setMode = useThemeStore((state) => state.setMode);
  const { colors, isDark } = useAppTheme();

  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    void initializeAuth();
    void initializeTheme();
  }, [initializeAuth, initializeTheme]);

  useEffect(() => {
    if (!user) {
      resetActivityNotificationState();
      void setMode(defaultProfileSettings.themeMode);
      void syncLocalNotifications(defaultProfileSettings);
      return;
    }

    const nextSettings = {
      intro: user.intro ?? defaultProfileSettings.intro,
      isPublic: user.isPublic ?? defaultProfileSettings.isPublic,
      pushEnabled: user.pushEnabled ?? defaultProfileSettings.pushEnabled,
      musicPreview: user.musicPreview ?? defaultProfileSettings.musicPreview,
      themeMode: user.themeMode ?? defaultProfileSettings.themeMode,
      timezoneLabel: user.timezoneLabel ?? defaultProfileSettings.timezoneLabel,
      quietHoursEnabled: user.quietHoursEnabled ?? defaultProfileSettings.quietHoursEnabled,
      quietHours: user.quietHours ?? defaultProfileSettings.quietHours,
    } as const;

    void setMode(nextSettings.themeMode);
    void syncLocalNotifications(nextSettings);

    const initialCheck = async () => {
      resetActivityNotificationState();
      await checkActivityNotifications(nextSettings);
    };
    void initialCheck();

    const interval = setInterval(() => {
      void checkActivityNotifications(nextSettings);
    }, 30000);

    return () => clearInterval(interval);
  }, [setMode, user]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerShown: false,
            headerTintColor: colors.text,
            headerBackButtonDisplayMode: 'minimal',
            headerShadowVisible: false,
            headerStyle: { backgroundColor: colors.background },
            headerTitleStyle: { fontWeight: '900' },
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)/signup" options={{ headerShown: false }} />
          <Stack.Screen name="group/[id]" options={{ headerShown: true, title: '그룹' }} />
          <Stack.Screen name="group/create" options={{ headerShown: true, title: '새 그룹 만들기' }} />
          <Stack.Screen name="group/upload" options={{ headerShown: true, title: '사진 등록' }} />
          <Stack.Screen name="group/daily-video" options={{ headerShown: true, title: '오늘의 요약 영상' }} />
          <Stack.Screen name="group/chat" options={{ headerShown: false }} />
          <Stack.Screen name="media/viewer" options={{ headerShown: false, presentation: 'modal', animation: 'fade' }} />
          <Stack.Screen name="comments/[postId]" options={{ headerShown: true, title: '댓글' }} />
          <Stack.Screen name="story/create" options={{ headerShown: true, title: '홈 스토리 올리기' }} />
          <Stack.Screen name="story/[id]" options={{ headerShown: false, presentation: 'modal', animation: 'fade' }} />
          <Stack.Screen name="profile/edit" options={{ headerShown: false }} />
          <Stack.Screen name="profile/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="profile/connections" options={{ headerShown: false }} />
          <Stack.Screen name="join" options={{ headerShown: true, title: '그룹 참여' }} />
        </Stack>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
