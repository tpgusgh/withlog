export const PROFILE_SETTINGS_KEY = 'profile-settings';
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
