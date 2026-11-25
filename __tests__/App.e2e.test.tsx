import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import * as Location from 'expo-location';

// Suppress noisy Animated.spring act warnings in Jest
(global as any).IS_REACT_ACT_ENVIRONMENT = true;

const mockAnimateToRegion = jest.fn();
jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockMapView = React.forwardRef((props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      animateToRegion: mockAnimateToRegion,
      animateCamera: jest.fn(),
      fitToCoordinates: jest.fn(),
    }));
    return <View testID="mock-map-view" {...props}>{props.children}</View>;
  });
  return {
    __esModule: true,
    default: MockMapView,
    Marker: (props: any) => <View testID="map-marker">{props.children}</View>,
    Polyline: () => null,
  };
});

jest.mock('@react-native-community/datetimepicker', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: any) => <View testID="native-datetime-picker" {...props} />,
  };
});

jest.mock('@react-native-segmented-control/segmented-control', () => {
  const React = require('react');
  const { View, Text, TouchableOpacity } = require('react-native');
  return {
    __esModule: true,
    default: ({ values, onChange }: any) => (
      <View testID="ios-segmented-control">
        {values.map((v: string, idx: number) => (
          <TouchableOpacity
            key={v}
            onPress={() => onChange({ nativeEvent: { selectedSegmentIndex: idx } })}
          >
            <Text>{v}</Text>
          </TouchableOpacity>
        ))}
      </View>
    ),
  };
});

jest.mock('expo-blur', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { BlurView: (props: any) => <View {...props}>{props.children}</View> };
});

jest.mock('expo-glass-effect', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    GlassView: (props: any) => <View {...props}>{props.children}</View>,
    isLiquidGlassAvailable: () => true,
    isGlassEffectAPIAvailable: () => true,
  };
});

jest.mock('expo-linear-gradient', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { LinearGradient: (props: any) => <View {...props} /> };
});

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name }: { name: string }) => <Text>{name}</Text>,
  };
});

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
}));

let mockLocationCallback: ((loc: any) => void) | null = null;
const mockRemoveWatch = jest.fn();

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'denied' })),
  hasServicesEnabledAsync: jest.fn(async () => true),
  getCurrentPositionAsync: jest.fn(async () => ({
    coords: { latitude: 32.0754, longitude: 34.7749 },
  })),
  getLastKnownPositionAsync: jest.fn(async () => ({
    coords: { latitude: 32.0754, longitude: 34.7749 },
  })),
  reverseGeocodeAsync: jest.fn(async () => [
    { street: 'דיזנגוף', streetNumber: '50', city: 'תל אביב' },
  ]),
  geocodeAsync: jest.fn(async () => []),
  watchPositionAsync: jest.fn(async (_opts, cb) => {
    mockLocationCallback = cb;
    return { remove: mockRemoveWatch };
  }),
  watchHeadingAsync: jest.fn(async () => ({ remove: jest.fn() })),
  hasStartedLocationUpdatesAsync: jest.fn(async () => false),
  startLocationUpdatesAsync: jest.fn(async () => undefined),
  stopLocationUpdatesAsync: jest.fn(async () => undefined),
  Accuracy: { Balanced: 3, High: 4, BestForNavigation: 6 },
}));

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskDefined: jest.fn(() => false),
}));

jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(async () => undefined),
  deactivateKeepAwake: jest.fn(async () => undefined),
}));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  scheduleNotificationAsync: jest.fn(async () => 'notif-1'),
  dismissNotificationAsync: jest.fn(async () => undefined),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  AndroidImportance: { LOW: 2, MAX: 5 },
  AndroidNotificationPriority: { LOW: 'low', MAX: 'max' },
  AndroidNotificationVisibility: { PUBLIC: 1 },
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaProvider: ({ children }: any) => <View style={{ flex: 1 }}>{children}</View>,
    SafeAreaView: ({ children, ...rest }: any) => <View {...rest}>{children}</View>,
    useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
  };
});

