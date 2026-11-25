import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import * as KeepAwake from 'expo-keep-awake';

export const KAL_NAV_LOCATION_TASK = 'KALTORAKAL_ACTIVE_NAV_LOCATION_TASK';
export const LIVE_STATUS_CHANNEL_ID = 'live-tracking-status';
const LIVE_STATUS_NOTIF_ID = 'kaltorakal-live-status';
const KEEP_AWAKE_TAG = 'kaltorakal-active-nav';

type BgLocationListener = (lat: number, lon: number) => void;

let activeBgLocationListener: BgLocationListener | null = null;
let lastNotifKey = '';
let liveChannelConfigured = false;

// Top-level TaskManager definition (required by Expo for Android Foreground Service & iOS background location)
if (
  Platform.OS !== 'web' &&
  typeof TaskManager?.defineTask === 'function' &&
  !TaskManager.isTaskDefined(KAL_NAV_LOCATION_TASK)
) {
  TaskManager.defineTask(KAL_NAV_LOCATION_TASK, async ({ data, error }) => {
    if (error || !data) return;
    const locations = (data as { locations?: Location.LocationObject[] })
      .locations;
    if (!Array.isArray(locations) || locations.length === 0) return;
    const latest = locations[locations.length - 1];
    if (latest?.coords && activeBgLocationListener) {
      activeBgLocationListener(latest.coords.latitude, latest.coords.longitude);
    }
  });
}

export function setBackgroundLocationListener(
  listener: BgLocationListener | null
): void {
  activeBgLocationListener = listener;
}

async function ensureLiveStatusChannel(): Promise<void> {
  if (Platform.OS !== 'android' || liveChannelConfigured) return;
  try {
    await Notifications.setNotificationChannelAsync(LIVE_STATUS_CHANNEL_ID, {
      name: 'Live Navigation & Ride Tracking',
      importance: Notifications.AndroidImportance.LOW,
      sound: null,
      enableVibrate: false,
      showBadge: false,
      lockscreenVisibility:
        Notifications.AndroidNotificationVisibility?.PUBLIC ?? 1,
    });
    liveChannelConfigured = true;
  } catch {
    // Ignore on unsupported platforms
  }
}

/**
 * Displays / updates a persistent Live-Activity-like tracking notification in-place
 * (silent updates so it never buzzes on every GPS tick).
 */
export async function updateLiveTrackingNotification(
  title: string,
  body: string
): Promise<void> {
  if (Platform.OS === 'web') return;
  const key = `${title}||${body}`;
  if (key === lastNotifKey) return;
  lastNotifKey = key;

  try {
    await ensureLiveStatusChannel();
    await Notifications.scheduleNotificationAsync({
      identifier: LIVE_STATUS_NOTIF_ID,
      content: {
        title,
        body,
        sound: false,
        sticky: true,
        autoDismiss: false,
        priority: Notifications.AndroidNotificationPriority?.LOW,
      },
      trigger:
        Platform.OS === 'android'
          ? { channelId: LIVE_STATUS_CHANNEL_ID }
          : null,
    });
  } catch {
    // Notifications permission may not be granted
  }
}

export async function dismissLiveTrackingNotification(): Promise<void> {
  lastNotifKey = '';
  if (Platform.OS === 'web') return;
  try {
    await Notifications.dismissNotificationAsync(LIVE_STATUS_NOTIF_ID);
  } catch {
    // Ignore
  }
  try {
    await Notifications.cancelScheduledNotificationAsync(LIVE_STATUS_NOTIF_ID);
  } catch {
    // Ignore
  }
}

/**
 * Starts Android Foreground Service (prevents OS from killing the app during active navigation)
 * + keeps device awake + displays the Live-Activity-like tracking notification.
 */
export async function startActiveNavProtection(
  notificationTitle: string,
  notificationBody: string,
  onLocation?: BgLocationListener
): Promise<void> {
  if (onLocation) {
    activeBgLocationListener = onLocation;
  }

  // 1. Keep screen awake while active navigation is on
  try {
    if (typeof KeepAwake.activateKeepAwakeAsync === 'function') {
      await KeepAwake.activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    }
  } catch {
    // Ignore
  }

  // 2. Show initial Live-Activity-like persistent tracking notification
  await updateLiveTrackingNotification(notificationTitle, notificationBody);

  // 3. Start OS-level Foreground Service location updates (keeps process alive in background / screen-off)
  if (Platform.OS === 'web') return;
  try {
    const started = await Location.hasStartedLocationUpdatesAsync(
      KAL_NAV_LOCATION_TASK
    );
    if (started) {
      await Location.stopLocationUpdatesAsync(KAL_NAV_LOCATION_TASK);
    }
    await Location.startLocationUpdatesAsync(KAL_NAV_LOCATION_TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 3000,
      distanceInterval: 5,
      showsBackgroundLocationIndicator: true,
      pausesUpdatesAutomatically: false,
      foregroundService: {
        notificationTitle,
        notificationBody,
        notificationColor: '#0A84FF',
        killServiceOnDestroy: false,
      },
    });
  } catch {
    // Gracefully fall back to foreground watchPositionAsync (e.g. in Expo Go or if background service denied)
  }
}

/**
 * Stops the Foreground Service, dismisses the live tracking notification, and releases keep-awake.
 */
export async function stopActiveNavProtection(): Promise<void> {
  activeBgLocationListener = null;

  try {
    if (typeof KeepAwake.deactivateKeepAwake === 'function') {
      KeepAwake.deactivateKeepAwake(KEEP_AWAKE_TAG);
    }
  } catch {
    // Ignore
  }

  await dismissLiveTrackingNotification();

  if (Platform.OS === 'web') return;
  try {
    const started = await Location.hasStartedLocationUpdatesAsync(
      KAL_NAV_LOCATION_TASK
    );
    if (started) {
      await Location.stopLocationUpdatesAsync(KAL_NAV_LOCATION_TASK);
    }
  } catch {
    // Ignore
  }
}
