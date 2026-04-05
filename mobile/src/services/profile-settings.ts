export const TIMEZONE_OPTIONS = ['Asia/Seoul', 'Asia/Tokyo', 'Asia/Singapore', 'America/Los_Angeles', 'America/New_York', 'Europe/London'];

export type LocalProfileSettings = {
  intro: string;
  isPublic: boolean;
  pushEnabled: boolean;
  musicPreview: boolean;
  themeMode: 'light' | 'dark';
  timezoneLabel: string;
  quietHoursEnabled: boolean;
  quietHours: string;
};

export type ProfilePayload = {
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
};

export const defaultProfileSettings: LocalProfileSettings = {
  intro: '',
  isPublic: true,
  pushEnabled: true,
  musicPreview: true,
  themeMode: 'light',
  timezoneLabel: 'Asia/Seoul',
  quietHoursEnabled: false,
  quietHours: '22:00 - 08:00',
};

export const mapProfileToSettings = (payload?: Partial<ProfilePayload> | null): LocalProfileSettings => ({
  intro: payload?.intro ?? defaultProfileSettings.intro,
  isPublic: payload?.is_public ?? defaultProfileSettings.isPublic,
  pushEnabled: payload?.push_enabled ?? defaultProfileSettings.pushEnabled,
  musicPreview: payload?.music_preview ?? defaultProfileSettings.musicPreview,
  themeMode: payload?.theme_mode === 'dark' ? 'dark' : 'light',
  timezoneLabel: payload?.timezone_label ?? defaultProfileSettings.timezoneLabel,
  quietHoursEnabled: payload?.quiet_hours_enabled ?? defaultProfileSettings.quietHoursEnabled,
  quietHours: payload?.quiet_hours ?? defaultProfileSettings.quietHours,
});
