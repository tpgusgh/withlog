import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { api, setAccessToken } from '@/services/api';

const AUTH_STORAGE_KEY = 'auth-session';

export type AuthUser = {
  id: number;
  email: string;
  nickname: string;
  profileImage?: string | null;
  isPublic?: boolean;
  intro?: string;
  pushEnabled?: boolean;
  musicPreview?: boolean;
  themeMode?: 'light' | 'dark';
  timezoneLabel?: string;
  quietHoursEnabled?: boolean;
  quietHours?: string;
  followerCount?: number;
  followingCount?: number;
};

type AuthState = {
  hydrated: boolean;
  token: string | null;
  user: AuthUser | null;
  initialize: () => Promise<void>;
  setSession: (payload: { token: string; user: AuthUser }) => Promise<void>;
  updateUser: (user: AuthUser) => Promise<void>;
  logout: () => Promise<void>;
};

const normalizeProfile = (payload: {
  id: number;
  email: string;
  nickname: string;
  profile_image?: string | null;
  is_public?: boolean;
  intro?: string;
  push_enabled?: boolean;
  music_preview?: boolean;
  theme_mode?: 'light' | 'dark';
  timezone_label?: string;
  quiet_hours_enabled?: boolean;
  quiet_hours?: string;
  follower_count?: number;
  following_count?: number;
}): AuthUser => ({
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

export const useAuthStore = create<AuthState>((set, get) => ({
  hydrated: false,
  token: null,
  user: null,
  initialize: async () => {
    if (get().hydrated) {
      return;
    }

    const raw = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      set({ hydrated: true });
      return;
    }

    try {
      const session = JSON.parse(raw) as { token: string; user: AuthUser };
      setAccessToken(session.token);
      try {
        const meResponse = await api.get('/auth/me', {
          headers: { Authorization: `Bearer ${session.token}` },
        });
        const nextUser = normalizeProfile(meResponse.data);
        await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token: session.token, user: nextUser }));
        set({ token: session.token, user: nextUser, hydrated: true });
      } catch {
        set({ token: session.token, user: session.user, hydrated: true });
      }
    } catch {
      await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
      setAccessToken(null);
      set({ token: null, user: null, hydrated: true });
    }
  },
  setSession: async ({ token, user }) => {
    setAccessToken(token);
    await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token, user }));
    set({ token, user, hydrated: true });
  },
  updateUser: async (user) => {
    const token = get().token;
    if (token) {
      await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token, user }));
    }
    set({ user, hydrated: true });
  },
  logout: async () => {
    setAccessToken(null);
    await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
    set({ token: null, user: null, hydrated: true });
  },
}));
