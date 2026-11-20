import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Platform,
  Linking,
  Modal,
  Dimensions,
  Animated,
  PanResponder,
  Vibration,
  ViewProps,
  RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MapView, { Marker, Polyline } from 'react-native-maps';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
import { IS_ANDROID, THEME } from './src/theme/platformTheme';
import {
  AdaptivePressable,
  AdaptiveSurface,
  M3ExpressiveSegmentedControl,
} from './src/components/PlatformUI';
import {
  DankalDirection,
  Language,
  StationRecommendation,
  LiveBusOption,
  TimeMode,
  UrgencyLevel,
  SelectedJourney,
  SavedPlace,
} from './src/types/transit';
import { STRINGS, PRESET_ORIGINS, PresetOrigin } from './src/i18n/strings';
import {
  computeRoutesToNearestDankalStations,
  getAllStations,
  getRedLinePolylines,
  haversineMeters,
  isShabbatServiceWindow,
  isWithinGushDanServiceArea,
  syncLatestGtfsDataset,
} from './src/services/routingEngine';
import {
  OriginSearchResult,
  searchAddressesAndPlaces,
  searchLocalBusStops,
} from './src/services/originSearch';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const NativeSegmentedControl =
  SegmentedControl as unknown as React.ComponentType<any>;
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const SHEET_COLLAPSED_HEIGHT = 132;
const SHEET_DEFAULT_HEIGHT = Math.round(SCREEN_HEIGHT * 0.55);
const SHEET_EXPANDED_HEIGHT = Math.round(SCREEN_HEIGHT * 0.82);

