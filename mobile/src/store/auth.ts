import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { setAccessToken } from '@/services/api';

const AUTH_STORAGE_KEY = 'auth-session';

export type AuthUser = {
  id: number;
  email: string;
  nickname: string;
  profileImage?: string | null;
  isPublic?: boolean;
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
      set({ token: session.token, user: session.user, hydrated: true });
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