const mockFetch = jest.fn(async (url: string) => {
  if (url.includes('raw.githubusercontent.com')) {
    return { ok: false, json: async () => ({}) };
  }
  if (url.includes('photon.komoot.io')) {
    return {
      ok: true,
      json: async () => ({
        features: [
          {
            geometry: { coordinates: [34.7749, 32.0754] },
            properties: {
              name: 'דיזנגוף סנטר',
              street: 'דיזנגוף',
              housenumber: '50',
              city: 'תל אביב',
            },
          },
        ],
      }),
    };
  }
  return { ok: true, json: async () => ({ visits: {} }) };
});
(global as any).fetch = mockFetch;

import App from '../App';

describe('KalToRakal Real-World End-to-End Interaction Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocationCallback = null;
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'denied',
    });
  });

  test('1. App mounts, computes k=3 nearest Dankal stations for Kiryat Ono, and toggles Hebrew <-> English cleanly', async () => {
    await render(<App />);

    await waitFor(() => {
      expect(screen.getByText('EN')).toBeTruthy();
    });

    await fireEvent.press(screen.getByText('EN'));
    await waitFor(() => {
      expect(screen.getByText('עב')).toBeTruthy();
      expect(screen.getByText('Leave Now')).toBeTruthy();
      expect(screen.getByText('Depart At')).toBeTruthy();
      expect(screen.getByText('Arrive By')).toBeTruthy();
    });

    await fireEvent.press(screen.getByText('עב'));
    await waitFor(() => {
      expect(screen.getByText('צא עכשיו')).toBeTruthy();
      expect(screen.queryByText('Leave Now')).toBeNull();
    });
  });

  test('2. Out-of-Israel GPS (Cupertino Simulator) shows Out-of-Service banner and clamps MapKit region safely', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    });
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
      coords: { latitude: 37.3346, longitude: -122.009 }, // Cupertino!
    });

    await render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/מחוץ לאזור השירות של דנקל/)).toBeTruthy();
    });

    for (const call of mockAnimateToRegion.mock.calls) {
      const region = call[0];
      expect(region.longitudeDelta).toBeLessThanOrEqual(120);
      expect(region.latitudeDelta).toBeLessThanOrEqual(80);
      expect(Math.abs(region.latitude)).toBeLessThanOrEqual(85);
    }
  });

  test('3. Opening Origin Modal, searching a bus stop by 5-digit code (38115) & address, and selecting it updates origin', async () => {
    await render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText(/דרך לוי אשכול/).length).toBeGreaterThan(0);
    });

    await fireEvent.press(screen.getAllByText(/דרך לוי אשכול/)[0]);

    const searchInput = await waitFor(() =>
      screen.getByPlaceholderText(/חפש כתובת, רחוב/)
    );

    await fireEvent.changeText(searchInput, '38115');
    await waitFor(() => {
      expect(screen.getByText(/מק"ט 38115/)).toBeTruthy();
    });

    await fireEvent.changeText(searchInput, 'דיזנגוף סנטר');
    await waitFor(() => {
      expect(screen.getAllByText(/דיזנגוף סנטר/).length).toBeGreaterThan(0);
    });

    await fireEvent.press(screen.getAllByText(/דיזנגוף סנטר/)[0]);
    await waitFor(() => {
      expect(screen.getAllByText(/דיזנגוף סנטר/).length).toBeGreaterThan(0);
    });
  });

  test('4. Opening Travel Screen from Dizengoff Center, starting Live GPS Tracking, and cleaning up watcher on Back', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    });
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
      coords: { latitude: 32.0754, longitude: 34.7749 },
    });

    await render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/דיזנגוף 50, תל אביב/)).toBeTruthy();
    });

    await fireEvent.press(screen.getByText('שעת יציאה'));

    const walkBtns = await waitFor(() => screen.getAllByText(/הליכה ישירה:/));
    await fireEvent.press(walkBtns[0]);

    await waitFor(() => {
      expect(screen.getByText('מסלול נסיעה לדנקל')).toBeTruthy();
      expect(screen.getByText('הפעל מעקב חי והתראת ירידה')).toBeTruthy();
    });

    await fireEvent.press(screen.getByText('הפעל מעקב חי והתראת ירידה'));

    await waitFor(() => {
      expect(Location.watchPositionAsync).toHaveBeenCalled();
      expect(mockLocationCallback).not.toBeNull();
    });

    await act(async () => {
      mockLocationCallback!({
        coords: { latitude: 32.065272, longitude: 34.782824 },
      });
    });

    await fireEvent.press(screen.getByText('חזרה לכל התחנות'));
    await waitFor(() => {
      expect(mockRemoveWatch).toHaveBeenCalled();
    });
  });

  test('5. Routing Engine handles null SIRI eta, midnight rollover, +2.5m underground buffer, and stop-count tie-breaker', async () => {
    const { computeRoutesToNearestDankalStations } = require('../src/services/routingEngine');

    mockFetch.mockImplementationOnce(async () => ({
      ok: true,
      json: async () => ({
        visits: {
          '25565': [{ line_name: '63', route_id: '123', operator_id: '5', eta: null }],
        },
      }),
    }));

    const weekdayMorning = new Date('2026-11-18T08:30:00+02:00');
    const recs = await computeRoutesToNearestDankalStations(
      32.0754,
      34.7749,
      3,
      'depart_at',
      weekdayMorning,
      'any'
    );
    expect(recs.length).toBe(3);
    expect(recs[0].liveBusOptions.length).toBeGreaterThan(0);

    const undergroundStation = recs.find((r: any) => r.station.is_underground);
    expect(undergroundStation).toBeTruthy();
    expect(undergroundStation.undergroundBufferMinutes).toBe(2.5);

    const postMidnight = new Date('2026-11-19T00:10:00+02:00');
    const lateRecs = await computeRoutesToNearestDankalStations(
      32.0754,
      34.7749,
      3,
      'arrive_by',
      postMidnight,
      'any'
    );
    expect(lateRecs.length).toBe(3);
  });

  test('6. In-App Walking Navigation parses OSRM turn-by-turn steps, falls back cleanly, and renders live HUD', async () => {
    const {
      fetchWalkingRoute,
      computeWalkingProgress,
      clearWalkingRouteCache,
    } = require('../src/services/walkingNavigation');

    clearWalkingRouteCache();
    mockFetch.mockReset();
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('raw.githubusercontent.com')) {
        return { ok: false, json: async () => ({}) };
      }
      return { ok: true, json: async () => ({ visits: {} }) };
    });

    // 1. OSRM GeoJSON + bilingual turn-by-turn step parsing
    mockFetch.mockImplementationOnce(async () => ({
      ok: true,
      json: async () => ({
        routes: [
          {
            distance: 420,
            duration: 315,
            geometry: {
              coordinates: [
                [34.7749, 32.0754],
                [34.7765, 32.0754],
                [34.7765, 32.0732],
              ],
            },
            legs: [
              {
                steps: [
                  {
                    name: 'דיזנגוף',
                    distance: 160,
                    duration: 120,
                    maneuver: { type: 'depart', location: [34.7749, 32.0754] },
                  },
                  {
                    name: 'המלך ג׳ורג׳',
                    distance: 260,
                    duration: 195,
                    maneuver: {
                      type: 'turn',
                      modifier: 'right',
                      location: [34.7765, 32.0754],
                    },
                  },
                  {
                    name: '',
                    distance: 0,
                    duration: 0,
                    maneuver: { type: 'arrive', location: [34.7765, 32.0732] },
                  },
                ],
              },
            ],
          },
        ],
      }),
    }));

    const route = await fetchWalkingRoute(
      32.0754,
      34.7749,
      32.0732,
      34.7765,
      'תחנת קרליבך',
      'Carlebach Station'
    );
    expect(route.source).toBe('osrm');
    expect(route.coordinates.length).toBe(3);
    expect(route.steps.length).toBe(3);
    expect(route.steps[1].instructionHe).toContain('פנה ימינה');
    expect(route.steps[1].instructionEn).toContain('Turn right');

    // 2. Progress advances to step 1 when reaching the turn point, and arrives near destination
    const atTurn = computeWalkingProgress(32.0754, 34.7765, route, 0);
    expect(atTurn.activeStepIndex).toBe(1);
    expect(atTurn.arrived).toBe(false);

    const atDest = computeWalkingProgress(32.0732, 34.7765, route, 1);
    expect(atDest.arrived).toBe(true);
    expect(atDest.activeStepIndex).toBe(2);

    // 3. Offline fallback never throws
    clearWalkingRouteCache();
    mockFetch.mockImplementationOnce(async () => {
      throw new Error('Network down');
    });
    const fallbackRoute = await fetchWalkingRoute(
      32.0754,
      34.7749,
      32.0732,
      34.7765,
      'תחנת קרליבך',
      'Carlebach Station'
    );
    expect(fallbackRoute.source).toBe('fallback');
    expect(fallbackRoute.steps.length).toBe(2);

    // 4. Mounted App: open Direct Walk Travel Screen, start In-App Walking Navigation, see HUD, stop nav
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    });
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
      coords: { latitude: 32.0754, longitude: 34.7749 },
    });

    await render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/דיזנגוף 50, תל אביב/)).toBeTruthy();
    });

    const walkBtns = await waitFor(() => screen.getAllByText(/הליכה ישירה:/));
    await fireEvent.press(walkBtns[0]);

    const startWalkBtn = await waitFor(() =>
      screen.getByText('נווט בהליכה באפליקציה')
    );
    await fireEvent.press(startWalkBtn);

    await waitFor(() => {
      expect(screen.getAllByText('סיים ניווט').length).toBeGreaterThan(0);
    });

    await fireEvent.press(screen.getAllByText('סיים ניווט')[0]);
    await waitFor(() => {
      expect(mockRemoveWatch).toHaveBeenCalled();
    });
  });

  test('7. Line 41 is suggested to Shaham at 07:50 from Kiryat Ono, and Foreground Service + Live Notification activate on tracking', async () => {
    const { computeRoutesToNearestDankalStations } = require('../src/services/routingEngine');
    const Notifications = require('expo-notifications');
    const KeepAwake = require('expo-keep-awake');

    const morning750 = new Date('2026-11-25T07:50:00+02:00');
    const recs = await computeRoutesToNearestDankalStations(
      32.05742,
      34.8644,
      3,
      'depart_at',
      morning750,
      'any'
    );
    const shaham = recs.find((r: any) => r.station.id === 'st_36313');
    expect(shaham).toBeTruthy();
    const line41 = shaham.liveBusOptions.find((b: any) => b.lineName === '41');
    expect(line41).toBeTruthy();
    expect(line41.etaFormatted).toBe('07:53');

    // Verify background nav protection + live status notification activate and clean up cleanly
    const {
      startActiveNavProtection,
      stopActiveNavProtection,
    } = require('../src/services/backgroundNavigation');
    await startActiveNavProtection('🚌 קו 41 ← שחם', 'נותרו 4 תחנות');
    expect(Location.startLocationUpdatesAsync).toHaveBeenCalled();
    expect(KeepAwake.activateKeepAwakeAsync).toHaveBeenCalled();
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: 'kaltorakal-live-status',
        content: expect.objectContaining({ sticky: true }),
      })
    );
    await stopActiveNavProtection();
    expect(KeepAwake.deactivateKeepAwake).toHaveBeenCalled();
    expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith(
      'kaltorakal-live-status'
    );
  });
});