export default function App() {
  const mapRef = useRef<MapView | null>(null);

  const [lang, setLang] = useState<Language>('he');
  const [k, setK] = useState<number>(3);
  const [direction, setDirection] = useState<DankalDirection>('any');
  const [timeMode, setTimeMode] = useState<TimeMode>('now');
  const [targetDate, setTargetDate] = useState<Date>(() => new Date());
  const [showTimePicker, setShowTimePicker] = useState<boolean>(false);
  const [androidPickerMode, setAndroidPickerMode] = useState<'date' | 'time'>(
    'date'
  );
  const [showOriginSheet, setShowOriginSheet] = useState<boolean>(false);
  const [originSearchQuery, setOriginSearchQuery] = useState<string>('');
  const [addressSearchResults, setAddressSearchResults] = useState<
    OriginSearchResult[]
  >([]);
  const [searchingAddresses, setSearchingAddresses] = useState<boolean>(false);
  const [locatingGps, setLocatingGps] = useState<boolean>(false);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(
    null
  );

  // Active Travel Screen state
  const [selectedJourney, setSelectedJourney] =
    useState<SelectedJourney | null>(null);
  const [showIntermediateStops, setShowIntermediateStops] =
    useState<boolean>(true);

  // Live Route Progress & Get-Off Alert State
  const [isTrackingRide, setIsTrackingRide] = useState<boolean>(false);
  const [liveUserCoords, setLiveUserCoords] = useState<{
    lat: number;
    lon: number;
  } | null>(null);
  const [currentStopIndex, setCurrentStopIndex] = useState<number>(-1);
  const [activeAlertBanner, setActiveAlertBanner] = useState<{
    level: 'prepare' | 'get_off' | 'done';
    title: string;
    body: string;
  } | null>(null);

  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const firedAlertsRef = useRef<{
    prepareFired: boolean;
    getOffFired: boolean;
    doneFired: boolean;
  }>({
    prepareFired: false,
    getOffFired: false,
    doneFired: false,
  });

  // Collapsible / Draggable Bottom Sheet State
  const [sheetSnap, setSheetSnap] = useState<
    'collapsed' | 'default' | 'expanded'
  >('default');
  const sheetHeightAnim = useRef(
    new Animated.Value(SHEET_DEFAULT_HEIGHT)
  ).current;
  const dragStartHeightRef = useRef<number>(SHEET_DEFAULT_HEIGHT);

  // Measure the floating top overlay so the expanded bottom sheet NEVER overlaps it (even with custom time row open)
  const [topOverlayBottomY, setTopOverlayBottomY] = useState<number>(210);
  const maxExpandedHeight = useMemo(
    () =>
      Math.max(
        SHEET_DEFAULT_HEIGHT,
        Math.min(
          SHEET_EXPANDED_HEIGHT,
          Math.floor(SCREEN_HEIGHT - topOverlayBottomY - 12)
        )
      ),
    [topOverlayBottomY]
  );
  const maxExpandedHeightRef = useRef<number>(maxExpandedHeight);
  useEffect(() => {
    maxExpandedHeightRef.current = maxExpandedHeight;
    if (sheetSnap === 'expanded') {
      Animated.spring(sheetHeightAnim, {
        toValue: maxExpandedHeight,
        useNativeDriver: false,
        damping: 22,
        stiffness: 210,
      }).start();
    }
  }, [maxExpandedHeight, sheetSnap, sheetHeightAnim]);

  const snapSheetTo = useCallback(
    (target: 'collapsed' | 'default' | 'expanded') => {
      if (Platform.OS !== 'web') {
        Haptics.selectionAsync();
      }
      setSheetSnap(target);
      const toValue =
        target === 'collapsed'
          ? SHEET_COLLAPSED_HEIGHT
          : target === 'expanded'
          ? maxExpandedHeightRef.current
          : SHEET_DEFAULT_HEIGHT;
      dragStartHeightRef.current = toValue;
      Animated.spring(sheetHeightAnim, {
        toValue,
        useNativeDriver: false,
        damping: 22,
        stiffness: 210,
      }).start();
    },
    [sheetHeightAnim]
  );

  const cycleSheetSnap = useCallback(() => {
    if (sheetSnap === 'default') {
      snapSheetTo('collapsed');
    } else {
      snapSheetTo('default');
    }
  }, [sheetSnap, snapSheetTo]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dy) > 4,
        onPanResponderGrant: () => {
          sheetHeightAnim.stopAnimation((val) => {
            dragStartHeightRef.current = val;
          });
        },
        onPanResponderMove: (_, gestureState) => {
          const nextHeight = Math.max(
            SHEET_COLLAPSED_HEIGHT - 15,
            Math.min(
              maxExpandedHeightRef.current,
              dragStartHeightRef.current - gestureState.dy
            )
          );
          sheetHeightAnim.setValue(nextHeight);
        },
        onPanResponderRelease: (_, gestureState) => {
          if (
            Math.abs(gestureState.dy) < 6 &&
            Math.abs(gestureState.vy) < 0.15
          ) {
            cycleSheetSnap();
            return;
          }
          const finalEstHeight =
            dragStartHeightRef.current -
            gestureState.dy -
            gestureState.vy * 90;
          const distCollapsed = Math.abs(
            finalEstHeight - SHEET_COLLAPSED_HEIGHT
          );
          const distDefault = Math.abs(finalEstHeight - SHEET_DEFAULT_HEIGHT);
          const distExpanded = Math.abs(
            finalEstHeight - maxExpandedHeightRef.current
          );
          if (distCollapsed <= distDefault && distCollapsed <= distExpanded) {
            snapSheetTo('collapsed');
          } else if (distExpanded < distDefault) {
            snapSheetTo('expanded');
          } else {
            snapSheetTo('default');
          }
        },
      }),
    [cycleSheetSnap, sheetHeightAnim, snapSheetTo]
  );

  const [activeOrigin, setActiveOrigin] = useState<{
    id: string;
    name_he: string;
    name_en: string;
    lat: number;
    lon: number;
    isGps: boolean;
  }>({
    ...PRESET_ORIGINS[0],
    isGps: false,
  });

  const [recommendations, setRecommendations] = useState<
    StationRecommendation[]
  >([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [lastUpdatedMs, setLastUpdatedMs] = useState<number>(0);
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState<number>(0);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [savedPlaces, setSavedPlaces] = useState<{
    home?: SavedPlace;
    work?: SavedPlace;
  }>({});

  const SAVED_PLACES_KEY = 'kaltorakal_saved_places_v1';

  const t = STRINGS[lang];
  const isRTL = lang === 'he';

  const isOutOfServiceArea = useMemo(
    () => !isWithinGushDanServiceArea(activeOrigin.lat, activeOrigin.lon),
    [activeOrigin.lat, activeOrigin.lon]
  );

  const isShabbatNow = useMemo(
    () => isShabbatServiceWindow(timeMode === 'now' ? new Date() : targetDate),
    [timeMode, targetDate]
  );

  const allStations = useMemo(() => getAllStations(), []);
  const { r1Coords, r2BranchCoords } = useMemo(() => getRedLinePolylines(), []);

  const triggerHaptic = (
    type: 'selection' | 'light' | 'success' | 'warning' | 'error' = 'selection'
  ) => {
    if (Platform.OS === 'web') return;
    if (type === 'selection') {
      Haptics.selectionAsync();
    } else if (type === 'light') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else if (type === 'warning') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else if (type === 'error') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const fireLocalNotification = useCallback(
    async (title: string, body: string) => {
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title,
            body,
            sound: true,
          },
          trigger: null,
        });
      } catch {
        // Fallback if notifications permission wasn't granted
      }
    },
    []
  );

  const stopAllTracking = useCallback(() => {
    if (locationSubRef.current) {
      locationSubRef.current.remove();
      locationSubRef.current = null;
    }
    setIsTrackingRide(false);
    setLiveUserCoords(null);
    setCurrentStopIndex(-1);
    setActiveAlertBanner(null);
    firedAlertsRef.current = {
      prepareFired: false,
      getOffFired: false,
      doneFired: false,
    };
  }, []);

  useEffect(() => {
    return () => {
      stopAllTracking();
    };
  }, [stopAllTracking]);

  const evaluateRouteProgress = useCallback(
    (lat: number, lon: number, journey: SelectedJourney) => {
      setLiveUserCoords({ lat, lon });
      const rec = journey.recommendation;
      const stName = isRTL ? rec.station.name_he : rec.station.name_en;

      if (journey.mode === 'bus' && journey.busOption) {
        const bus = journey.busOption;
        const stops = bus.intermediateStops;
        const alightName = isRTL ? bus.alightStopNameHe : bus.alightStopNameEn;

        const distToDankal = haversineMeters(
          lat,
          lon,
          rec.station.lat,
          rec.station.lon
        );

        let closestIdx = -1;
        let minStopDist = haversineMeters(
          lat,
          lon,
          bus.originStopLat,
          bus.originStopLon
        );

        for (let i = 0; i < stops.length; i++) {
          const d = haversineMeters(lat, lon, stops[i].lat, stops[i].lon);
          if (d < minStopDist) {
            minStopDist = d;
            closestIdx = i;
          }
        }

        setCurrentStopIndex((prev) => Math.max(prev, closestIdx));

        const lastStopIdx = stops.length - 1;
        const distToAlight = haversineMeters(
          lat,
          lon,
          bus.alightStopLat,
          bus.alightStopLon
        );

        if (
          lastStopIdx >= 1 &&
          closestIdx === lastStopIdx - 1 &&
          !firedAlertsRef.current.prepareFired
        ) {
          firedAlertsRef.current.prepareFired = true;
          const title = t.prepareToGetOffAlertTitle;
          const body = t.prepareToGetOffAlertBody
            .replace('{stop}', alightName)
            .replace('{station}', stName);
          triggerHaptic('warning');
          Vibration.vibrate(400);
          setActiveAlertBanner({ level: 'prepare', title, body });
          fireLocalNotification(title, body);
        }

        if (
          (closestIdx === lastStopIdx || distToAlight <= 170) &&
          !firedAlertsRef.current.getOffFired
        ) {
          firedAlertsRef.current.getOffFired = true;
          setCurrentStopIndex(lastStopIdx);
          const title = t.getOffNowAlertTitle;
          const body = t.getOffNowAlertBody
            .replace('{stop}', alightName)
            .replace('{m}', String(bus.walkFromBusMeters))
            .replace('{station}', stName);
          triggerHaptic('error');
          Vibration.vibrate([0, 500, 200, 500]);
          setActiveAlertBanner({ level: 'get_off', title, body });
          fireLocalNotification(title, body);
        }

        if (
          distToDankal <= 85 &&
          firedAlertsRef.current.getOffFired &&
          !firedAlertsRef.current.doneFired
        ) {
          firedAlertsRef.current.doneFired = true;
          const title = t.reachedDankalTitle.replace('{station}', stName);
          const body = t.reachedDankalBody;
          triggerHaptic('success');
          setActiveAlertBanner({ level: 'done', title, body });
          fireLocalNotification(title, body);
        }
      } else {
        const distToDankal = haversineMeters(
          lat,
          lon,
          rec.station.lat,
          rec.station.lon
        );
        if (distToDankal <= 90 && !firedAlertsRef.current.doneFired) {
          firedAlertsRef.current.doneFired = true;
          const title = t.reachedDankalTitle.replace('{station}', stName);
          const body = t.reachedDankalBody;
          triggerHaptic('success');
          setActiveAlertBanner({ level: 'done', title, body });
          fireLocalNotification(title, body);
        }
      }
    },
    [fireLocalNotification, isRTL, t]
  );

  const handleStartLiveTracking = async () => {
    if (!selectedJourney) return;
    stopAllTracking();
    triggerHaptic('light');

    try {
      await Notifications.requestPermissionsAsync();
    } catch {
      // ignore
    }

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setGpsError(
        lang === 'he'
          ? 'נדרשת הרשאת GPS למעקב חי'
          : 'GPS permission required for live tracking'
      );
      return;
    }

    setIsTrackingRide(true);
    setShowIntermediateStops(true);

    const sub = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        distanceInterval: 15,
        timeInterval: 3000,
      },
      (loc) => {
        evaluateRouteProgress(
          loc.coords.latitude,
          loc.coords.longitude,
          selectedJourney
        );
      }
    );
    locationSubRef.current = sub;
  };

  /**
   * Smart Map Framing:
   * Fits the user origin + ALL k nearest Dankal stations in the visible upper map viewport
   * with generous padding so station pins don't overlap each other!
   */
  const fitMapToStations = useCallback(
    (
      origLat: number,
      origLon: number,
      recs: StationRecommendation[],
      focusSingleStation?: { lat: number; lon: number }
    ) => {
      if (!mapRef.current) return;
      const points = [
        { latitude: origLat, longitude: origLon },
        ...(focusSingleStation
          ? [
              {
                latitude: focusSingleStation.lat,
                longitude: focusSingleStation.lon,
              },
            ]
          : recs.map((r) => ({
              latitude: r.station.lat,
              longitude: r.station.lon,
            }))),
      ];
      if (points.length < 2) return;

      let minLat = Infinity,
        maxLat = -Infinity,
        minLon = Infinity,
        maxLon = -Infinity;
      for (const p of points) {
        if (p.latitude < minLat) minLat = p.latitude;
        if (p.latitude > maxLat) maxLat = p.latitude;
        if (p.longitude < minLon) minLon = p.longitude;
        if (p.longitude > maxLon) maxLon = p.longitude;
      }

      const latSpan = Math.max(0.016, (maxLat - minLat) * 1.65);
      const lonSpan = Math.max(0.018, (maxLon - minLon) * 1.65);
      const centerLat = (minLat + maxLat) / 2 - latSpan * 0.22;
      const centerLon = (minLon + maxLon) / 2;

      mapRef.current.animateToRegion(
        {
          latitude: centerLat,
          longitude: centerLon,
          latitudeDelta: latSpan,
          longitudeDelta: lonSpan,
        },
        450
      );
    },
    []
  );

  const fetchRoutes = useCallback(
    async (
      lat: number,
      lon: number,
      countK: number,
      mode: TimeMode,
      dateVal: Date,
      dirVal: DankalDirection,
      silent = false
    ) => {
      if (!silent) setLoading(true);
      try {
        const res = await computeRoutesToNearestDankalStations(
          lat,
          lon,
          countK,
          mode,
          dateVal,
          dirVal
        );
        setRecommendations(res);
        if (res.length > 0 && !silent) {
          const fastest = [...res].sort((a, b) => {
            if (a.bestTotalMinutes !== b.bestTotalMinutes) {
              return a.bestTotalMinutes - b.bestTotalMinutes;
            }
            const aStops =
              a.bestMode === 'bus' && a.liveBusOptions.length > 0
                ? a.liveBusOptions[0].intermediateStops.length
                : 0;
            const bStops =
              b.bestMode === 'bus' && b.liveBusOptions.length > 0
                ? b.liveBusOptions[0].intermediateStops.length
                : 0;
            return aStops - bStops;
          })[0];
          setSelectedStationId(fastest.station.id);
          fitMapToStations(lat, lon, res);
        }
        setLastUpdatedMs(Date.now());
        setSecondsSinceUpdate(0);
      } catch (err) {
        console.error('Error computing routes:', err);
      } finally {
        if (!silent) setLoading(false);
        setRefreshing(false);
      }
    },
    [fitMapToStations]
  );

  // On app launch: load Saved Places (Home/Work), sync latest GTFS in background, and attempt auto-GPS lock
  const bootInitDoneRef = useRef<boolean>(false);
  useEffect(() => {
    if (bootInitDoneRef.current) return;
    bootInitDoneRef.current = true;

    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SAVED_PLACES_KEY);
        if (raw) {
          setSavedPlaces(JSON.parse(raw));
        }
      } catch {
        // ignore
      }
      // Silently check GitHub Raw for fresher nightly GTFS timetables
      syncLatestGtfsDataset().then((updated) => {
        if (updated) {
          fetchRoutes(
            activeOrigin.lat,
            activeOrigin.lon,
            k,
            timeMode,
            targetDate,
            direction,
            true
          );
        }
      });
    })();
  }, []);

  // Auto-refresh live SIRI ETAs every 30 seconds while in 'now' mode
  useEffect(() => {
    if (timeMode !== 'now' || isOutOfServiceArea) return;
    const interval = setInterval(() => {
      fetchRoutes(
        activeOrigin.lat,
        activeOrigin.lon,
        k,
        'now',
        new Date(),
        direction,
        true
      );
    }, 30000);
    return () => clearInterval(interval);
  }, [
    timeMode,
    isOutOfServiceArea,
    activeOrigin.lat,
    activeOrigin.lon,
    k,
    direction,
    fetchRoutes,
  ]);

  // Tick "Updated Xs ago" counter every 5 seconds
  useEffect(() => {
    if (!lastUpdatedMs) return;
    const timer = setInterval(() => {
      setSecondsSinceUpdate(
        Math.max(0, Math.floor((Date.now() - lastUpdatedMs) / 1000))
      );
    }, 5000);
    return () => clearInterval(timer);
  }, [lastUpdatedMs]);

  const handleSaveCurrentPlace = async (slot: 'home' | 'work') => {
    triggerHaptic('success');
    const place: SavedPlace = {
      slot,
      name_he: activeOrigin.name_he.replace(' (GPS)', ''),
      name_en: activeOrigin.name_en.replace(' (GPS)', ''),
      lat: activeOrigin.lat,
      lon: activeOrigin.lon,
    };
    const next = { ...savedPlaces, [slot]: place };
    setSavedPlaces(next);
    try {
      await AsyncStorage.setItem(SAVED_PLACES_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const handleSelectSavedPlace = (place: SavedPlace) => {
    triggerHaptic('selection');
    setGpsError(null);
    setActiveOrigin({
      id: `saved_${place.slot}`,
      name_he: place.name_he,
      name_en: place.name_en,
      lat: place.lat,
      lon: place.lon,
      isGps: false,
    });
    setShowOriginSheet(false);
    setOriginSearchQuery('');
  };

  useEffect(() => {
    stopAllTracking();
    setSelectedJourney(null);
    fetchRoutes(
      activeOrigin.lat,
      activeOrigin.lon,
      k,
      timeMode,
      targetDate,
      direction
    );
  }, [
    activeOrigin.lat,
    activeOrigin.lon,
    k,
    timeMode,
    targetDate,
    direction,
    fetchRoutes,
    stopAllTracking,
  ]);

  const handleUseMyGps = useCallback(async (silentOnDeny = false) => {
    if (!silentOnDeny) {
      triggerHaptic('light');
    }
    setGpsError(null);
    setLocatingGps(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (!silentOnDeny) {
          setGpsError(
            lang === 'he'
              ? 'לא ניתנה הרשאת מיקום (GPS)'
              : 'Location permission denied'
          );
        }
        setLocatingGps(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const lat = Number(loc.coords.latitude.toFixed(5));
      const lon = Number(loc.coords.longitude.toFixed(5));

      let labelHe = 'המיקום הנוכחי שלי (GPS)';
      let labelEn = 'My Current Location (GPS)';
      try {
        const rev = await Location.reverseGeocodeAsync({
          latitude: lat,
          longitude: lon,
        });
        if (rev && rev.length > 0) {
          const r = rev[0];
          const street = r.street
            ? r.streetNumber
              ? `${r.street} ${r.streetNumber}`
              : r.street
            : r.name || '';
          const city = r.city || r.subregion || '';
          const formatted = [street, city].filter(Boolean).join(', ');
          if (formatted) {
            labelHe = `${formatted} (GPS)`;
            labelEn = `${formatted} (GPS)`;
          }
        }
      } catch {
        // Keep default GPS label
      }

      if (!silentOnDeny) {
        triggerHaptic('success');
      }
      setActiveOrigin({
        id: 'gps',
        name_he: labelHe,
        name_en: labelEn,
        lat,
        lon,
        isGps: true,
      });
      setShowOriginSheet(false);
      setOriginSearchQuery('');
    } catch {
      if (!silentOnDeny) {
        setGpsError(
          lang === 'he'
            ? 'לא ניתן לקבל מיקום GPS כעת'
            : 'Could not fetch GPS location'
        );
      }
    } finally {
      setLocatingGps(false);
    }
  }, [lang]);

  // Auto-start on user's live GPS once on initial app launch (silent fallback if denied)
  const autoGpsTriedRef = useRef<boolean>(false);
  useEffect(() => {
    if (autoGpsTriedRef.current) return;
    autoGpsTriedRef.current = true;
    handleUseMyGps(true);
  }, [handleUseMyGps]);

  // Instant offline bus stop search while typing in the Origin modal
  const localStopResults = useMemo(
    () => searchLocalBusStops(originSearchQuery, 6),
    [originSearchQuery]
  );

  // Debounced free address / place search via Photon (OpenStreetMap) + OS Geocoder fallback
  useEffect(() => {
    const trimmed = originSearchQuery.trim();
    if (!showOriginSheet || trimmed.length < 2) {
      setAddressSearchResults([]);
      setSearchingAddresses(false);
      return;
    }

    let cancelled = false;
    setSearchingAddresses(true);
    const timer = setTimeout(async () => {
      const results = await searchAddressesAndPlaces(trimmed, lang, 6);
      if (!cancelled) {
        setAddressSearchResults(results);
        setSearchingAddresses(false);
      }
    }, 320);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [originSearchQuery, showOriginSheet, lang]);

  const handleSelectSearchResult = (res: OriginSearchResult) => {
    triggerHaptic('selection');
    setGpsError(null);
    setActiveOrigin({
      id: res.id,
      name_he: res.name_he,
      name_en: res.name_en,
      lat: res.lat,
      lon: res.lon,
      isGps: false,
    });
    setShowOriginSheet(false);
    setOriginSearchQuery('');
  };

  const handleMapLongPress = async (e: {
    nativeEvent: { coordinate: { latitude: number; longitude: number } };
  }) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    triggerHaptic('light');
    setGpsError(null);

    const lat = Number(latitude.toFixed(5));
    const lon = Number(longitude.toFixed(5));
    let labelHe = t.customMapPinHe;
    let labelEn = t.customMapPinEn;

    try {
      const rev = await Location.reverseGeocodeAsync({
        latitude: lat,
        longitude: lon,
      });
      if (rev && rev.length > 0) {
        const r = rev[0];
        const street = r.street
          ? r.streetNumber
            ? `${r.street} ${r.streetNumber}`
            : r.street
          : r.name || '';
        const city = r.city || r.subregion || '';
        const formatted = [street, city].filter(Boolean).join(', ');
        if (formatted) {
          labelHe = formatted;
          labelEn = formatted;
        }
      }
    } catch {
      // keep default dropped pin label
    }

    setActiveOrigin({
      id: `pin_${lat}_${lon}`,
      name_he: labelHe,
      name_en: labelEn,
      lat,
      lon,
      isGps: false,
    });
  };

  const handleSelectPreset = (preset: PresetOrigin) => {
    triggerHaptic('selection');
    setGpsError(null);
    setActiveOrigin({
      ...preset,
      isGps: false,
    });
    setShowOriginSheet(false);
    setOriginSearchQuery('');
  };

  const handleTimeModeChange = (index: number) => {
    triggerHaptic('selection');
    const modes: TimeMode[] = ['now', 'depart_at', 'arrive_by'];
    const orderedModes = isRTL ? [...modes].reverse() : modes;
    const chosen = orderedModes[index] || 'now';
    setTimeMode(chosen);
    setShowTimePicker(false);
    if (chosen === 'now') {
      setTargetDate(new Date());
    }
  };

  const handleTimePickerChange = (
    event: DateTimePickerEvent,
    selected?: Date
  ) => {
    if (Platform.OS === 'android') {
      setShowTimePicker(false);
    }
    if (event.type === 'set' && selected) {
      triggerHaptic('selection');
      setTargetDate(selected);
    }
  };

  const openDirectionsToCoords = (
    destLat: number,
    destLon: number,
    label: string,
    mode: 'walking' | 'transit' = 'walking'
  ) => {
    triggerHaptic('light');
    const encodedLabel = encodeURIComponent(label);
    const iosFlag = mode === 'walking' ? 'w' : 'r';
    const androidMode = mode === 'walking' ? 'w' : 'r';
    const url = Platform.select({
      ios: `maps://?saddr=${activeOrigin.lat},${activeOrigin.lon}&daddr=${destLat},${destLon}&dirflg=${iosFlag}&q=${encodedLabel}`,
      android: `google.navigation:q=${destLat},${destLon}&mode=${androidMode}`,
      default: `https://www.google.com/maps/dir/?api=1&origin=${activeOrigin.lat},${activeOrigin.lon}&destination=${destLat},${destLon}&travelmode=${mode}`,
    });
    if (url) {
      Linking.openURL(url).catch(() => {
        Linking.openURL(
          `https://www.google.com/maps/dir/?api=1&origin=${activeOrigin.lat},${activeOrigin.lon}&destination=${destLat},${destLon}&travelmode=${mode}`
        );
      });
    }
  };

  const handleSelectJourney = (
    rec: StationRecommendation,
    mode: 'bus' | 'walk' | 'scooter',
    busOption?: LiveBusOption
  ) => {
    stopAllTracking();
    triggerHaptic('light');
    setSelectedStationId(rec.station.id);
    setShowIntermediateStops(true);
    setSelectedJourney({
      recommendation: rec,
      mode,
      busOption,
    });
    if (sheetSnap === 'collapsed') {
      snapSheetTo('default');
    }
    fitMapToStations(activeOrigin.lat, activeOrigin.lon, recommendations, {
      lat: rec.station.lat,
      lon: rec.station.lon,
    });
  };

  const formatUrgencyBadge = (bus: LiveBusOption): {
    label: string;
    bg: string;
    border: string;
    text: string;
  } => {
    const u: UrgencyLevel = bus.urgency;
    if (u === 'chill') {
      return {
        label: `🟢 ${t.urgencyChill.replace(
          '{m}',
          String(Math.max(2, bus.spareMinutesToWalk))
        )}`,
        bg: 'rgba(16, 185, 129, 0.16)',
        border: 'rgba(52, 211, 153, 0.45)',
        text: '#6EE7B7',
      };
    }
    if (u === 'leave_now') {
      return {
        label: `🟡 ${t.urgencyLeaveNow}`,
        bg: 'rgba(245, 158, 11, 0.18)',
        border: 'rgba(251, 191, 36, 0.5)',
        text: '#FCD34D',
      };
    }
    return {
      label: `🔴 ${t.urgencyBrisk}`,
      bg: 'rgba(239, 68, 68, 0.2)',
      border: 'rgba(248, 113, 113, 0.55)',
      text: '#FCA5A5',
    };
  };

  const compareStationRecs = useCallback(
    (a: StationRecommendation, b: StationRecommendation) => {
      if (a.bestTotalMinutes !== b.bestTotalMinutes) {
        return a.bestTotalMinutes - b.bestTotalMinutes;
      }
      const aStops =
        a.bestMode === 'bus' && a.liveBusOptions.length > 0
          ? a.liveBusOptions[0].intermediateStops.length
          : 0;
      const bStops =
        b.bestMode === 'bus' && b.liveBusOptions.length > 0
          ? b.liveBusOptions[0].intermediateStops.length
          : 0;
      if (aStops !== bStops) {
        return aStops - bStops;
      }
      return a.aerialMeters - b.aerialMeters;
    },
    []
  );

  const sortedRecommendations = useMemo(() => {
    const copy = [...recommendations];
    copy.sort(compareStationRecs);
    return copy;
  }, [recommendations, compareStationRecs]);

  const overallFastestStationId = useMemo(() => {
    if (sortedRecommendations.length === 0) return null;
    return sortedRecommendations[0].station.id;
  }, [sortedRecommendations]);

  const selectedStationRec = useMemo(
    () =>
      selectedJourney?.recommendation ||
      recommendations.find((r) => r.station.id === selectedStationId) ||
      sortedRecommendations[0] ||
      null,
    [selectedJourney, recommendations, selectedStationId, sortedRecommendations]
  );

  const activeMapBusOption = useMemo(() => {
    if (selectedJourney) {
      return selectedJourney.mode === 'bus' ? selectedJourney.busOption : null;
    }
    if (
      selectedStationRec &&
      selectedStationRec.bestMode === 'bus' &&
      selectedStationRec.liveBusOptions.length > 0
    ) {
      return selectedStationRec.liveBusOptions[0];
    }
    return null;
  }, [selectedJourney, selectedStationRec]);

  const rowDir = isRTL ? ('row-reverse' as const) : ('row' as const);
  const textAlign = isRTL ? ('right' as const) : ('left' as const);

  const segmentedValues = useMemo(() => {
    const labels = [t.modeLeaveNow, t.modeDepartAt, t.modeArriveBy];
    return isRTL ? [...labels].reverse() : labels;
  }, [t, isRTL]);

  const segmentedSelectedIndex = useMemo(() => {
    const modes: TimeMode[] = ['now', 'depart_at', 'arrive_by'];
    const ordered = isRTL ? [...modes].reverse() : modes;
    return Math.max(0, ordered.indexOf(timeMode));
  }, [timeMode, isRTL]);

  const directionOptions: { id: DankalDirection; label: string }[] = useMemo(
    () => [
      { id: 'any', label: t.dirAny },
      { id: 'to_tlv_batyam', label: t.dirTlvBatYam },
      { id: 'to_pt', label: t.dirPetahTikva },
      { id: 'to_kiryat_arye', label: t.dirKiryatArye },
    ],
    [t]
  );

  const formattedTargetTime = useMemo(() => {
    return targetDate.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }, [targetDate]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* 1. Full-Screen Native Apple Map (iOS) / Google Map (Android) */}
      <MapView
        ref={mapRef}
        style={styles.map}
        userInterfaceStyle="dark"
        showsUserLocation={true}
        showsCompass={false}
        showsScale={false}
        onLongPress={handleMapLongPress}
        initialRegion={{
          latitude: activeOrigin.lat - 0.008,
          longitude: activeOrigin.lon,
          latitudeDelta: 0.035,
          longitudeDelta: 0.035,
        }}
      >
        {r1Coords.length > 1 && (
          <Polyline
            coordinates={r1Coords}
            strokeColor="#FF453A"
            strokeWidth={4}
          />
        )}
        {r2BranchCoords.length > 1 && (
          <Polyline
            coordinates={r2BranchCoords}
            strokeColor="#FF6961"
            strokeWidth={3.5}
          />
        )}

        {allStations.map((st) => {
          const isNearestK = recommendations.some(
            (r) => r.station.id === st.id
          );
          if (isNearestK) return null;
          return (
            <Marker
              key={st.id}
              coordinate={{ latitude: st.lat, longitude: st.lon }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
            >
              <View style={styles.minorStationDot} />
            </Marker>
          );
        })}

        {/* Compact Single-Line Pill Markers for the k Nearest Stations */}
        {recommendations.map((rec) => {
          const isFastest = rec.station.id === overallFastestStationId;
          const isSelected = rec.station.id === selectedStationId;
          const stName = isRTL ? rec.station.name_he : rec.station.name_en;
          return (
            <Marker
              key={rec.station.id}
              coordinate={{
                latitude: rec.station.lat,
                longitude: rec.station.lon,
              }}
              zIndex={isSelected ? 30 : isFastest ? 20 : 10}
              onPress={() => {
                triggerHaptic('selection');
                setSelectedStationId(rec.station.id);
                fitMapToStations(
                  activeOrigin.lat,
                  activeOrigin.lon,
                  recommendations,
                  { lat: rec.station.lat, lon: rec.station.lon }
                );
              }}
            >
              <View
                style={[
                  styles.stationMapPin,
                  isFastest && styles.stationMapPinFastest,
                  isSelected && styles.stationMapPinSelected,
                  { flexDirection: rowDir },
                ]}
              >
                <Text style={styles.stationMapPinName} numberOfLines={1}>
                  {stName}
                </Text>
                <View
                  style={[
                    styles.stationMapPinEtaPill,
                    isFastest && styles.stationMapPinEtaPillFastest,
                  ]}
                >
                  <Text style={styles.stationMapPinEtaText}>
                    {rec.bestTotalMinutes}'
                  </Text>
                </View>
              </View>
            </Marker>
          );
        })}

        {/* User / Active Origin Marker */}
        <Marker
          coordinate={{
            latitude: activeOrigin.lat,
            longitude: activeOrigin.lon,
          }}
          title={isRTL ? activeOrigin.name_he : activeOrigin.name_en}
        >
          <View style={styles.userOriginPulseOuter}>
            <View style={styles.userOriginDot} />
          </View>
        </Marker>

        {/* Live Tracked Bus / Rider Position Marker on Map */}
        {liveUserCoords && (
          <Marker
            coordinate={{
              latitude: liveUserCoords.lat,
              longitude: liveUserCoords.lon,
            }}
          >
            <View style={styles.liveVehicleTrackerPin}>
              <Ionicons name="bus" size={14} color="#FFFFFF" />
            </View>
          </Marker>
        )}

        {/* Boarding & Alighting Stop Markers + Route Polyline */}
        {selectedStationRec && (
          <>
            {activeMapBusOption ? (
              <>
                <Marker
                  coordinate={{
                    latitude: activeMapBusOption.originStopLat,
                    longitude: activeMapBusOption.originStopLon,
                  }}
                  title={
                    isRTL
                      ? activeMapBusOption.originStopNameHe
                      : activeMapBusOption.originStopNameEn
                  }
                >
                  <View style={styles.busStopPin}>
                    <Ionicons name="bus" size={11} color="#FFFFFF" />
                  </View>
                </Marker>

                {selectedJourney &&
                  activeMapBusOption.intermediateStops.map((istop, idx) => {
                    const isPassed = idx <= currentStopIndex;
                    return (
                      <Marker
                        key={istop.stopId}
                        coordinate={{
                          latitude: istop.lat,
                          longitude: istop.lon,
                        }}
                        anchor={{ x: 0.5, y: 0.5 }}
                      >
                        <View
                          style={[
                            styles.intermediateStopDot,
                            isPassed && styles.intermediateStopDotPassed,
                          ]}
                        />
                      </Marker>
                    );
                  })}

                <Polyline
                  coordinates={[
                    { latitude: activeOrigin.lat, longitude: activeOrigin.lon },
                    {
                      latitude: activeMapBusOption.originStopLat,
                      longitude: activeMapBusOption.originStopLon,
                    },
                  ]}
                  strokeColor="#64D2FF"
                  strokeWidth={3.5}
                  lineDashPattern={[6, 6]}
                />

                <Polyline
                  coordinates={[
                    {
                      latitude: activeMapBusOption.originStopLat,
                      longitude: activeMapBusOption.originStopLon,
                    },
                    ...activeMapBusOption.intermediateStops.map((s) => ({
                      latitude: s.lat,
                      longitude: s.lon,
                    })),
                  ]}
                  strokeColor="#0A84FF"
                  strokeWidth={5}
                />

                <Polyline
                  coordinates={[
                    {
                      latitude: activeMapBusOption.alightStopLat,
                      longitude: activeMapBusOption.alightStopLon,
                    },
                    {
                      latitude: selectedStationRec.station.lat,
                      longitude: selectedStationRec.station.lon,
                    },
                  ]}
                  strokeColor="#30D158"
                  strokeWidth={3.5}
                  lineDashPattern={[5, 5]}
                />
              </>
            ) : (
              <Polyline
                coordinates={[
                  { latitude: activeOrigin.lat, longitude: activeOrigin.lon },
                  {
                    latitude: selectedStationRec.station.lat,
                    longitude: selectedStationRec.station.lon,
                  },
                ]}
                strokeColor="#30D158"
                strokeWidth={4}
                lineDashPattern={[6, 6]}
              />
            )}
          </>
        )}
      </MapView>

      {/* 2. Floating Top Card (iOS Liquid Glass / Android Material 3 Expressive) */}
      <SafeAreaView
        style={styles.topFloatingSafe}
        pointerEvents="box-none"
        onLayout={(e) => {
          const { y, height } = e.nativeEvent.layout;
          if (height > 0) {
            setTopOverlayBottomY(y + height);
          }
        }}
      >
        <AdaptiveSurface intensity={60} tonalLevel="high" style={styles.topGlassCard}>
          <View style={[styles.topHeaderRow, { flexDirection: rowDir }]}>
            <AdaptivePressable
              style={[styles.originSelectorBtn, { flexDirection: rowDir }]}
              onPress={() => {
                triggerHaptic('light');
                setShowOriginSheet(true);
              }}
            >
              <Ionicons
                name={activeOrigin.isGps ? 'navigate-circle' : 'location'}
                size={20}
                color={THEME.primary}
              />
              <View
                style={{
                  flex: 1,
                  alignItems: isRTL ? 'flex-end' : 'flex-start',
                }}
              >
                <Text style={styles.originCaption}>{t.customCoords}</Text>
                <Text
                  style={[styles.originMainText, { textAlign }]}
                  numberOfLines={1}
                >
                  {isRTL ? activeOrigin.name_he : activeOrigin.name_en}
                </Text>
              </View>
              <Ionicons
                name="chevron-down"
                size={15}
                color={THEME.onSurfaceVariant}
              />
            </AdaptivePressable>

            <AdaptivePressable
              style={styles.glassCircleIconBtn}
              onPress={() => handleUseMyGps(false)}
            >
              {locatingGps ? (
                <ActivityIndicator size="small" color={THEME.primary} />
              ) : (
                <Ionicons
                  name="locate"
                  size={18}
                  color={activeOrigin.isGps ? THEME.primary : THEME.onSurface}
                />
              )}
            </AdaptivePressable>

            <AdaptivePressable
              style={styles.glassLangBtn}
              onPress={() => {
                triggerHaptic('selection');
                setLang((prev) => (prev === 'he' ? 'en' : 'he'));
              }}
            >
              <Text style={styles.langPillText}>
                {lang === 'he' ? 'EN' : 'עב'}
              </Text>
            </AdaptivePressable>
          </View>

          {/* Non-Scrolling 4-Pill Direction Bar */}
          <View style={[styles.directionBarRow, { flexDirection: rowDir }]}>
            {directionOptions.map((opt) => {
              const active = direction === opt.id;
              return (
                <AdaptivePressable
                  key={opt.id}
                  style={[
                    styles.directionChip,
                    active && styles.directionChipActive,
                  ]}
                  onPress={() => {
                    triggerHaptic('selection');
                    setDirection(opt.id);
                  }}
                >
                  <Text
                    style={[
                      styles.directionChipText,
                      active && styles.directionChipTextActive,
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.82}
                  >
                    {opt.label}
                  </Text>
                </AdaptivePressable>
              );
            })}
          </View>

          {/* Segmented Control: iOS Native UISegmentedControl / Android M3 Expressive Connected Pill Buttons */}
          <View style={styles.segmentedWrapper}>
            {IS_ANDROID ? (
              <M3ExpressiveSegmentedControl
                values={segmentedValues}
                selectedIndex={segmentedSelectedIndex}
                onSelect={handleTimeModeChange}
              />
            ) : (
              <NativeSegmentedControl
                values={segmentedValues}
                selectedIndex={segmentedSelectedIndex}
                onChange={(event: {
                  nativeEvent: { selectedSegmentIndex: number };
                }) => {
                  handleTimeModeChange(event.nativeEvent.selectedSegmentIndex);
                }}
                appearance="dark"
                tintColor="#0A84FF"
                fontStyle={{ color: '#E2E8F0', fontSize: 12, fontWeight: '600' }}
                activeFontStyle={{
                  color: '#FFFFFF',
                  fontSize: 12,
                  fontWeight: '700',
                }}
                style={{ height: 32 }}
              />
            )}
          </View>

          {timeMode !== 'now' && (
            <View style={[styles.timePickerRow, { flexDirection: rowDir }]}>
              <View
                style={[styles.timePickerLabelGroup, { flexDirection: rowDir }]}
              >
                <Ionicons name="calendar-outline" size={16} color="#64D2FF" />
                <Text style={styles.timePickerLabel}>
                  {timeMode === 'depart_at' ? t.modeDepartAt : t.modeArriveBy}:
                </Text>
              </View>

              {Platform.OS === 'ios' ? (
                <DateTimePicker
                  value={targetDate}
                  mode="datetime"
                  display="compact"
                  themeVariant="dark"
                  onChange={handleTimePickerChange}
                />
              ) : (
                <View
                  style={[styles.androidDateTimeRow, { flexDirection: rowDir }]}
                >
                  <TouchableOpacity
                    style={styles.androidTimeButton}
                    onPress={() => {
                      setAndroidPickerMode('date');
                      setShowTimePicker(true);
                    }}
                  >
                    <Text style={styles.androidTimeButtonText}>
                      {targetDate.toLocaleDateString(
                        lang === 'he' ? 'he-IL' : 'en-US',
                        {
                          weekday: 'short',
                          day: '2-digit',
                          month: '2-digit',
                        }
                      )}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.androidTimeButton}
                    onPress={() => {
                      setAndroidPickerMode('time');
                      setShowTimePicker(true);
                    }}
                  >
                    <Text style={styles.androidTimeButtonText}>
                      {formattedTargetTime}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {Platform.OS === 'android' && showTimePicker && (
            <DateTimePicker
              value={targetDate}
              mode={androidPickerMode}
              is24Hour={true}
              display="default"
              onChange={handleTimePickerChange}
            />
          )}
        </AdaptiveSurface>

        {/* Live Get-Off Alert Floating Banner */}
        {activeAlertBanner && (
          <AdaptiveSurface
            intensity={80}
            tonalLevel="high"
            style={[
              styles.getOffAlertCard,
              activeAlertBanner.level === 'prepare' &&
                styles.getOffAlertPrepare,
              activeAlertBanner.level === 'get_off' && styles.getOffAlertNow,
              activeAlertBanner.level === 'done' && styles.getOffAlertDone,
            ]}
          >
            <Text style={[styles.getOffAlertTitle, { textAlign }]}>
              {activeAlertBanner.title}
            </Text>
            <Text style={[styles.getOffAlertBody, { textAlign }]}>
              {activeAlertBanner.body}
            </Text>
          </AdaptiveSurface>
        )}
      </SafeAreaView>

      {/* 3. Interactive Collapsible / Draggable Bottom Sheet (iOS Liquid Glass / Android M3 Expressive Sheet) */}
      <Animated.View
        style={[styles.bottomSheetContainer, { height: sheetHeightAnim }]}
      >
        <AdaptiveSurface intensity={75} tonalLevel="low" style={styles.bottomSheetGlass}>
          {/* Draggable & Tappable Grabber Zone */}
          <View {...panResponder.panHandlers} style={styles.grabberTouchArea}>
            <View style={styles.sheetGrabber} />
            <TouchableOpacity
              style={styles.collapseChevronBtn}
              onPress={cycleSheetSnap}
              hitSlop={{ top: 10, bottom: 10, left: 15, right: 15 }}
            >
              <Ionicons
                name={
                  sheetSnap === 'collapsed' ? 'chevron-up' : 'chevron-down'
                }
                size={16}
                color="rgba(255,255,255,0.6)"
              />
            </TouchableOpacity>
          </View>

          {selectedJourney ? (
            /* ============================================================
               ACTIVE TRAVEL / JOURNEY DETAIL SCREEN + LIVE TRACKING
               ============================================================ */
            <View style={{ flex: 1 }}>
              <View
                style={[styles.journeyTopHeader, { flexDirection: rowDir }]}
              >
                <TouchableOpacity
                  style={[styles.backBtnPill, { flexDirection: rowDir }]}
                  onPress={() => {
                    stopAllTracking();
                    triggerHaptic('selection');
                    setSelectedJourney(null);
                  }}
                >
                  <Ionicons
                    name={isRTL ? 'chevron-forward' : 'chevron-back'}
                    size={16}
                    color="#64D2FF"
                  />
                  <Text style={styles.backBtnText}>{t.backToStations}</Text>
                </TouchableOpacity>

                <Text style={styles.journeyHeaderTitle}>
                  {t.activeJourneyTitle}
                </Text>

                <View style={styles.journeyTotalBadge}>
                  <Text style={styles.journeyTotalBadgeText}>
                    {selectedJourney.mode === 'bus' && selectedJourney.busOption
                      ? selectedJourney.busOption.totalMinutes
                      : selectedJourney.mode === 'scooter'
                      ? selectedJourney.recommendation.scooterMinutes
                      : selectedJourney.recommendation.walkMinutes}{' '}
                    {t.minUnit}
                  </Text>
                </View>
              </View>

              <ScrollView
                style={styles.cardsScroll}
                contentContainerStyle={styles.cardsScrollContent}
                showsVerticalScrollIndicator={false}
              >
                {/* Clean Single-Line Full-Width Liquid Glass Live Tracking Pill */}
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={
                    isTrackingRide ? stopAllTracking : handleStartLiveTracking
                  }
                  style={[
                    styles.liveTrackingFullBtn,
                    isTrackingRide && styles.liveTrackingFullBtnActive,
                    { flexDirection: rowDir },
                  ]}
                >
                  <View
                    style={[
                      styles.liveTrackingIconBadge,
                      isTrackingRide && styles.liveTrackingIconBadgeActive,
                    ]}
                  >
                    <Ionicons
                      name={isTrackingRide ? 'radio' : 'notifications'}
                      size={16}
                      color="#FFFFFF"
                    />
                  </View>
                  <Text
                    style={[styles.liveTrackingFullBtnText, { textAlign }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {isTrackingRide
                      ? t.stopLiveTrackingBtn
                      : t.startLiveTrackingBtn}
                  </Text>
                </TouchableOpacity>

                {isTrackingRide && (
                  <View
                    style={[
                      styles.trackingStatusStrip,
                      { flexDirection: rowDir },
                    ]}
                  >
                    <View style={styles.liveGreenPulseDot} />
                    <Text style={[styles.trackingStatusText, { textAlign }]}>
                      {selectedJourney.mode === 'bus' &&
                      selectedJourney.busOption &&
                      currentStopIndex >= 0
                        ? t.stopsRemainingLabel.replace(
                            '{s}',
                            String(
                              Math.max(
                                0,
                                selectedJourney.busOption.intermediateStops
                                  .length -
                                  1 -
                                  currentStopIndex
                              )
                            )
                          )
                        : t.trackingActiveBanner}
                    </Text>
                  </View>
                )}

                {selectedJourney.mode === 'bus' && selectedJourney.busOption ? (
                  (() => {
                    const bus = selectedJourney.busOption;
                    const rec = selectedJourney.recommendation;
                    const stName = isRTL
                      ? rec.station.name_he
                      : rec.station.name_en;
                    const origName = isRTL
                      ? bus.originStopNameHe
                      : bus.originStopNameEn;
                    const alightName = isRTL
                      ? bus.alightStopNameHe
                      : bus.alightStopNameEn;
                    const agencyName = isRTL
                      ? bus.agencyNameHe
                      : bus.agencyNameEn;
                    const entranceHint = isRTL
                      ? bus.entranceHintHe
                      : bus.entranceHintEn;
                    const urgencyInfo = formatUrgencyBadge(bus);

                    return (
                      <View style={styles.journeyCard}>
                        {timeMode === 'now' && !isTrackingRide && (
                          <View
                            style={[
                              styles.urgencyPill,
                              {
                                backgroundColor: urgencyInfo.bg,
                                borderColor: urgencyInfo.border,
                                alignSelf: isRTL ? 'flex-end' : 'flex-start',
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.urgencyPillText,
                                { color: urgencyInfo.text, fontSize: 12 },
                              ]}
                            >
                              {urgencyInfo.label}
                            </Text>
                          </View>
                        )}

                        {/* VERTICAL TIMELINE OF THE JOURNEY */}
                        <View style={styles.timelineWrapper}>
                          {/* STEP 1: Walk to Bus Stop */}
                          <View
                            style={[
                              styles.timelineStepRow,
                              { flexDirection: rowDir },
                            ]}
                          >
                            <View style={styles.timelineIconCol}>
                              <View
                                style={[
                                  styles.timelineCircle,
                                  {
                                    backgroundColor:
                                      currentStopIndex >= 0
                                        ? '#30D158'
                                        : '#0A84FF',
                                  },
                                ]}
                              >
                                <Ionicons
                                  name={
                                    currentStopIndex >= 0
                                      ? 'checkmark'
                                      : 'walk'
                                  }
                                  size={14}
                                  color="#FFFFFF"
                                />
                              </View>
                              <View
                                style={[
                                  styles.timelineConnector,
                                  currentStopIndex >= 0 && {
                                    backgroundColor: '#30D158',
                                  },
                                ]}
                              />
                            </View>

                            <View
                              style={[
                                styles.timelineBody,
                                {
                                  alignItems: isRTL ? 'flex-end' : 'flex-start',
                                },
                              ]}
                            >
                              <View
                                style={[
                                  styles.timelineTitleRow,
                                  { flexDirection: rowDir },
                                ]}
                              >
                                <Text
                                  style={[styles.timelineTitle, { textAlign }]}
                                >
                                  {t.step1WalkToBus}
                                </Text>
                                <Text style={styles.timelineTimeTag}>
                                  {bus.leaveHomeFormatted}
                                </Text>
                              </View>
                              <Text
                                style={[styles.timelineSubtitle, { textAlign }]}
                              >
                                {origName} ({t.stopCodeLabel}{' '}
                                {bus.originStopCode}) • {bus.walkToBusMeters}
                                {t.metersUnit} (~{bus.walkToBusMinutes}{' '}
                                {t.minUnit})
                              </Text>

                              <TouchableOpacity
                                style={[
                                  styles.inlineActionBtn,
                                  { flexDirection: rowDir },
                                ]}
                                onPress={() =>
                                  openDirectionsToCoords(
                                    bus.originStopLat,
                                    bus.originStopLon,
                                    origName,
                                    'walking'
                                  )
                                }
                              >
                                <Ionicons
                                  name="navigate"
                                  size={13}
                                  color="#FFFFFF"
                                />
                                <Text style={styles.inlineActionBtnText}>
                                  {t.startWalkingInMaps}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          </View>

                          {/* STEP 2: Board Feeder Bus + Live Stop-by-Stop Tracker */}
                          <View
                            style={[
                              styles.timelineStepRow,
                              { flexDirection: rowDir },
                            ]}
                          >
                            <View style={styles.timelineIconCol}>
                              <View
                                style={[
                                  styles.timelineCircle,
                                  { backgroundColor: '#0A84FF' },
                                ]}
                              >
                                <Ionicons
                                  name="bus"
                                  size={14}
                                  color="#FFFFFF"
                                />
                              </View>
                              <View style={styles.timelineConnector} />
                            </View>

                            <View
                              style={[
                                styles.timelineBody,
                                {
                                  alignItems: isRTL ? 'flex-end' : 'flex-start',
                                },
                              ]}
                            >
                              <View
                                style={[
                                  styles.timelineTitleRow,
                                  { flexDirection: rowDir },
                                ]}
                              >
                                <View style={styles.busNumPill}>
                                  <Text style={styles.busNumText}>
                                    {bus.lineName}
                                  </Text>
                                </View>
                                <Text
                                  style={[styles.timelineTitle, { textAlign }]}
                                >
                                  {t.step2WaitAndBoard
                                    .replace('{line}', bus.lineName)
                                    .replace('{agency}', agencyName)}
                                </Text>
                                <Text style={styles.timelineTimeTagHighlight}>
                                  {bus.etaFormatted}
                                </Text>
                              </View>

                              <Text
                                style={[styles.timelineSubtitle, { textAlign }]}
                              >
                                {t.step3RideStops
                                  .replace('{m}', String(bus.rideMinutes))
                                  .replace(
                                    '{s}',
                                    String(bus.intermediateStops.length)
                                  )}
                              </Text>

                              {bus.intermediateStops.length > 1 && (
                                <TouchableOpacity
                                  style={[
                                    styles.toggleStopsBtn,
                                    { flexDirection: rowDir },
                                  ]}
                                  onPress={() => {
                                    triggerHaptic('selection');
                                    setShowIntermediateStops((prev) => !prev);
                                  }}
                                >
                                  <Ionicons
                                    name={
                                      showIntermediateStops
                                        ? 'chevron-up'
                                        : 'chevron-down'
                                    }
                                    size={14}
                                    color="#64D2FF"
                                  />
                                  <Text style={styles.toggleStopsBtnText}>
                                    {showIntermediateStops
                                      ? t.hideStopsCount
                                      : t.showStopsCount.replace(
                                          '{s}',
                                          String(bus.intermediateStops.length)
                                        )}
                                  </Text>
                                </TouchableOpacity>
                              )}

                              {showIntermediateStops && (
                                <View style={styles.intermediateListBox}>
                                  {bus.intermediateStops.map((istop, sIdx) => {
                                    const isLast =
                                      sIdx ===
                                      bus.intermediateStops.length - 1;
                                    const isPassed = sIdx < currentStopIndex;
                                    const isCurrent = sIdx === currentStopIndex;
                                    const isNext =
                                      isTrackingRide &&
                                      sIdx === currentStopIndex + 1;

                                    return (
                                      <View
                                        key={`${istop.stopId}_${sIdx}`}
                                        style={[
                                          styles.intermediateStopRow,
                                          isCurrent &&
                                            styles.intermediateStopRowCurrent,
                                          { flexDirection: rowDir },
                                        ]}
                                      >
                                        <View
                                          style={[
                                            styles.intermediateBullet,
                                            isPassed &&
                                              styles.intermediateBulletPassed,
                                            isCurrent &&
                                              styles.intermediateBulletCurrent,
                                            isLast &&
                                              styles.intermediateBulletLast,
                                          ]}
                                        />
                                        <Text
                                          style={[
                                            styles.intermediateStopName,
                                            isPassed &&
                                              styles.intermediateStopNamePassed,
                                            isCurrent &&
                                              styles.intermediateStopNameCurrent,
                                            isLast &&
                                              styles.intermediateStopNameLast,
                                            { textAlign },
                                          ]}
                                        >
                                          {isRTL ? istop.nameHe : istop.nameEn}
                                        </Text>

                                        {isLast ? (
                                          <View style={styles.getOffHereBadge}>
                                            <Text
                                              style={styles.getOffHereBadgeText}
                                            >
                                              {t.getOffHereBadge}
                                            </Text>
                                          </View>
                                        ) : isCurrent ? (
                                          <Text
                                            style={styles.liveStopStatusTag}
                                          >
                                            🚌 {t.now}
                                          </Text>
                                        ) : isNext ? (
                                          <Text
                                            style={styles.nextStopStatusTag}
                                          >
                                            {t.nextStopStatus}
                                          </Text>
                                        ) : (
                                          <Text
                                            style={styles.intermediateMinText}
                                          >
                                            +{istop.minutesFromBoarding}{' '}
                                            {t.minUnit}
                                          </Text>
                                        )}
                                      </View>
                                    );
                                  })}
                                </View>
                              )}
                            </View>
                          </View>

                          {/* STEP 3: Alight at Stop & Walk to Dankal Entrance */}
                          <View
                            style={[
                              styles.timelineStepRow,
                              { flexDirection: rowDir },
                            ]}
                          >
                            <View style={styles.timelineIconCol}>
                              <View
                                style={[
                                  styles.timelineCircle,
                                  { backgroundColor: '#30D158' },
                                ]}
                              >
                                <Ionicons
                                  name="exit-outline"
                                  size={14}
                                  color="#FFFFFF"
                                />
                              </View>
                              <View style={styles.timelineConnector} />
                            </View>

                            <View
                              style={[
                                styles.timelineBody,
                                {
                                  alignItems: isRTL ? 'flex-end' : 'flex-start',
                                },
                              ]}
                            >
                              <Text
                                style={[styles.timelineTitle, { textAlign }]}
                              >
                                {t.step4AlightAndWalk.replace(
                                  '{stop}',
                                  alightName
                                )}
                              </Text>
                              <Text
                                style={[styles.timelineSubtitle, { textAlign }]}
                              >
                                {bus.walkFromBusMeters}
                                {t.metersUnit} (~{bus.walkFromBusMinutes}{' '}
                                {t.minUnit})
                                {entranceHint ? ` • ${entranceHint}` : ''}
                              </Text>
                            </View>
                          </View>

                          {/* STEP 4: Reach Dankal Red Line Platform */}
                          <View
                            style={[
                              styles.timelineStepRow,
                              { flexDirection: rowDir },
                            ]}
                          >
                            <View style={styles.timelineIconCol}>
                              <View
                                style={[
                                  styles.timelineCircle,
                                  { backgroundColor: '#FF453A' },
                                ]}
                              >
                                <Ionicons
                                  name="train"
                                  size={14}
                                  color="#FFFFFF"
                                />
                              </View>
                            </View>

                            <View
                              style={[
                                styles.timelineBody,
                                {
                                  alignItems: isRTL ? 'flex-end' : 'flex-start',
                                },
                              ]}
                            >
                              <View
                                style={[
                                  styles.timelineTitleRow,
                                  { flexDirection: rowDir },
                                ]}
                              >
                                <Text
                                  style={[styles.timelineTitle, { textAlign }]}
                                >
                                  {t.step5BoardDankal.replace(
                                    '{station}',
                                    stName
                                  )}
                                </Text>
                                <Text style={styles.timelineTimeTagGreen}>
                                  {bus.arriveStationFormatted}
                                </Text>
                              </View>

                              <View
                                style={[
                                  styles.linesRow,
                                  { flexDirection: rowDir, marginTop: 4 },
                                ]}
                              >
                                {rec.station.lines.map((line) => (
                                  <View key={line} style={styles.redLineChip}>
                                    <Text style={styles.redLineChipText}>
                                      {line}
                                    </Text>
                                  </View>
                                ))}
                                <Text style={styles.stationSubMeta}>
                                  {t.dankalFreq}
                                </Text>
                              </View>
                            </View>
                          </View>
                        </View>
                      </View>
                    );
                  })()
                ) : (
                  <View style={styles.journeyCard}>
                    <Text style={[styles.timelineTitle, { textAlign }]}>
                      {selectedJourney.mode === 'scooter'
                        ? `🛴 ${t.scooterBike}`
                        : `🚶 ${t.walkDirect}`}{' '}
                      ←{' '}
                      {isRTL
                        ? selectedJourney.recommendation.station.name_he
                        : selectedJourney.recommendation.station.name_en}
                    </Text>
                    <Text style={[styles.timelineSubtitle, { textAlign }]}>
                      ~{selectedJourney.recommendation.walkMeters}
                      {t.metersUnit} • {t.arrivePlatformAt}
                      {selectedJourney.recommendation.walkArriveFormatted}
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.inlineActionBtn,
                        { flexDirection: rowDir, marginTop: 8 },
                      ]}
                      onPress={() =>
                        openDirectionsToCoords(
                          selectedJourney.recommendation.station.lat,
                          selectedJourney.recommendation.station.lon,
                          isRTL
                            ? selectedJourney.recommendation.station.name_he
                            : selectedJourney.recommendation.station.name_en,
                          'walking'
                        )
                      }
                    >
                      <Ionicons name="navigate" size={14} color="#FFFFFF" />
                      <Text style={styles.inlineActionBtnText}>
                        {t.navigateToStationMaps}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>
            </View>
          ) : (
            /* ============================================================
               DEFAULT K-STATIONS COMPARISON LIST
               ============================================================ */
            <View style={{ flex: 1 }}>
              <View style={[styles.sheetHeaderRow, { flexDirection: rowDir }]}>
                <View style={[styles.kGroup, { flexDirection: rowDir }]}>
                  <Text style={styles.kTitle}>{t.kStationsLabel}</Text>
                  {[2, 3, 4, 5].map((num) => (
                    <TouchableOpacity
                      key={num}
                      style={[styles.kChip, k === num && styles.kChipActive]}
                      onPress={() => {
                        triggerHaptic('selection');
                        setK(num);
                      }}
                    >
                      <Text
                        style={[
                          styles.kChipText,
                          k === num && styles.kChipTextActive,
                        ]}
                      >
                        {num}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={styles.iconRefreshBtn}
                  onPress={() => {
                    triggerHaptic('light');
                    fetchRoutes(
                      activeOrigin.lat,
                      activeOrigin.lon,
                      k,
                      timeMode,
                      targetDate,
                      direction
                    );
                  }}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#64D2FF" />
                  ) : (
                    <Ionicons name="refresh" size={16} color="#F8FAFC" />
                  )}
                </TouchableOpacity>
              </View>

              {gpsError ? (
                <Text style={[styles.errorText, { textAlign }]}>
                  {gpsError}
                </Text>
              ) : null}

              <ScrollView
                style={styles.cardsScroll}
                contentContainerStyle={styles.cardsScrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    tintColor="#64D2FF"
                    onRefresh={() => {
                      triggerHaptic('light');
                      setRefreshing(true);
                      fetchRoutes(
                        activeOrigin.lat,
                        activeOrigin.lon,
                        k,
                        timeMode,
                        targetDate,
                        direction
                      );
                    }}
                  />
                }
              >
                {/* Out-of-Service Area Banner (e.g., user is outside Gush Dan) */}
                {isOutOfServiceArea && (
                  <View style={styles.noticeBannerWarn}>
                    <Text style={[styles.noticeBannerTitle, { textAlign }]}>
                      📍 {t.outOfServiceTitle}
                    </Text>
                    <Text style={[styles.noticeBannerBody, { textAlign }]}>
                      {t.outOfServiceBody}
                    </Text>
                  </View>
                )}

                {/* Shabbat Notice Banner (Friday afternoon -> Saturday night) */}
                {isShabbatNow && (
                  <View style={styles.noticeBannerInfo}>
                    <Text style={[styles.noticeBannerTitle, { textAlign }]}>
                      🕯️ {t.shabbatNoticeTitle}
                    </Text>
                    <Text style={[styles.noticeBannerBody, { textAlign }]}>
                      {t.shabbatNoticeBody}
                    </Text>
                  </View>
                )}
                {sortedRecommendations.map((rec, idx) => {
                  const isFastest = rec.station.id === overallFastestStationId;
                  const isSelected = rec.station.id === selectedStationId;
                  const stName = isRTL
                    ? rec.station.name_he
                    : rec.station.name_en;
                  const cityName = isRTL
                    ? rec.station.city_he
                    : rec.station.city_en;

                  return (
                    <TouchableOpacity
                      key={rec.station.id}
                      activeOpacity={0.92}
                      onPress={() => {
                        triggerHaptic('selection');
                        setSelectedStationId(rec.station.id);
                        fitMapToStations(
                          activeOrigin.lat,
                          activeOrigin.lon,
                          recommendations,
                          { lat: rec.station.lat, lon: rec.station.lon }
                        );
                      }}
                      style={[
                        styles.stationCard,
                        isSelected && styles.stationCardSelected,
                        isFastest && styles.stationCardFastest,
                      ]}
                    >
                      <View
                        style={[
                          styles.cardHeaderRow,
                          { flexDirection: rowDir },
                        ]}
                      >
                        <View
                          style={{
                            flex: 1,
                            alignItems: isRTL ? 'flex-end' : 'flex-start',
                          }}
                        >
                          <View
                            style={[
                              styles.titleAndBadgeRow,
                              { flexDirection: rowDir },
                            ]}
                          >
                            <View style={styles.rankBadge}>
                              <Text style={styles.rankBadgeText}>
                                {idx + 1}
                              </Text>
                            </View>
                            <Text
                              style={[styles.stationNameText, { textAlign }]}
                            >
                              {stName}
                            </Text>
                            {isFastest && (
                              <View style={styles.fastestPill}>
                                <Text style={styles.fastestPillText}>
                                  ⚡ {t.fastestOption}
                                </Text>
                              </View>
                            )}
                          </View>

                          <Text style={[styles.stationSubMeta, { textAlign }]}>
                            {cityName} •{' '}
                            {rec.station.is_underground
                              ? `${t.underground} (+2.5')`
                              : t.surface}{' '}
                            • {rec.aerialMeters}
                            {t.metersUnit} • {t.dankalFreq}
                          </Text>
                        </View>

                        <View
                          style={[styles.linesRow, { flexDirection: rowDir }]}
                        >
                          {rec.station.lines.map((line) => (
                            <View key={line} style={styles.redLineChip}>
                              <Text style={styles.redLineChipText}>{line}</Text>
                            </View>
                          ))}
                        </View>
                      </View>

                      <View style={[styles.modesBar, { flexDirection: rowDir }]}>
                        <TouchableOpacity
                          style={[
                            styles.modeChip,
                            rec.bestMode === 'walk' && styles.modeChipBest,
                            { flexDirection: rowDir },
                          ]}
                          onPress={() => handleSelectJourney(rec, 'walk')}
                        >
                          <Ionicons name="walk" size={16} color="#30D158" />
                          <Text style={styles.modeChipText}>
                            {t.walkDirect}:{' '}
                            <Text style={styles.modeChipBold}>
                              {rec.walkMinutes} {t.minUnit}
                            </Text>{' '}
                            ({rec.walkArriveFormatted})
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.modeChip, { flexDirection: rowDir }]}
                          onPress={() => handleSelectJourney(rec, 'scooter')}
                        >
                          <Ionicons name="bicycle" size={16} color="#64D2FF" />
                          <Text style={styles.modeChipText}>
                            <Text style={styles.modeChipBold}>
                              {rec.scooterMinutes} {t.minUnit}
                            </Text>
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {rec.liveBusOptions.length === 0 ? (
                        <View style={styles.emptyBusBox}>
                          <Text style={[styles.emptyBusText, { textAlign }]}>
                            {t.noDirectBusesNow}
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.busListContainer}>
                          {rec.liveBusOptions.map(
                            (bus: LiveBusOption, bIdx: number) => {
                              const urgencyInfo = formatUrgencyBadge(bus);
                              const entranceHint = isRTL
                                ? bus.entranceHintHe
                                : bus.entranceHintEn;

                              return (
                                <TouchableOpacity
                                  key={bus.id}
                                  activeOpacity={0.78}
                                  onPress={() =>
                                    handleSelectJourney(rec, 'bus', bus)
                                  }
                                  style={[
                                    styles.busRowCard,
                                    bIdx === 0 && styles.busRowCardPrimary,
                                  ]}
                                >
                                  <View
                                    style={[
                                      styles.busRowHeader,
                                      { flexDirection: rowDir },
                                    ]}
                                  >
                                    <View
                                      style={[
                                        styles.busBadgeAndTiming,
                                        { flexDirection: rowDir },
                                      ]}
                                    >
                                      <View style={styles.busNumPill}>
                                        <Ionicons
                                          name="bus"
                                          size={13}
                                          color="#FFFFFF"
                                        />
                                        <Text style={styles.busNumText}>
                                          {bus.lineName}
                                        </Text>
                                      </View>

                                      <View
                                        style={{
                                          flex: 1,
                                          alignItems: isRTL
                                            ? 'flex-end'
                                            : 'flex-start',
                                        }}
                                      >
                                        <View
                                          style={[
                                            styles.etaLineRow,
                                            { flexDirection: rowDir },
                                          ]}
                                        >
                                          <View
                                            style={[
                                              styles.statusBadge,
                                              bus.isRealtime
                                                ? styles.statusBadgeLive
                                                : styles.statusBadgeSched,
                                            ]}
                                          >
                                            <Text
                                              style={[
                                                styles.statusBadgeText,
                                                bus.isRealtime
                                                  ? styles.statusTextLive
                                                  : styles.statusTextSched,
                                              ]}
                                            >
                                              {bus.isRealtime
                                                ? `● ${t.liveBadge}`
                                                : t.scheduledBadge}
                                            </Text>
                                          </View>

                                          <Text
                                            style={styles.busTimingHeadline}
                                          >
                                            {timeMode === 'now'
                                              ? bus.waitMinutes <= 0
                                                ? `${t.now} (${bus.etaFormatted})`
                                                : `${t.arrivesIn} ${bus.waitMinutes} ${t.minUnit} (${bus.etaFormatted})`
                                              : `${t.leaveAt}${bus.leaveHomeFormatted} · ${t.boardLine} ${bus.etaFormatted}`}
                                          </Text>
                                        </View>

                                        <Text style={styles.busSubTimeline}>
                                          {isRTL
                                            ? bus.agencyNameHe
                                            : bus.agencyNameEn}{' '}
                                          • {t.arrivePlatformAt}
                                          <Text
                                            style={styles.busSubTimelineBold}
                                          >
                                            {bus.arriveStationFormatted}
                                          </Text>
                                        </Text>
                                      </View>
                                    </View>

                                    <View style={styles.totalDurationBox}>
                                      <Text style={styles.totalDurationNum}>
                                        {bus.totalMinutes}
                                      </Text>
                                      <Text style={styles.totalDurationUnit}>
                                        {t.minUnit}
                                      </Text>
                                    </View>
                                  </View>

                                  {timeMode === 'now' && (
                                    <View
                                      style={[
                                        styles.urgencyRow,
                                        { flexDirection: rowDir },
                                      ]}
                                    >
                                      <View
                                        style={[
                                          styles.urgencyPill,
                                          {
                                            backgroundColor: urgencyInfo.bg,
                                            borderColor: urgencyInfo.border,
                                          },
                                        ]}
                                      >
                                        <Text
                                          style={[
                                            styles.urgencyPillText,
                                            { color: urgencyInfo.text },
                                          ]}
                                        >
                                          {urgencyInfo.label}
                                        </Text>
                                      </View>

                                      {bus.nextBackupBusMinutesLater !== null &&
                                        bus.nextBackupBusLine && (
                                          <Text style={styles.backupBusText}>
                                            {t.backupBusHint
                                              .replace(
                                                '{line}',
                                                bus.nextBackupBusLine
                                              )
                                              .replace(
                                                '{m}',
                                                String(
                                                  bus.nextBackupBusMinutesLater
                                                )
                                              )}
                                          </Text>
                                        )}
                                    </View>
                                  )}

                                  <View
                                    style={[
                                      styles.breadcrumbBar,
                                      { flexDirection: rowDir },
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.breadcrumbStep,
                                        { textAlign },
                                      ]}
                                      numberOfLines={1}
                                    >
                                      🚶 {bus.walkToBusMeters}
                                      {t.metersUnit} (
                                      {isRTL
                                        ? bus.originStopNameHe
                                        : bus.originStopNameEn}
                                      )
                                    </Text>
                                    <Text style={styles.breadcrumbArrow}>
                                      {isRTL ? '←' : '→'}
                                    </Text>
                                    <Text
                                      style={[
                                        styles.breadcrumbStep,
                                        { textAlign },
                                      ]}
                                      numberOfLines={1}
                                    >
                                      🚌 {bus.rideMinutes} {t.minUnit} (
                                      {isRTL
                                        ? bus.alightStopNameHe
                                        : bus.alightStopNameEn}
                                      )
                                    </Text>
                                    <Text style={styles.breadcrumbArrow}>
                                      {isRTL ? '←' : '→'}
                                    </Text>
                                    <Text style={styles.breadcrumbStepEnd}>
                                      🚇 {bus.walkFromBusMeters}
                                      {t.metersUnit}
                                      {entranceHint ? ` · ${entranceHint}` : ''}
                                    </Text>
                                  </View>

                                  <Text
                                    style={[
                                      styles.tapForTravelHint,
                                      { textAlign },
                                    ]}
                                  >
                                    {t.tapForTravelScreen}
                                  </Text>
                                </TouchableOpacity>
                              );
                            }
                          )}
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}

                <Text style={styles.footerInfo}>
                  {t.dataSourceFooter}
                  {lastUpdatedMs > 0
                    ? ` • ${
                        secondsSinceUpdate < 5
                          ? t.updatedJustNow
                          : t.updatedSecondsAgo.replace(
                              '{s}',
                              String(secondsSinceUpdate)
                            )
                      }`
                    : ''}
                </Text>
              </ScrollView>
            </View>
          )}
        </AdaptiveSurface>
      </Animated.View>

      {/* 4. Native iOS PageSheet Modal for Picking Origin (Current GPS + Free Search + Presets) */}
      <Modal
        visible={showOriginSheet}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowOriginSheet(false)}
      >
        <View style={styles.modalContainer}>
          <View style={[styles.modalHeader, { flexDirection: rowDir }]}>
            <Text style={styles.modalTitle}>{t.changeOrigin}</Text>
            <TouchableOpacity
              onPress={() => {
                setShowOriginSheet(false);
                setOriginSearchQuery('');
              }}
              style={styles.modalDoneBtn}
            >
              <Text style={styles.modalDoneText}>{t.done}</Text>
            </TouchableOpacity>
          </View>

          {/* Free Text Search Bar */}
          <View style={styles.searchBarWrapper}>
            <View style={[styles.searchInputBox, { flexDirection: rowDir }]}>
              <Ionicons
                name="search"
                size={18}
                color="rgba(255, 255, 255, 0.55)"
              />
              <TextInput
                style={[styles.searchTextInput, { textAlign }]}
                value={originSearchQuery}
                onChangeText={setOriginSearchQuery}
                placeholder={t.searchOriginPlaceholder}
                placeholderTextColor="rgba(255, 255, 255, 0.42)"
                autoCorrect={false}
                returnKeyType="search"
                clearButtonMode="never"
              />
              {originSearchQuery.length > 0 && (
                <TouchableOpacity
                  onPress={() => setOriginSearchQuery('')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name="close-circle"
                    size={18}
                    color="rgba(255, 255, 255, 0.5)"
                  />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <ScrollView
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Current GPS Location Button */}
            <TouchableOpacity
              style={[styles.modalGpsCard, { flexDirection: rowDir }]}
              onPress={() => handleUseMyGps(false)}
              disabled={locatingGps}
            >
              {locatingGps ? (
                <ActivityIndicator size="small" color="#64D2FF" />
              ) : (
                <Ionicons name="navigate-circle" size={26} color="#0A84FF" />
              )}
              <View
                style={{
                  flex: 1,
                  alignItems: isRTL ? 'flex-end' : 'flex-start',
                }}
              >
                <Text style={styles.modalGpsTitle}>
                  {locatingGps ? t.locatingGps : t.useMyGps}
                </Text>
                <Text style={styles.modalGpsSub}>
                  {activeOrigin.isGps
                    ? isRTL
                      ? activeOrigin.name_he
                      : activeOrigin.name_en
                    : `${activeOrigin.lat.toFixed(4)}, ${activeOrigin.lon.toFixed(4)}`}
                </Text>
              </View>
              {activeOrigin.isGps && !locatingGps && (
                <Ionicons name="checkmark-circle" size={22} color="#30D158" />
              )}
            </TouchableOpacity>

            {originSearchQuery.trim().length >= 2 ? (
              /* Search Results View */
              <View style={{ gap: 10 }}>
                {/* 1. Matching Addresses & Places (Photon / OS Geocoder) */}
                {(searchingAddresses || addressSearchResults.length > 0) && (
                  <>
                    <Text style={[styles.modalSectionHeader, { textAlign }]}>
                      {t.addressesSection}
                    </Text>
                    {searchingAddresses && addressSearchResults.length === 0 ? (
                      <View
                        style={[
                          styles.searchingRow,
                          { flexDirection: rowDir },
                        ]}
                      >
                        <ActivityIndicator size="small" color="#64D2FF" />
                        <Text style={styles.searchingText}>
                          {t.searchingPlaces}
                        </Text>
                      </View>
                    ) : (
                      addressSearchResults.map((res) => (
                        <TouchableOpacity
                          key={res.id}
                          style={[
                            styles.modalPresetRow,
                            { flexDirection: rowDir },
                          ]}
                          onPress={() => handleSelectSearchResult(res)}
                        >
                          <Ionicons
                            name="location"
                            size={20}
                            color="#64D2FF"
                          />
                          <View
                            style={{
                              flex: 1,
                              alignItems: isRTL ? 'flex-end' : 'flex-start',
                            }}
                          >
                            <Text
                              style={[styles.modalPresetText, { textAlign }]}
                            >
                              {isRTL ? res.name_he : res.name_en}
                            </Text>
                            <Text
                              style={[styles.searchResultSub, { textAlign }]}
                            >
                              {isRTL ? res.subtitle_he : res.subtitle_en}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      ))
                    )}
                  </>
                )}

                {/* 2. Instant Offline Matching Bus Stops (4,225 Gush Dan Stops) */}
                {localStopResults.length > 0 && (
                  <>
                    <Text style={[styles.modalSectionHeader, { textAlign }]}>
                      {t.busStopsSection}
                    </Text>
                    {localStopResults.map((res) => (
                      <TouchableOpacity
                        key={res.id}
                        style={[
                          styles.modalPresetRow,
                          { flexDirection: rowDir },
                        ]}
                        onPress={() => handleSelectSearchResult(res)}
                      >
                        <Ionicons name="bus" size={19} color="#0A84FF" />
                        <View
                          style={{
                            flex: 1,
                            alignItems: isRTL ? 'flex-end' : 'flex-start',
                          }}
                        >
                          <Text
                            style={[styles.modalPresetText, { textAlign }]}
                          >
                            {isRTL ? res.name_he : res.name_en}
                          </Text>
                          <Text
                            style={[styles.searchResultSub, { textAlign }]}
                          >
                            {isRTL ? res.subtitle_he : res.subtitle_en}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </>
                )}

                {!searchingAddresses &&
                  addressSearchResults.length === 0 &&
                  localStopResults.length === 0 && (
                    <Text style={[styles.noResultsText, { textAlign }]}>
                      {t.noSearchResults}
                    </Text>
                  )}
              </View>
            ) : (
              /* Default Presets + Saved Places (Home / Work) + Map Long-Press Hint */
              <>
                {/* Saved Places (Home / Work) 1-Tap Section */}
                <Text style={[styles.modalSectionHeader, { textAlign }]}>
                  {t.savedPlacesSection}
                </Text>
                <View style={[styles.savedPlacesRow, { flexDirection: rowDir }]}>
                  <TouchableOpacity
                    style={[
                      styles.savedPlaceCard,
                      savedPlaces.home && styles.savedPlaceCardFilled,
                      { flexDirection: rowDir },
                    ]}
                    onPress={() =>
                      savedPlaces.home
                        ? handleSelectSavedPlace(savedPlaces.home)
                        : handleSaveCurrentPlace('home')
                    }
                    onLongPress={() => handleSaveCurrentPlace('home')}
                  >
                    <Ionicons
                      name="home"
                      size={18}
                      color={savedPlaces.home ? '#30D158' : '#94A3B8'}
                    />
                    <View
                      style={{
                        flex: 1,
                        alignItems: isRTL ? 'flex-end' : 'flex-start',
                      }}
                    >
                      <Text style={styles.savedPlaceTitle}>{t.homeLabel}</Text>
                      <Text
                        style={[styles.savedPlaceSub, { textAlign }]}
                        numberOfLines={1}
                      >
                        {savedPlaces.home
                          ? isRTL
                            ? savedPlaces.home.name_he
                            : savedPlaces.home.name_en
                          : t.saveCurrentAsHome}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.savedPlaceCard,
                      savedPlaces.work && styles.savedPlaceCardFilled,
                      { flexDirection: rowDir },
                    ]}
                    onPress={() =>
                      savedPlaces.work
                        ? handleSelectSavedPlace(savedPlaces.work)
                        : handleSaveCurrentPlace('work')
                    }
                    onLongPress={() => handleSaveCurrentPlace('work')}
                  >
                    <Ionicons
                      name="briefcase"
                      size={18}
                      color={savedPlaces.work ? '#64D2FF' : '#94A3B8'}
                    />
                    <View
                      style={{
                        flex: 1,
                        alignItems: isRTL ? 'flex-end' : 'flex-start',
                      }}
                    >
                      <Text style={styles.savedPlaceTitle}>{t.workLabel}</Text>
                      <Text
                        style={[styles.savedPlaceSub, { textAlign }]}
                        numberOfLines={1}
                      >
                        {savedPlaces.work
                          ? isRTL
                            ? savedPlaces.work.name_he
                            : savedPlaces.work.name_en
                          : t.saveCurrentAsWork}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>

                <View style={[styles.mapHintPill, { flexDirection: rowDir }]}>
                  <Ionicons
                    name="hand-left-outline"
                    size={15}
                    color="#64D2FF"
                  />
                  <Text style={[styles.mapHintText, { textAlign }]}>
                    {t.mapLongPressHint}
                  </Text>
                </View>

                <Text style={[styles.modalSectionHeader, { textAlign }]}>
                  {t.presetLocations}
                </Text>

                {PRESET_ORIGINS.map((preset) => {
                  const selected =
                    !activeOrigin.isGps && activeOrigin.id === preset.id;
                  return (
                    <TouchableOpacity
                      key={preset.id}
                      style={[
                        styles.modalPresetRow,
                        selected && styles.modalPresetRowActive,
                        { flexDirection: rowDir },
                      ]}
                      onPress={() => handleSelectPreset(preset)}
                    >
                      <Ionicons
                        name="location-outline"
                        size={20}
                        color={selected ? '#64D2FF' : '#94A3B8'}
                      />
                      <Text
                        style={[
                          styles.modalPresetText,
                          selected && styles.modalPresetTextActive,
                          { textAlign },
                        ]}
                      >
                        {isRTL ? preset.name_he : preset.name_en}
                      </Text>
                      {selected && (
                        <Ionicons
                          name="checkmark-circle"
                          size={20}
                          color="#64D2FF"
                        />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  map: {
    ...StyleSheet.absoluteFill,
  },
  liquidGlassBase: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  liquidGlassFallback: {
    backgroundColor: 'rgba(18, 22, 32, 0.34)',
  },
  minorStationDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#FF453A',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  busStopPin: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#0A84FF',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveVehicleTrackerPin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#30D158',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.45,
    shadowRadius: 5,
  },
  intermediateStopDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#64D2FF',
    borderWidth: 1.5,
    borderColor: '#003B73',
  },
  intermediateStopDotPassed: {
    backgroundColor: '#30D158',
    borderColor: '#064E3B',
  },
  stationMapPin: {
    backgroundColor: 'rgba(18, 22, 32, 0.88)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    alignItems: 'center',
    gap: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
  stationMapPinFastest: {
    borderColor: '#30D158',
    backgroundColor: 'rgba(6, 55, 40, 0.90)',
  },
  stationMapPinSelected: {
    transform: [{ scale: 1.07 }],
    borderColor: '#64D2FF',
  },
  stationMapPinName: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  stationMapPinEtaPill: {
    backgroundColor: '#FF453A',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 8,
  },
  stationMapPinEtaPillFastest: {
    backgroundColor: '#30D158',
  },
  stationMapPinEtaText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  userOriginPulseOuter: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(10, 132, 255, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userOriginDot: {
    width: 13,
    height: 13,
    borderRadius: 6.5,
    backgroundColor: '#0A84FF',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
  },
  topFloatingSafe: {
    position: 'absolute',
    top: 0,
    left: 12,
    right: 12,
    paddingTop:
      Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 6 : 4,
    gap: 8,
  },
  topGlassCard: {
    borderRadius: IS_ANDROID ? 28 : 24,
    padding: 11,
    gap: 9,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
  },
  getOffAlertCard: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1.5,
    gap: 3,
  },
  getOffAlertPrepare: {
    backgroundColor: 'rgba(146, 64, 14, 0.78)',
    borderColor: '#F59E0B',
  },
  getOffAlertNow: {
    backgroundColor: 'rgba(153, 27, 27, 0.84)',
    borderColor: '#FF453A',
  },
  getOffAlertDone: {
    backgroundColor: 'rgba(6, 95, 70, 0.82)',
    borderColor: '#30D158',
  },
  getOffAlertTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  getOffAlertBody: {
    color: '#F1F5F9',
    fontSize: 12,
    fontWeight: '600',
  },
  topHeaderRow: {
    alignItems: 'center',
    gap: 8,
  },
  originSelectorBtn: {
    flex: 1,
    backgroundColor: IS_ANDROID
      ? THEME.surfaceContainerHighest
      : 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: IS_ANDROID ? 28 : 16,
    alignItems: 'center',
    gap: 8,
    borderWidth: IS_ANDROID ? 0 : 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    overflow: 'hidden',
  },
  originCaption: {
    color: THEME.onSurfaceVariant,
    fontSize: 10,
    fontWeight: '600',
  },
  originMainText: {
    color: THEME.onSurface,
    fontSize: 14,
    fontWeight: '700',
  },
  glassCircleIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: IS_ANDROID
      ? THEME.surfaceContainerHighest
      : 'rgba(255, 255, 255, 0.09)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: IS_ANDROID ? 0 : 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    overflow: 'hidden',
  },
  glassLangBtn: {
    height: 40,
    paddingHorizontal: 13,
    borderRadius: 20,
    backgroundColor: IS_ANDROID
      ? THEME.surfaceContainerHighest
      : 'rgba(255, 255, 255, 0.09)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: IS_ANDROID ? 0 : 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    overflow: 'hidden',
  },
  langPillText: {
    color: THEME.onSurface,
    fontSize: 12,
    fontWeight: '800',
  },
  directionBarRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 5,
  },
  directionChip: {
    flex: 1,
    backgroundColor: IS_ANDROID
      ? THEME.surfaceContainerLow
      : 'rgba(255, 255, 255, 0.07)',
    paddingHorizontal: 6,
    paddingVertical: IS_ANDROID ? 7 : 6,
    borderRadius: IS_ANDROID ? 16 : 12,
    borderWidth: 1,
    borderColor: IS_ANDROID
      ? THEME.outline
      : 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  directionChipActive: {
    backgroundColor: IS_ANDROID
      ? THEME.errorContainer
      : 'rgba(255, 69, 58, 0.78)',
    borderColor: IS_ANDROID ? THEME.error : 'rgba(255, 255, 255, 0.35)',
  },
  directionChipText: {
    color: IS_ANDROID
      ? THEME.onSurfaceVariant
      : 'rgba(255, 255, 255, 0.78)',
    fontSize: 10.5,
    fontWeight: '600',
    textAlign: 'center',
  },
  directionChipTextActive: {
    color: IS_ANDROID ? THEME.onErrorContainer : '#FFFFFF',
    fontWeight: '800',
  },
  segmentedWrapper: {
    marginTop: 1,
  },
  timePickerRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    paddingHorizontal: 4,
  },
  timePickerLabelGroup: {
    alignItems: 'center',
    gap: 6,
  },
  timePickerLabel: {
    color: '#F1F5F9',
    fontSize: 13,
    fontWeight: '700',
  },
  androidDateTimeRow: {
    alignItems: 'center',
    gap: 6,
  },
  androidTimeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#0A84FF',
  },
  androidTimeButtonText: {
    color: '#64D2FF',
    fontSize: 14,
    fontWeight: '800',
  },
  bottomSheetContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  bottomSheetGlass: {
    flex: 1,
    borderTopLeftRadius: THEME.sheetRadius,
    borderTopRightRadius: THEME.sheetRadius,
    borderWidth: 1,
    borderColor: THEME.outline,
  },
  grabberTouchArea: {
    paddingTop: IS_ANDROID ? 12 : 9,
    paddingBottom: IS_ANDROID ? 8 : 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetGrabber: {
    width: IS_ANDROID ? 32 : 40,
    height: IS_ANDROID ? 4 : 5,
    borderRadius: 2.5,
    backgroundColor: IS_ANDROID
      ? 'rgba(196, 198, 208, 0.45)'
      : 'rgba(255, 255, 255, 0.38)',
  },
  collapseChevronBtn: {
    position: 'absolute',
    right: 16,
    top: 5,
  },
  sheetHeaderRow: {
    paddingHorizontal: 14,
    paddingBottom: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.14)',
  },
  kGroup: {
    alignItems: 'center',
    gap: 5,
  },
  kTitle: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 12,
    fontWeight: '600',
    marginHorizontal: 2,
  },
  kChip: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  kChipActive: {
    backgroundColor: '#0A84FF',
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  kChipText: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 12,
    fontWeight: '700',
  },
  kChipTextActive: {
    color: '#FFFFFF',
  },
  rightControlsGroup: {
    alignItems: 'center',
    gap: 8,
  },
  sortChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 14,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  sortChipText: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '700',
  },
  iconRefreshBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  errorText: {
    color: '#FF453A',
    fontSize: 12,
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  cardsScroll: {
    flex: 1,
  },
  cardsScrollContent: {
    padding: 12,
    paddingBottom: 32,
    gap: 12,
  },
  stationCard: {
    backgroundColor: IS_ANDROID
      ? THEME.surfaceContainer
      : 'rgba(255, 255, 255, 0.06)',
    borderRadius: THEME.cardRadius,
    padding: 13,
    borderWidth: 1,
    borderColor: THEME.outlineVariant,
    gap: 10,
  },
  stationCardSelected: {
    borderColor: IS_ANDROID ? THEME.primary : 'rgba(100, 210, 255, 0.55)',
    backgroundColor: IS_ANDROID
      ? THEME.surfaceContainerHigh
      : 'rgba(255, 255, 255, 0.09)',
  },
  stationCardFastest: {
    borderColor: IS_ANDROID ? THEME.tertiary : 'rgba(48, 209, 88, 0.7)',
    borderWidth: 1.5,
  },
  cardHeaderRow: {
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  titleAndBadgeRow: {
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  rankBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  stationNameText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  fastestPill: {
    backgroundColor: 'rgba(48, 209, 88, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(48, 209, 88, 0.5)',
  },
  fastestPillText: {
    color: '#30D158',
    fontSize: 10,
    fontWeight: '800',
  },
  stationSubMeta: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 11,
    marginTop: 3,
  },
  linesRow: {
    gap: 4,
    alignItems: 'center',
  },
  redLineChip: {
    backgroundColor: '#FF453A',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
  },
  redLineChipText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  modesBar: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    flexWrap: 'wrap',
  },
  modeChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  modeChipBest: {
    borderColor: '#30D158',
  },
  modeChipText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 11,
  },
  modeChipBold: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  emptyBusBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: 9,
    borderRadius: 12,
  },
  emptyBusText: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: 11,
  },
  busListContainer: {
    gap: 8,
  },
  busRowCard: {
    backgroundColor: IS_ANDROID
      ? THEME.surfaceContainerHigh
      : 'rgba(255, 255, 255, 0.06)',
    borderRadius: THEME.innerCardRadius,
    padding: 10,
    borderWidth: 1,
    borderColor: THEME.outlineVariant,
    gap: 6,
  },
  busRowCardPrimary: {
    borderColor: IS_ANDROID ? THEME.primary : 'rgba(10, 132, 255, 0.55)',
    backgroundColor: IS_ANDROID
      ? THEME.secondaryContainer
      : 'rgba(10, 132, 255, 0.14)',
  },
  busRowHeader: {
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  busBadgeAndTiming: {
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  busNumPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: IS_ANDROID ? THEME.primaryContainer : '#0A84FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: IS_ANDROID ? 14 : 10,
  },
  busNumText: {
    color: IS_ANDROID ? THEME.onPrimaryContainer : '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  etaLineRow: {
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  statusBadgeLive: {
    backgroundColor: 'rgba(48, 209, 88, 0.22)',
  },
  statusBadgeSched: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  statusTextLive: {
    color: '#30D158',
  },
  statusTextSched: {
    color: '#E2E8F0',
  },
  busTimingHeadline: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  busSubTimeline: {
    color: 'rgba(255, 255, 255, 0.62)',
    fontSize: 11,
    marginTop: 1,
  },
  busSubTimelineBold: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  totalDurationBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 11,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  totalDurationNum: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  totalDurationUnit: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 9,
    fontWeight: '600',
  },
  urgencyRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    flexWrap: 'wrap',
  },
  urgencyPill: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 7,
    borderWidth: 1,
  },
  urgencyPillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  backupBusText: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 10,
    fontWeight: '600',
  },
  breadcrumbBar: {
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    gap: 4,
  },
  breadcrumbStep: {
    flex: 1,
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 10,
  },
  breadcrumbStepEnd: {
    color: '#64D2FF',
    fontSize: 10,
    fontWeight: '700',
  },
  breadcrumbArrow: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 11,
    fontWeight: '700',
  },
  tapForTravelHint: {
    color: '#64D2FF',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  /* Travel / Active Journey Screen Styles */
  journeyTopHeader: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.14)',
  },
  backBtnPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 14,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  backBtnText: {
    color: '#64D2FF',
    fontSize: 12,
    fontWeight: '700',
  },
  journeyHeaderTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  journeyTotalBadge: {
    backgroundColor: '#30D158',
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 12,
  },
  journeyTotalBadgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  liveTrackingFullBtn: {
    backgroundColor: IS_ANDROID
      ? THEME.primaryContainer
      : 'rgba(10, 132, 255, 0.25)',
    borderWidth: IS_ANDROID ? 0 : 1,
    borderColor: 'rgba(100, 210, 255, 0.55)',
    borderRadius: IS_ANDROID ? 28 : 18,
    paddingVertical: IS_ANDROID ? 13 : 11,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 10,
    elevation: IS_ANDROID ? 4 : 0,
  },
  liveTrackingFullBtnActive: {
    backgroundColor: IS_ANDROID
      ? THEME.errorContainer
      : 'rgba(255, 69, 58, 0.25)',
    borderColor: 'rgba(255, 105, 97, 0.65)',
  },
  liveTrackingIconBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: IS_ANDROID ? THEME.primary : '#0A84FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveTrackingIconBadgeActive: {
    backgroundColor: IS_ANDROID ? THEME.error : '#FF453A',
  },
  liveTrackingFullBtnText: {
    flex: 1,
    color: IS_ANDROID ? THEME.onPrimaryContainer : '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  trackingStatusStrip: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 6,
  },
  liveGreenPulseDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#30D158',
  },
  trackingStatusText: {
    color: '#6EE7B7',
    fontSize: 12,
    fontWeight: '700',
  },
  journeyCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    gap: 12,
  },
  timelineWrapper: {
    gap: 2,
  },
  timelineStepRow: {
    alignItems: 'stretch',
    gap: 12,
  },
  timelineIconCol: {
    alignItems: 'center',
    width: 28,
  },
  timelineCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineConnector: {
    flex: 1,
    width: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    marginVertical: 4,
    minHeight: 24,
  },
  timelineBody: {
    flex: 1,
    paddingBottom: 16,
    gap: 4,
  },
  timelineTitleRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    width: '100%',
  },
  timelineTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  timelineSubtitle: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 12,
  },
  timelineTimeTag: {
    color: '#F1F5F9',
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 7,
  },
  timelineTimeTagHighlight: {
    color: '#64D2FF',
    fontSize: 12,
    fontWeight: '800',
    backgroundColor: 'rgba(10, 132, 255, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 7,
  },
  timelineTimeTagGreen: {
    color: '#6EE7B7',
    fontSize: 12,
    fontWeight: '800',
    backgroundColor: 'rgba(48, 209, 88, 0.22)',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 7,
  },
  inlineActionBtn: {
    backgroundColor: 'rgba(10, 132, 255, 0.85)',
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 12,
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  inlineActionBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  toggleStopsBtn: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  toggleStopsBtnText: {
    color: '#64D2FF',
    fontSize: 12,
    fontWeight: '700',
  },
  intermediateListBox: {
    width: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
    borderRadius: 14,
    padding: 10,
    gap: 7,
    marginTop: 2,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  intermediateStopRow: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderRadius: 6,
  },
  intermediateStopRowCurrent: {
    backgroundColor: 'rgba(10, 132, 255, 0.22)',
  },
  intermediateBullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.38)',
  },
  intermediateBulletPassed: {
    backgroundColor: '#30D158',
  },
  intermediateBulletCurrent: {
    backgroundColor: '#64D2FF',
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  intermediateBulletLast: {
    backgroundColor: '#FF453A',
  },
  intermediateStopName: {
    flex: 1,
    color: 'rgba(255, 255, 255, 0.82)',
    fontSize: 12,
  },
  intermediateStopNamePassed: {
    color: 'rgba(255, 255, 255, 0.38)',
    textDecorationLine: 'line-through',
  },
  intermediateStopNameCurrent: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  intermediateStopNameLast: {
    color: '#FCA5A5',
    fontWeight: '800',
  },
  intermediateMinText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 11,
    fontWeight: '600',
  },
  liveStopStatusTag: {
    color: '#64D2FF',
    fontSize: 11,
    fontWeight: '800',
  },
  nextStopStatusTag: {
    color: '#FCD34D',
    fontSize: 10,
    fontWeight: '800',
  },
  getOffHereBadge: {
    backgroundColor: 'rgba(255, 69, 58, 0.25)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FF453A',
  },
  getOffHereBadgeText: {
    color: '#FCA5A5',
    fontSize: 10,
    fontWeight: '800',
  },
  footerInfo: {
    color: 'rgba(255, 255, 255, 0.42)',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 4,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: IS_ANDROID ? THEME.surface : '#0A0E17',
  },
  modalHeader: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.14)',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  modalDoneBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  modalDoneText: {
    color: '#64D2FF',
    fontSize: 16,
    fontWeight: '700',
  },
  searchBarWrapper: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  searchInputBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 11 : 6,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  searchTextInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
  },
  searchingRow: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  searchingText: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 13,
    fontWeight: '600',
  },
  searchResultSub: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: 12,
    marginTop: 2,
  },
  noResultsText: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: 13,
    paddingVertical: 16,
    paddingHorizontal: 6,
  },
  mapHintPill: {
    backgroundColor: 'rgba(10, 132, 255, 0.14)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(100, 210, 255, 0.25)',
  },
  mapHintText: {
    flex: 1,
    color: '#BAE6FD',
    fontSize: 12,
    fontWeight: '600',
  },
  savedPlacesRow: {
    gap: 10,
  },
  savedPlaceCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 14,
    padding: 11,
    alignItems: 'center',
    gap: 9,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  savedPlaceCardFilled: {
    borderColor: 'rgba(100, 210, 255, 0.35)',
    backgroundColor: 'rgba(10, 132, 255, 0.12)',
  },
  savedPlaceTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  savedPlaceSub: {
    color: 'rgba(255, 255, 255, 0.58)',
    fontSize: 11,
    marginTop: 1,
  },
  noticeBannerWarn: {
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.45)',
    gap: 4,
  },
  noticeBannerInfo: {
    backgroundColor: 'rgba(99, 102, 241, 0.18)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.45)',
    gap: 4,
  },
  noticeBannerTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  noticeBannerBody: {
    color: 'rgba(255, 255, 255, 0.78)',
    fontSize: 12,
  },
  modalContent: {
    padding: 16,
    gap: 10,
  },
  modalGpsCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    padding: 14,
    borderRadius: 16,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#0A84FF',
  },
  modalGpsTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  modalGpsSub: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    marginTop: 2,
  },
  modalSectionHeader: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 2,
  },
  modalPresetRow: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  modalPresetRowActive: {
    borderColor: '#64D2FF',
    backgroundColor: 'rgba(10, 132, 255, 0.18)',
  },
  modalPresetText: {
    flex: 1,
    color: '#F1F5F9',
    fontSize: 15,
    fontWeight: '600',
  },
  modalPresetTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
});
