import AsyncStorage from '@react-native-async-storage/async-storage';
import { Camera } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';

import { requestNotificationPermission } from '@/services/notifications';

const FIRST_LOGIN_PERMISSION_KEY_PREFIX = 'first-login-permissions';

export const ensureFirstLoginPermissions = async (userId?: number | null) => {
  if (!userId) {
    return;
  }

  const storageKey = `${FIRST_LOGIN_PERMISSION_KEY_PREFIX}:${userId}`;
  const alreadyHandled = await AsyncStorage.getItem(storageKey);
  if (alreadyHandled === 'done') {
    return;
  }

  try {
    await requestNotificationPermission();
    await ImagePicker.requestCameraPermissionsAsync();
    await Camera.requestMicrophonePermissionsAsync();
    await ImagePicker.requestMediaLibraryPermissionsAsync();
    await MediaLibrary.requestPermissionsAsync();
  } finally {
    await AsyncStorage.setItem(storageKey, 'done');
  }
};
