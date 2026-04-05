import axios from 'axios';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const DEFAULT_API_URL = 'http://192.168.219.101:8000';

const resolveApiBaseUrl = () => {
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, '');
  }

  if (DEFAULT_API_URL) {
    return DEFAULT_API_URL;
  }

  const runtimeHost =
    (Constants.expoConfig as { hostUri?: string } | null)?.hostUri ??
    (Constants as unknown as { expoGoConfig?: { debuggerHost?: string } }).expoGoConfig?.debuggerHost ??
    (Constants as unknown as { manifest2?: { extra?: { expoClient?: { hostUri?: string } } } }).manifest2?.extra?.expoClient?.hostUri ??
    (Constants as unknown as { manifest?: { debuggerHost?: string } }).manifest?.debuggerHost;

  if (runtimeHost) {
    const host = runtimeHost.split(':')[0];
    return `http://${host}:8000`;
  }

  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8000';
  }

  return 'http://127.0.0.1:8000';
};

export const API_BASE_URL = resolveApiBaseUrl();

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

export const setAccessToken = (token: string | null) => {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
    return;
  }

  delete api.defaults.headers.common.Authorization;
};

export const buildAssetUrl = (path?: string | null) => {
  if (!path) {
    return '';
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
};

export const buildProfileImageUrl = (path?: string | null, seed?: string | number | null) => {
  const direct = buildAssetUrl(path);
  if (direct) {
    return direct;
  }

  const fallbackSeed = String(seed ?? 'withlog');
  return `https://api.dicebear.com/9.x/thumbs/png?seed=${encodeURIComponent(fallbackSeed)}&backgroundColor=f6f1ea,d9d9d9,c7d2fe`;
};
