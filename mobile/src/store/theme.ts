import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

type ThemeMode = 'light' | 'dark';

type ThemeState = {
  mode: ThemeMode;
  hydrated: boolean;
  initialize: () => Promise<void>;
  setMode: (mode: ThemeMode) => Promise<void>;
  colors: {
    background: string;
    card: string;
    border: string;
    text: string;
    subtext: string;
  };
};

const STORAGE_KEY = 'theme-mode';

const palette = {
  light: {
    background: '#F6F1EA',
    card: '#FFFDFC',
    border: '#E8DED2',
    text: '#171412',
    subtext: '#7A6C61',
  },
  dark: {
    background: '#11100F',
    card: '#1B1917',
    border: '#2F2A27',
    text: '#F7F2EC',
    subtext: '#B7AA9C',
  },
};

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: 'light',
  hydrated: false,
  colors: palette.light,
  initialize: async () => {
    if (get().hydrated) {
      return;
    }
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const mode = raw === 'dark' ? 'dark' : 'light';
    set({ mode, hydrated: true, colors: palette[mode] });
  },
  setMode: async (mode) => {
    await AsyncStorage.setItem(STORAGE_KEY, mode);
    set({ mode, colors: palette[mode], hydrated: true });
  },
}));

export const useAppTheme = () => {
  const mode = useThemeStore((state) => state.mode);
  const colors = useThemeStore((state) => state.colors);
  return { mode, colors, isDark: mode === 'dark' };
};
