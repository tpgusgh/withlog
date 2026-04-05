import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { PROFILE_SETTINGS_KEY, defaultProfileSettings, type LocalProfileSettings } from '@/services/profile-settings';

const REMINDER_TITLE = '새 슬롯이 열렸어요';
const REMINDER_BODY = '지금 그룹에 스토리를 올릴 시간입니다.';
const LAST_CALL_TITLE = '마감 5분 전이에요';
const LAST_CALL_BODY = '제발 지금 한 장만 올려줘요. 이번 슬롯 곧 닫혀요.';

const parseHourMinute = (value: string) => {
  const [hour, minute] = value.split(':').map(Number);
  return { hour: hour || 0, minute: minute || 0 };
};

const isInQuietHours = (date: Date, settings: LocalProfileSettings) => {
  if (!settings.quietHoursEnabled) {
    return false;
  }

  const [startRaw, endRaw] = settings.quietHours.split(' - ');
  const start = parseHourMinute(startRaw ?? '22:00');
  const end = parseHourMinute(endRaw ?? '08:00');
  const minutes = date.getHours() * 60 + date.getMinutes();
  const startMinutes = start.hour * 60 + start.minute;
  const endMinutes = end.hour * 60 + end.minute;

  if (startMinutes === endMinutes) {
    return false;
  }

  if (startMinutes < endMinutes) {
    return minutes >= startMinutes && minutes < endMinutes;
  }

  return minutes >= startMinutes || minutes < endMinutes;
};

const nextSlotDate = (base: Date, offset: number) => {
  const next = new Date(base);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + offset);
  return next;
};

const slotClosingReminderDate = (slotStart: Date) => {
  const next = new Date(slotStart);
  next.setMinutes(25, 0, 0);
  return next;
};

export const syncLocalNotifications = async (settings?: LocalProfileSettings) => {
  const resolved = settings ?? {
    ...defaultProfileSettings,
    ...(JSON.parse((await AsyncStorage.getItem(PROFILE_SETTINGS_KEY)) ?? '{}') as Partial<LocalProfileSettings>),
  };

  await Notifications.cancelAllScheduledNotificationsAsync();

  if (!resolved.pushEnabled) {
    return;
  }

  const permissions = await Notifications.getPermissionsAsync();
  let granted = permissions.granted || permissions.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  if (!granted) {
    const requested = await Notifications.requestPermissionsAsync();
    granted = requested.granted || requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  }
  if (!granted) {
    return;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('withlog-reminders', {
      name: 'withlog Reminders',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 200, 120, 200],
      lightColor: '#2563EB',
    });
  }

  const now = new Date();
  const currentSlot = nextSlotDate(now, 0);
  const upcoming = [currentSlot, ...Array.from({ length: 24 }, (_, index) => nextSlotDate(now, index + 1))];
  for (const slotStart of upcoming) {
    if (slotStart.getTime() > now.getTime() && !isInQuietHours(slotStart, resolved)) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: REMINDER_TITLE,
          body: REMINDER_BODY,
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: slotStart,
          channelId: 'withlog-reminders',
        },
      });
    }

    const lastCall = slotClosingReminderDate(slotStart);
    if (lastCall.getTime() > now.getTime() && !isInQuietHours(lastCall, resolved)) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: LAST_CALL_TITLE,
          body: LAST_CALL_BODY,
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: lastCall,
          channelId: 'withlog-reminders',
        },
      });
    }
  }
};
