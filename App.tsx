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
  Language,
  StationRecommendation,
  LiveBusOption,
  TimeMode,
} from './src/types/transit';
import { STRINGS, PRESET_ORIGINS, PresetOrigin } from './src/i18n/strings';
import {
  computeRoutesToNearestDankalStations,
  getAllStations,
  getRedLinePolylines,
} from './src/services/routingEngine';

const NativeSegmentedControl = SegmentedControl as unknown as React.ComponentType<any>;
const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function App() {
  const mapRef = useRef<MapView | null>(null);

  const [lang, setLang] = useState<Language>('he');
  const [k, setK] = useState<number>(3);
  const [sortBy, setSortBy] = useState<'fastest' | 'distance'>('fastest');
  const [timeMode, setTimeMode] = useState<TimeMode>('now');
  const [targetDate, setTargetDate] = useState<Date>(() => new Date());
  const [showTimePicker, setShowTimePicker] = useState<boolean>(false);
  const [showOriginSheet, setShowOriginSheet] = useState<boolean>(false);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(
    null
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

  const triggerHaptic = (type: 'selection' | 'light' | 'success' = 'selection') => {
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
          // Offset latitude slightly south so markers appear in upper visible half above sheet
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
      dateVal: Date
    ) => {
      setLoading(true);
      try {
        const res = await computeRoutesToNearestDankalStations(
          lat,
          lon,
          countK,
          mode,
          dateVal
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
    fetchRoutes(activeOrigin.lat, activeOrigin.lon, k, timeMode, targetDate);
  }, [activeOrigin.lat, activeOrigin.lon, k, timeMode, targetDate, fetchRoutes]);

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

  const openNativeMapsDirections = (
    destLat: number,
    destLon: number,
    label: string
  ) => {
    triggerHaptic('light');
    const encodedLabel = encodeURIComponent(label);
    const url = Platform.select({
      ios: `maps://?saddr=${activeOrigin.lat},${activeOrigin.lon}&daddr=${destLat},${destLon}&dirflg=r&q=${encodedLabel}`,
      android: `google.navigation:q=${destLat},${destLon}&mode=r`,
      default: `https://www.google.com/maps/dir/?api=1&origin=${activeOrigin.lat},${activeOrigin.lon}&destination=${destLat},${destLon}&travelmode=transit`,
    });
    if (url) {
      Linking.openURL(url).catch(() => {
        Linking.openURL(
          `https://www.google.com/maps/dir/?api=1&origin=${activeOrigin.lat},${activeOrigin.lon}&destination=${destLat},${destLon}&travelmode=transit`
        );
      });
    }
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
      recommendations.find((r) => r.station.id === selectedStationId) ||
      sortedRecommendations[0] ||
      null,
    [recommendations, selectedStationId, sortedRecommendations]
  );

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
        {/* Red Line Corridor Polylines (R1 & R2) */}
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

        {/* Subtle dots for all 34 Dankal stations along the corridor */}
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

        {/* Highlighted Pins for the k Nearest Dankal Stations */}
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

        {/* Visual Route Line from User -> Selected Station (via Best Feeder Bus or Direct Walk) */}
        {selectedStationRec && (
          <>
            {selectedStationRec.liveBusOptions.length > 0 &&
            selectedStationRec.bestMode === 'bus' ? (
              <>
                {/* Walk to bus stop (dashed blue) */}
                <Polyline
                  coordinates={[
                    { latitude: activeOrigin.lat, longitude: activeOrigin.lon },
                    {
                      latitude:
                        selectedStationRec.liveBusOptions[0].originStopLat,
                      longitude:
                        selectedStationRec.liveBusOptions[0].originStopLon,
                    },
                  ]}
                  strokeColor="#60A5FA"
                  strokeWidth={3}
                  lineDashPattern={[6, 6]}
                />
                {/* Bus ride to station (solid bright blue) */}
                <Polyline
                  coordinates={[
                    {
                      latitude:
                        selectedStationRec.liveBusOptions[0].originStopLat,
                      longitude:
                        selectedStationRec.liveBusOptions[0].originStopLon,
                    },
                    {
                      latitude:
                        selectedStationRec.liveBusOptions[0].alightStopLat,
                      longitude:
                        selectedStationRec.liveBusOptions[0].alightStopLon,
                    },
                    {
                      latitude: selectedStationRec.station.lat,
                      longitude: selectedStationRec.station.lon,
                    },
                  ]}
                  strokeColor="#3B82F6"
                  strokeWidth={4.5}
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
                strokeWidth={3.5}
                lineDashPattern={[6, 6]}
              />
            )}
          </>
        )}
      </MapView>

      {/* 2. Floating Native Frosted-Glass Top Overlay */}
      <SafeAreaView style={styles.topFloatingSafe} pointerEvents="box-none">
        <BlurView
          intensity={85}
          tint="dark"
          style={styles.topBlurCard}
        >
          {/* App Bar + Origin Selector Pill + Language Toggle */}
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

          {/* Native Segmented Control: Leave Now | Depart At | Arrive By */}
          <View style={styles.segmentedWrapper}>
            <NativeSegmentedControl
              values={segmentedValues}
              selectedIndex={segmentedSelectedIndex}
              onChange={(event: { nativeEvent: { selectedSegmentIndex: number } }) => {
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

          {/* Native Time Picker Row (Shown when Depart At or Arrive By is selected) */}
          {timeMode !== 'now' && (
            <View style={[styles.timePickerRow, { flexDirection: rowDir }]}>
              <View
                style={[styles.timePickerLabelGroup, { flexDirection: rowDir }]}
              >
                <Ionicons name="time-outline" size={16} color="#60A5FA" />
                <Text style={styles.timePickerLabel}>
                  {timeMode === 'depart_at' ? t.modeDepartAt : t.modeArriveBy}:
                </Text>
              </View>

              {Platform.OS === 'ios' ? (
                <DateTimePicker
                  value={targetDate}
                  mode="time"
                  display="compact"
                  themeVariant="dark"
                  onChange={handleTimePickerChange}
                />
              ) : (
                <TouchableOpacity
                  style={styles.androidTimeButton}
                  onPress={() => setShowTimePicker(true)}
                >
                  <Text style={styles.androidTimeButtonText}>
                    {formattedTargetTime}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {Platform.OS === 'android' && showTimePicker && (
            <DateTimePicker
              value={targetDate}
              mode="time"
              is24Hour={true}
              display="default"
              onChange={handleTimePickerChange}
            />
          )}
        </BlurView>
      </SafeAreaView>

      {/* 3. Native Bottom Sheet Deck */}
      <View style={styles.bottomSheetContainer}>
        <BlurView
          intensity={92}
          tint="dark"
          style={styles.bottomSheetBlur}
        >
          {/* Sheet Grabber Handle */}
          <View style={styles.sheetGrabber} />

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

            <View style={[styles.rightControlsGroup, { flexDirection: rowDir }]}>
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
                    sortBy === 'fastest' ? 'flash-outline' : 'navigate-outline'
                  }
                  size={13}
                  color="#93C5FD"
                />
                <Text style={styles.sortChipText}>
                  {sortBy === 'fastest' ? t.sortByFastest : t.sortByDistance}
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
                    targetDate
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
            <Text style={[styles.errorText, { textAlign }]}>{gpsError}</Text>
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
                    style={[styles.cardHeaderRow, { flexDirection: rowDir }]}
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
                          <Text style={styles.rankBadgeText}>{idx + 1}</Text>
                        </View>
                        <Text style={[styles.stationNameText, { textAlign }]}>
                          {stName}
                        </Text>
                        {isFastest && (
                          <View style={styles.fastestPill}>
                            <Text style={styles.fastestPillText}>
                              ⚡ {t.fastestOption}
                            </Text>
                          </View>
                        )}
                        {rec.minutesSavedByBus > 0 && (
                          <View style={styles.savesPill}>
                            <Text style={styles.savesPillText}>
                              {t.savesMinutes.replace(
                                '{m}',
                                String(rec.minutesSavedByBus)
                              )}
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

                    <View style={[styles.linesRow, { flexDirection: rowDir }]}>
                      {rec.station.lines.map((line) => (
                        <View key={line} style={styles.redLineChip}>
                          <Text style={styles.redLineChipText}>{line}</Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  {/* Walk & Scooter Strip + Native Map Navigation Button */}
                  <View style={[styles.modesBar, { flexDirection: rowDir }]}>
                    <View
                      style={[
                        styles.modeChip,
                        rec.bestMode === 'walk' && styles.modeChipBest,
                        { flexDirection: rowDir },
                      ]}
                    >
                      <Ionicons name="walk" size={16} color="#34D399" />
                      <Text style={styles.modeChipText}>
                        {t.walkDirect}:{' '}
                        <Text style={styles.modeChipBold}>
                          {rec.walkMinutes} {t.minUnit}
                        </Text>{' '}
                        ({rec.walkArriveFormatted})
                      </Text>
                    </View>

                    <View
                      style={[styles.modeChip, { flexDirection: rowDir }]}
                    >
                      <Ionicons name="bicycle" size={16} color="#60A5FA" />
                      <Text style={styles.modeChipText}>
                        <Text style={styles.modeChipBold}>
                          {rec.scooterMinutes} {t.minUnit}
                        </Text>
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={[
                        styles.appleMapsNavBtn,
                        { flexDirection: rowDir },
                      ]}
                      onPress={() =>
                        openNativeMapsDirections(
                          rec.station.lat,
                          rec.station.lon,
                          stName
                        )
                      }
                    >
                      <Ionicons name="navigate" size={13} color="#FFFFFF" />
                      <Text style={styles.appleMapsNavBtnText}>
                        {t.openInMaps}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Feeder Buses List */}
                  {rec.liveBusOptions.length === 0 ? (
                    <View style={styles.emptyBusBox}>
                      <Text style={[styles.emptyBusText, { textAlign }]}>
                        {t.noDirectBusesNow}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.busListContainer}>
                      {rec.liveBusOptions.map(
                        (bus: LiveBusOption, bIdx: number) => (
                          <View
                            key={bus.id}
                            style={[
                              styles.busRowCard,
                              bIdx === 0 && styles.busRowCardPrimary,
                            ]}
                          >
                            {/* Top Line of Bus Option */}
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

                                    <Text style={styles.busTimingHeadline}>
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
                                    <Text style={styles.busSubTimelineBold}>
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

                            {/* Compact 3-Step Visual Breadcrumb */}
                            <View
                              style={[
                                styles.breadcrumbBar,
                                { flexDirection: rowDir },
                              ]}
                            >
                              <Text
                                style={[styles.breadcrumbStep, { textAlign }]}
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
                                style={[styles.breadcrumbStep, { textAlign }]}
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
                              </Text>
                            </View>
                          </View>
                        )
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
        </BlurView>
      </View>

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
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 6 : 4,
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
  segmentedWrapper: {
    marginTop: 2,
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
    height: SCREEN_HEIGHT * 0.56,
  },
  bottomSheetBlur: {
    flex: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    backgroundColor: 'rgba(11, 15, 25, 0.86)',
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    paddingTop: 8,
  },
  sheetGrabber: {
    width: 38,
    height: 4.5,
    borderRadius: 3,
    backgroundColor: 'rgba(156, 163, 175, 0.45)',
    alignSelf: 'center',
    marginBottom: 8,
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
  savesPill: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  savesPillText: {
    color: '#93C5FD',
    fontSize: 10,
    fontWeight: '700',
  },
  stationSubMeta: {
    color: '#9CA3AF',
    fontSize: 11,
    marginTop: 3,
  },
  linesRow: {
    gap: 4,
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
    justifyContent: 'space-between',
    gap: 6,
    flexWrap: 'wrap',
  },
  modeChip: {
    backgroundColor: 'rgba(31, 41, 55, 0.85)',
    paddingHorizontal: 9,
    paddingVertical: 5,
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
  appleMapsNavBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    alignItems: 'center',
    gap: 4,
  },
  appleMapsNavBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
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
    gap: 7,
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
