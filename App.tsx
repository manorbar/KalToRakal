import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  StyleSheet,
  Text,
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
} from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import SegmentedControl from '@react-native-segmented-control/segmented-control';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import {
  DankalDirection,
  Language,
  StationRecommendation,
  LiveBusOption,
  TimeMode,
  UrgencyLevel,
  SelectedJourney,
} from './src/types/transit';
import { STRINGS, PRESET_ORIGINS, PresetOrigin } from './src/i18n/strings';
import {
  computeRoutesToNearestDankalStations,
  getAllStations,
  getRedLinePolylines,
} from './src/services/routingEngine';

const NativeSegmentedControl =
  SegmentedControl as unknown as React.ComponentType<any>;
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const SHEET_COLLAPSED_HEIGHT = 135;
const SHEET_DEFAULT_HEIGHT = Math.round(SCREEN_HEIGHT * 0.54);
const SHEET_EXPANDED_HEIGHT = Math.round(SCREEN_HEIGHT * 0.80);

export default function App() {
  const mapRef = useRef<MapView | null>(null);

  const [lang, setLang] = useState<Language>('he');
  const [k, setK] = useState<number>(3);
  const [sortBy, setSortBy] = useState<'fastest' | 'distance'>('fastest');
  const [direction, setDirection] = useState<DankalDirection>('any');
  const [timeMode, setTimeMode] = useState<TimeMode>('now');
  const [targetDate, setTargetDate] = useState<Date>(() => new Date());
  const [showTimePicker, setShowTimePicker] = useState<boolean>(false);
  const [androidPickerMode, setAndroidPickerMode] = useState<'date' | 'time'>(
    'date'
  );
  const [showOriginSheet, setShowOriginSheet] = useState<boolean>(false);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(
    null
  );

  // Active Travel Screen state when user taps a specific route option
  const [selectedJourney, setSelectedJourney] =
    useState<SelectedJourney | null>(null);
  const [showIntermediateStops, setShowIntermediateStops] =
    useState<boolean>(false);

  // Collapsible / Draggable Bottom Sheet State ('collapsed' | 'default' | 'expanded')
  const [sheetSnap, setSheetSnap] = useState<
    'collapsed' | 'default' | 'expanded'
  >('default');
  const sheetHeightAnim = useRef(
    new Animated.Value(SHEET_DEFAULT_HEIGHT)
  ).current;
  const dragStartHeightRef = useRef<number>(SHEET_DEFAULT_HEIGHT);

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
          ? SHEET_EXPANDED_HEIGHT
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
    } else if (sheetSnap === 'collapsed') {
      snapSheetTo('default');
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
              SHEET_EXPANDED_HEIGHT + 20,
              dragStartHeightRef.current - gestureState.dy
            )
          );
          sheetHeightAnim.setValue(nextHeight);
        },
        onPanResponderRelease: (_, gestureState) => {
          // If it was a quick tap on the grabber bar, toggle collapsed <-> default
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
            finalEstHeight - SHEET_EXPANDED_HEIGHT
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
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [gpsError, setGpsError] = useState<string | null>(null);

  const t = STRINGS[lang];
  const isRTL = lang === 'he';

  const allStations = useMemo(() => getAllStations(), []);
  const { r1Coords, r2BranchCoords } = useMemo(() => getRedLinePolylines(), []);

  const triggerHaptic = (
    type: 'selection' | 'light' | 'success' = 'selection'
  ) => {
    if (Platform.OS === 'web') return;
    if (type === 'selection') {
      Haptics.selectionAsync();
    } else if (type === 'light') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const focusMapOnOriginAndStation = useCallback(
    (origLat: number, origLon: number, stLat: number, stLon: number) => {
      if (!mapRef.current) return;
      const midLat = (origLat + stLat) / 2;
      const midLon = (origLon + stLon) / 2;
      const latDelta = Math.max(0.014, Math.abs(origLat - stLat) * 2.1);
      const lonDelta = Math.max(0.014, Math.abs(origLon - stLon) * 2.1);
      mapRef.current.animateToRegion(
        {
          latitude: midLat - latDelta * 0.18,
          longitude: midLon,
          latitudeDelta: latDelta,
          longitudeDelta: lonDelta,
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
      dirVal: DankalDirection
    ) => {
      setLoading(true);
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
        if (res.length > 0) {
          const fastest = res.reduce((best, cur) =>
            cur.bestTotalMinutes < best.bestTotalMinutes ? cur : best
          );
          setSelectedStationId(fastest.station.id);
          focusMapOnOriginAndStation(
            lat,
            lon,
            fastest.station.lat,
            fastest.station.lon
          );
        }
        const now = new Date();
        setLastUpdated(
          now.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })
        );
      } catch (err) {
        console.error('Error computing routes:', err);
      } finally {
        setLoading(false);
      }
    },
    [focusMapOnOriginAndStation]
  );

  useEffect(() => {
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
  ]);

  const handleUseMyGps = async () => {
    triggerHaptic('light');
    setGpsError(null);
    setLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setGpsError(
          lang === 'he'
            ? 'לא ניתנה הרשאת מיקום (GPS)'
            : 'Location permission denied'
        );
        setLoading(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      triggerHaptic('success');
      setActiveOrigin({
        id: 'gps',
        name_he: 'המיקום הנוכחי שלי (GPS)',
        name_en: 'My Current Location (GPS)',
        lat: Number(loc.coords.latitude.toFixed(5)),
        lon: Number(loc.coords.longitude.toFixed(5)),
        isGps: true,
      });
      setShowOriginSheet(false);
    } catch {
      setGpsError(
        lang === 'he'
          ? 'לא ניתן לקבל מיקום GPS כעת'
          : 'Could not fetch GPS location'
      );
      setLoading(false);
    }
  };

  const handleSelectPreset = (preset: PresetOrigin) => {
    triggerHaptic('selection');
    setGpsError(null);
    setActiveOrigin({
      ...preset,
      isGps: false,
    });
    setShowOriginSheet(false);
  };

  const handleTimeModeChange = (index: number) => {
    triggerHaptic('selection');
    const modes: TimeMode[] = ['now', 'depart_at', 'arrive_by'];
    const orderedModes = isRTL ? [...modes].reverse() : modes;
    const chosen = orderedModes[index] || 'now';
    setTimeMode(chosen);
    if (chosen === 'now') {
      setTargetDate(new Date());
      setShowTimePicker(false);
    } else {
      if (Platform.OS === 'android') {
        setAndroidPickerMode('time');
        setShowTimePicker(true);
      }
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
    triggerHaptic('light');
    setSelectedStationId(rec.station.id);
    setShowIntermediateStops(false);
    setSelectedJourney({
      recommendation: rec,
      mode,
      busOption,
    });
    if (sheetSnap === 'collapsed') {
      snapSheetTo('default');
    }
    focusMapOnOriginAndStation(
      activeOrigin.lat,
      activeOrigin.lon,
      rec.station.lat,
      rec.station.lon
    );
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
        border: 'rgba(16, 185, 129, 0.45)',
        text: '#6EE7B7',
      };
    }
    if (u === 'leave_now') {
      return {
        label: `🟡 ${t.urgencyLeaveNow}`,
        bg: 'rgba(245, 158, 11, 0.18)',
        border: 'rgba(245, 158, 11, 0.5)',
        text: '#FCD34D',
      };
    }
    return {
      label: `🔴 ${t.urgencyBrisk}`,
      bg: 'rgba(239, 68, 68, 0.2)',
      border: 'rgba(239, 68, 68, 0.55)',
      text: '#FCA5A5',
    };
  };

  const sortedRecommendations = useMemo(() => {
    const copy = [...recommendations];
    if (sortBy === 'fastest') {
      copy.sort((a, b) => a.bestTotalMinutes - b.bestTotalMinutes);
    } else {
      copy.sort((a, b) => a.aerialMeters - b.aerialMeters);
    }
    return copy;
  }, [recommendations, sortBy]);

  const overallFastestStationId = useMemo(() => {
    if (recommendations.length === 0) return null;
    return recommendations.reduce((best, cur) =>
      cur.bestTotalMinutes < best.bestTotalMinutes ? cur : best
    ).station.id;
  }, [recommendations]);

  const selectedStationRec = useMemo(
    () =>
      selectedJourney?.recommendation ||
      recommendations.find((r) => r.station.id === selectedStationId) ||
      sortedRecommendations[0] ||
      null,
    [selectedJourney, recommendations, selectedStationId, sortedRecommendations]
  );

  // Active bus option for map polyline rendering (either user-clicked busOption or station's top bus)
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
            strokeColor="#EF4444"
            strokeWidth={4}
          />
        )}
        {r2BranchCoords.length > 1 && (
          <Polyline
            coordinates={r2BranchCoords}
            strokeColor="#F87171"
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
              onPress={() => {
                triggerHaptic('selection');
                setSelectedStationId(rec.station.id);
                focusMapOnOriginAndStation(
                  activeOrigin.lat,
                  activeOrigin.lon,
                  rec.station.lat,
                  rec.station.lon
                );
              }}
            >
              <View
                style={[
                  styles.stationMapPin,
                  isFastest && styles.stationMapPinFastest,
                  isSelected && styles.stationMapPinSelected,
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
                    {rec.bestTotalMinutes} {t.minUnit}
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

        {/* Boarding & Alighting Stop Markers + Route Polyline */}
        {selectedStationRec && (
          <>
            {activeMapBusOption ? (
              <>
                {/* Origin Bus Stop Marker */}
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

                {/* Intermediate Bus Stops Dots when in Active Journey Screen */}
                {selectedJourney &&
                  activeMapBusOption.intermediateStops.map((istop) => (
                    <Marker
                      key={istop.stopId}
                      coordinate={{ latitude: istop.lat, longitude: istop.lon }}
                      anchor={{ x: 0.5, y: 0.5 }}
                    >
                      <View style={styles.intermediateStopDot} />
                    </Marker>
                  ))}

                {/* Walk to bus stop (dashed blue) */}
                <Polyline
                  coordinates={[
                    { latitude: activeOrigin.lat, longitude: activeOrigin.lon },
                    {
                      latitude: activeMapBusOption.originStopLat,
                      longitude: activeMapBusOption.originStopLon,
                    },
                  ]}
                  strokeColor="#60A5FA"
                  strokeWidth={3.5}
                  lineDashPattern={[6, 6]}
                />

                {/* Bus ride polyline through all intermediate stops */}
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
                  strokeColor="#3B82F6"
                  strokeWidth={5}
                />

                {/* Final walk from alighting stop to Dankal station */}
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
                  strokeColor="#10B981"
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
                strokeColor="#10B981"
                strokeWidth={4}
                lineDashPattern={[6, 6]}
              />
            )}
          </>
        )}
      </MapView>

      {/* 2. Floating Native Frosted-Glass Top Overlay */}
      <SafeAreaView style={styles.topFloatingSafe} pointerEvents="box-none">
        <BlurView intensity={85} tint="dark" style={styles.topBlurCard}>
          <View style={[styles.topHeaderRow, { flexDirection: rowDir }]}>
            <TouchableOpacity
              style={[styles.originSelectorBtn, { flexDirection: rowDir }]}
              onPress={() => {
                triggerHaptic('light');
                setShowOriginSheet(true);
              }}
              activeOpacity={0.75}
            >
              <Ionicons
                name={activeOrigin.isGps ? 'navigate-circle' : 'location'}
                size={20}
                color="#3B82F6"
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
              <Ionicons name="chevron-down" size={15} color="#9CA3AF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.gpsQuickBtn}
              onPress={handleUseMyGps}
              activeOpacity={0.75}
            >
              <Ionicons
                name="locate"
                size={18}
                color={activeOrigin.isGps ? '#60A5FA' : '#E5E7EB'}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.langPillBtn}
              onPress={() => {
                triggerHaptic('selection');
                setLang((prev) => (prev === 'he' ? 'en' : 'he'));
              }}
              activeOpacity={0.75}
            >
              <Text style={styles.langPillText}>
                {lang === 'he' ? 'EN' : 'עב'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Direction Filter Pills */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[
              styles.directionScrollRow,
              { flexDirection: rowDir },
            ]}
          >
            {directionOptions.map((opt) => {
              const active = direction === opt.id;
              return (
                <TouchableOpacity
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
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Native Segmented Control: Leave Now | Depart At | Arrive By */}
          <View style={styles.segmentedWrapper}>
            <NativeSegmentedControl
              values={segmentedValues}
              selectedIndex={segmentedSelectedIndex}
              onChange={(event: {
                nativeEvent: { selectedSegmentIndex: number };
              }) => {
                handleTimeModeChange(event.nativeEvent.selectedSegmentIndex);
              }}
              appearance="dark"
              tintColor="#3B82F6"
              fontStyle={{ color: '#D1D5DB', fontSize: 12, fontWeight: '600' }}
              activeFontStyle={{
                color: '#FFFFFF',
                fontSize: 12,
                fontWeight: '700',
              }}
              style={{ height: 32 }}
            />
          </View>

          {timeMode !== 'now' && (
            <View style={[styles.timePickerRow, { flexDirection: rowDir }]}>
              <View
                style={[styles.timePickerLabelGroup, { flexDirection: rowDir }]}
              >
                <Ionicons name="calendar-outline" size={16} color="#60A5FA" />
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
        </BlurView>
      </SafeAreaView>

      {/* 3. Interactive Collapsible / Draggable Native Bottom Sheet */}
      <Animated.View
        style={[styles.bottomSheetContainer, { height: sheetHeightAnim }]}
      >
        <BlurView intensity={94} tint="dark" style={styles.bottomSheetBlur}>
          {/* Draggable & Tappable Grabber Zone */}
          <View
            {...panResponder.panHandlers}
            style={styles.grabberTouchArea}
          >
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
                size={15}
                color="#9CA3AF"
              />
            </TouchableOpacity>
          </View>

          {selectedJourney ? (
            /* ============================================================
               ACTIVE TRAVEL / JOURNEY DETAIL SCREEN (When User Taps a Route)
               ============================================================ */
            <View style={{ flex: 1 }}>
              {/* Journey Top Bar with Back Button */}
              <View
                style={[styles.journeyTopHeader, { flexDirection: rowDir }]}
              >
                <TouchableOpacity
                  style={[styles.backBtnPill, { flexDirection: rowDir }]}
                  onPress={() => {
                    triggerHaptic('selection');
                    setSelectedJourney(null);
                  }}
                >
                  <Ionicons
                    name={isRTL ? 'chevron-forward' : 'chevron-back'}
                    size={16}
                    color="#60A5FA"
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
                        {/* Urgency Banner at top of Travel Screen */}
                        {timeMode === 'now' && (
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
                                  { backgroundColor: '#3B82F6' },
                                ]}
                              >
                                <Ionicons
                                  name="walk"
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

                          {/* STEP 2: Board Feeder Bus + Expandable Intermediate Stops */}
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
                                  { backgroundColor: '#2563EB' },
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
                                    color="#60A5FA"
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
                                    return (
                                      <View
                                        key={`${istop.stopId}_${sIdx}`}
                                        style={[
                                          styles.intermediateStopRow,
                                          { flexDirection: rowDir },
                                        ]}
                                      >
                                        <View
                                          style={[
                                            styles.intermediateBullet,
                                            isLast &&
                                              styles.intermediateBulletLast,
                                          ]}
                                        />
                                        <Text
                                          style={[
                                            styles.intermediateStopName,
                                            isLast &&
                                              styles.intermediateStopNameLast,
                                            { textAlign },
                                          ]}
                                        >
                                          {isRTL ? istop.nameHe : istop.nameEn}
                                        </Text>
                                        <Text style={styles.intermediateMinText}>
                                          +{istop.minutesFromBoarding}{' '}
                                          {t.minUnit}
                                        </Text>
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
                                  { backgroundColor: '#10B981' },
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
                                  { backgroundColor: '#EF4444' },
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
                  /* Walk or Scooter Direct Journey Card */
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
              {/* Sheet Controls Header: k Selector + Sort Toggle + Refresh */}
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

                <View
                  style={[styles.rightControlsGroup, { flexDirection: rowDir }]}
                >
                  <TouchableOpacity
                    style={[styles.sortChip, { flexDirection: rowDir }]}
                    onPress={() => {
                      triggerHaptic('selection');
                      setSortBy((prev) =>
                        prev === 'fastest' ? 'distance' : 'fastest'
                      );
                    }}
                  >
                    <Ionicons
                      name={
                        sortBy === 'fastest'
                          ? 'flash-outline'
                          : 'navigate-outline'
                      }
                      size={13}
                      color="#93C5FD"
                    />
                    <Text style={styles.sortChipText}>
                      {sortBy === 'fastest'
                        ? t.sortByFastest
                        : t.sortByDistance}
                    </Text>
                  </TouchableOpacity>

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
                      <ActivityIndicator size="small" color="#60A5FA" />
                    ) : (
                      <Ionicons name="refresh" size={16} color="#E5E7EB" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {gpsError ? (
                <Text style={[styles.errorText, { textAlign }]}>
                  {gpsError}
                </Text>
              ) : null}

              {/* Scrollable Station Cards inside the Sheet */}
              <ScrollView
                style={styles.cardsScroll}
                contentContainerStyle={styles.cardsScrollContent}
                showsVerticalScrollIndicator={false}
              >
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
                        focusMapOnOriginAndStation(
                          activeOrigin.lat,
                          activeOrigin.lon,
                          rec.station.lat,
                          rec.station.lon
                        );
                      }}
                      style={[
                        styles.stationCard,
                        isSelected && styles.stationCardSelected,
                        isFastest && styles.stationCardFastest,
                      ]}
                    >
                      {/* Top Row: Station Name + Lines + Fastest Badge */}
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
                              ? t.underground
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

                      {/* Tappable Walk & Scooter Strip */}
                      <View style={[styles.modesBar, { flexDirection: rowDir }]}>
                        <TouchableOpacity
                          style={[
                            styles.modeChip,
                            rec.bestMode === 'walk' && styles.modeChipBest,
                            { flexDirection: rowDir },
                          ]}
                          onPress={() => handleSelectJourney(rec, 'walk')}
                        >
                          <Ionicons name="walk" size={16} color="#34D399" />
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
                          <Ionicons name="bicycle" size={16} color="#60A5FA" />
                          <Text style={styles.modeChipText}>
                            <Text style={styles.modeChipBold}>
                              {rec.scooterMinutes} {t.minUnit}
                            </Text>
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {/* Feeder Buses List (Each Bus Option Opens the Travel Screen on Tap!) */}
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
                  {lastUpdated ? ` • ${lastUpdated}` : ''}
                </Text>
              </ScrollView>
            </View>
          )}
        </BlurView>
      </Animated.View>

      {/* 4. Native iOS PageSheet Modal for Picking Origin Location */}
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
              onPress={() => setShowOriginSheet(false)}
              style={styles.modalDoneBtn}
            >
              <Text style={styles.modalDoneText}>{t.done}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent}>
            <TouchableOpacity
              style={[styles.modalGpsCard, { flexDirection: rowDir }]}
              onPress={handleUseMyGps}
            >
              <Ionicons name="navigate-circle" size={26} color="#60A5FA" />
              <View
                style={{
                  flex: 1,
                  alignItems: isRTL ? 'flex-end' : 'flex-start',
                }}
              >
                <Text style={styles.modalGpsTitle}>{t.useMyGps}</Text>
                <Text style={styles.modalGpsSub}>
                  {activeOrigin.lat.toFixed(4)}, {activeOrigin.lon.toFixed(4)}
                </Text>
              </View>
              {activeOrigin.isGps && (
                <Ionicons name="checkmark-circle" size={22} color="#34D399" />
              )}
            </TouchableOpacity>

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
                    color={selected ? '#60A5FA' : '#9CA3AF'}
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
                      color="#60A5FA"
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#090D16',
  },
  map: {
    ...StyleSheet.absoluteFill,
  },
  minorStationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  busStopPin: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#2563EB',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  intermediateStopDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#93C5FD',
    borderWidth: 1.5,
    borderColor: '#1E3A8A',
  },
  stationMapPin: {
    backgroundColor: 'rgba(17, 24, 39, 0.94)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#EF4444',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
  },
  stationMapPinFastest: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(6, 78, 59, 0.95)',
  },
  stationMapPinSelected: {
    transform: [{ scale: 1.08 }],
    borderColor: '#60A5FA',
  },
  stationMapPinName: {
    color: '#F9FAFB',
    fontSize: 11,
    fontWeight: '800',
  },
  stationMapPinEtaPill: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    marginTop: 2,
  },
  stationMapPinEtaPillFastest: {
    backgroundColor: '#10B981',
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
    backgroundColor: 'rgba(59, 130, 246, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userOriginDot: {
    width: 13,
    height: 13,
    borderRadius: 6.5,
    backgroundColor: '#3B82F6',
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
  },
  topBlurCard: {
    borderRadius: 18,
    overflow: 'hidden',
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    gap: 8,
  },
  topHeaderRow: {
    alignItems: 'center',
    gap: 8,
  },
  originSelectorBtn: {
    flex: 1,
    backgroundColor: 'rgba(30, 41, 59, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  originCaption: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '600',
  },
  originMainText: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '700',
  },
  gpsQuickBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(30, 41, 59, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  langPillBtn: {
    height: 38,
    paddingHorizontal: 11,
    borderRadius: 12,
    backgroundColor: 'rgba(30, 41, 59, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  langPillText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '800',
  },
  directionScrollRow: {
    gap: 6,
    paddingVertical: 1,
  },
  directionChip: {
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  directionChipActive: {
    backgroundColor: 'rgba(220, 38, 38, 0.88)',
    borderColor: '#F87171',
  },
  directionChipText: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '600',
  },
  directionChipTextActive: {
    color: '#FFFFFF',
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
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '700',
  },
  androidDateTimeRow: {
    alignItems: 'center',
    gap: 6,
  },
  androidTimeButton: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  androidTimeButtonText: {
    color: '#60A5FA',
    fontSize: 14,
    fontWeight: '800',
  },
  bottomSheetContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  bottomSheetBlur: {
    flex: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    backgroundColor: 'rgba(11, 15, 25, 0.88)',
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  grabberTouchArea: {
    paddingTop: 8,
    paddingBottom: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetGrabber: {
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(156, 163, 175, 0.55)',
  },
  collapseChevronBtn: {
    position: 'absolute',
    right: 16,
    top: 4,
  },
  sheetHeaderRow: {
    paddingHorizontal: 14,
    paddingBottom: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  kGroup: {
    alignItems: 'center',
    gap: 5,
  },
  kTitle: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
    marginHorizontal: 2,
  },
  kChip: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: 'rgba(31, 41, 55, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kChipActive: {
    backgroundColor: '#3B82F6',
  },
  kChipText: {
    color: '#9CA3AF',
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
    backgroundColor: 'rgba(30, 41, 59, 0.9)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  sortChipText: {
    color: '#BFDBFE',
    fontSize: 11,
    fontWeight: '700',
  },
  iconRefreshBtn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: 'rgba(31, 41, 55, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: '#F87171',
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
    backgroundColor: 'rgba(17, 24, 39, 0.92)',
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: 10,
  },
  stationCardSelected: {
    borderColor: 'rgba(96, 165, 250, 0.55)',
  },
  stationCardFastest: {
    borderColor: '#10B981',
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
    backgroundColor: '#1F2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeText: {
    color: '#F9FAFB',
    fontSize: 11,
    fontWeight: '800',
  },
  stationNameText: {
    color: '#F9FAFB',
    fontSize: 18,
    fontWeight: '800',
  },
  fastestPill: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.5)',
  },
  fastestPillText: {
    color: '#34D399',
    fontSize: 10,
    fontWeight: '800',
  },
  stationSubMeta: {
    color: '#9CA3AF',
    fontSize: 11,
    marginTop: 3,
  },
  linesRow: {
    gap: 4,
    alignItems: 'center',
  },
  redLineChip: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
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
    backgroundColor: 'rgba(31, 41, 55, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    alignItems: 'center',
    gap: 5,
  },
  modeChipBest: {
    borderWidth: 1,
    borderColor: '#10B981',
  },
  modeChipText: {
    color: '#D1D5DB',
    fontSize: 11,
  },
  modeChipBold: {
    color: '#F9FAFB',
    fontWeight: '800',
  },
  emptyBusBox: {
    backgroundColor: 'rgba(31, 41, 55, 0.6)',
    padding: 9,
    borderRadius: 10,
  },
  emptyBusText: {
    color: '#9CA3AF',
    fontSize: 11,
  },
  busListContainer: {
    gap: 8,
  },
  busRowCard: {
    backgroundColor: 'rgba(24, 34, 52, 0.9)',
    borderRadius: 12,
    padding: 9,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    gap: 6,
  },
  busRowCardPrimary: {
    borderColor: 'rgba(59, 130, 246, 0.5)',
    backgroundColor: 'rgba(23, 37, 64, 0.95)',
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
    backgroundColor: '#2563EB',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  busNumText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  etaLineRow: {
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  statusBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  statusBadgeLive: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  statusBadgeSched: {
    backgroundColor: 'rgba(148, 163, 184, 0.2)',
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  statusTextLive: {
    color: '#34D399',
  },
  statusTextSched: {
    color: '#CBD5E1',
  },
  busTimingHeadline: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
  },
  busSubTimeline: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 1,
  },
  busSubTimelineBold: {
    color: '#E2E8F0',
    fontWeight: '700',
  },
  totalDurationBox: {
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  totalDurationNum: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800',
  },
  totalDurationUnit: {
    color: '#94A3B8',
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
    borderRadius: 6,
    borderWidth: 1,
  },
  urgencyPillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  backupBusText: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '600',
  },
  breadcrumbBar: {
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 4,
  },
  breadcrumbStep: {
    flex: 1,
    color: '#CBD5E1',
    fontSize: 10,
  },
  breadcrumbStepEnd: {
    color: '#93C5FD',
    fontSize: 10,
    fontWeight: '700',
  },
  breadcrumbArrow: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
  },
  tapForTravelHint: {
    color: '#60A5FA',
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
    borderBottomColor: 'rgba(255, 255, 255, 0.12)',
  },
  backBtnPill: {
    backgroundColor: 'rgba(30, 41, 59, 0.9)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(96, 165, 250, 0.35)',
  },
  backBtnText: {
    color: '#93C5FD',
    fontSize: 12,
    fontWeight: '700',
  },
  journeyHeaderTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800',
  },
  journeyTotalBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  journeyTotalBadgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  journeyCard: {
    backgroundColor: 'rgba(17, 24, 39, 0.94)',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(96, 165, 250, 0.35)',
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
    width: 2.5,
    backgroundColor: 'rgba(71, 85, 105, 0.7)',
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
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800',
  },
  timelineSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
  },
  timelineTimeTag: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '700',
    backgroundColor: 'rgba(30, 41, 59, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  timelineTimeTagHighlight: {
    color: '#93C5FD',
    fontSize: 13,
    fontWeight: '800',
    backgroundColor: 'rgba(37, 99, 235, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  timelineTimeTagGreen: {
    color: '#6EE7B7',
    fontSize: 13,
    fontWeight: '800',
    backgroundColor: 'rgba(16, 185, 129, 0.22)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  inlineActionBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
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
    color: '#60A5FA',
    fontSize: 12,
    fontWeight: '700',
  },
  intermediateListBox: {
    width: '100%',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderRadius: 10,
    padding: 10,
    gap: 7,
    marginTop: 2,
  },
  intermediateStopRow: {
    alignItems: 'center',
    gap: 8,
  },
  intermediateBullet: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#64748B',
  },
  intermediateBulletLast: {
    backgroundColor: '#10B981',
  },
  intermediateStopName: {
    flex: 1,
    color: '#CBD5E1',
    fontSize: 12,
  },
  intermediateStopNameLast: {
    color: '#6EE7B7',
    fontWeight: '700',
  },
  intermediateMinText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
  },
  footerInfo: {
    color: '#6B7280',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 4,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  modalHeader: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '800',
  },
  modalDoneBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  modalDoneText: {
    color: '#60A5FA',
    fontSize: 16,
    fontWeight: '700',
  },
  modalContent: {
    padding: 16,
    gap: 10,
  },
  modalGpsCard: {
    backgroundColor: '#1E293B',
    padding: 14,
    borderRadius: 14,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  modalGpsTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
  },
  modalGpsSub: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  modalSectionHeader: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 2,
  },
  modalPresetRow: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    gap: 10,
  },
  modalPresetRowActive: {
    borderWidth: 1,
    borderColor: '#60A5FA',
    backgroundColor: '#172554',
  },
  modalPresetText: {
    flex: 1,
    color: '#E2E8F0',
    fontSize: 15,
    fontWeight: '600',
  },
  modalPresetTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
});
