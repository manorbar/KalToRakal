import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
} from 'react-native';
import * as Location from 'expo-location';
import {
  Language,
  StationRecommendation,
  LiveBusOption,
} from './src/types/transit';
import { STRINGS, PRESET_ORIGINS, PresetOrigin } from './src/i18n/strings';
import { computeRoutesToNearestDankalStations } from './src/services/routingEngine';

export default function App() {
  const [lang, setLang] = useState<Language>('he');
  const [k, setK] = useState<number>(3);
  const [sortBy, setSortBy] = useState<'fastest' | 'distance'>('fastest');

  // Default to Dizengoff Center so the user immediately sees live data, or switch to GPS
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

  const fetchRoutes = useCallback(
    async (lat: number, lon: number, countK: number) => {
      setLoading(true);
      try {
        const res = await computeRoutesToNearestDankalStations(
          lat,
          lon,
          countK
        );
        setRecommendations(res);
        const now = new Date();
        setLastUpdated(
          now.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })
        );
      } catch (err) {
        console.error('Error computing routes:', err);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchRoutes(activeOrigin.lat, activeOrigin.lon, k);
  }, [activeOrigin.lat, activeOrigin.lon, k, fetchRoutes]);

  const handleUseMyGps = async () => {
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
      setActiveOrigin({
        id: 'gps',
        name_he: 'המיקום הנוכחי שלי (GPS)',
        name_en: 'My Current Location (GPS)',
        lat: Number(loc.coords.latitude.toFixed(5)),
        lon: Number(loc.coords.longitude.toFixed(5)),
        isGps: true,
      });
    } catch (e) {
      setGpsError(
        lang === 'he'
          ? 'לא ניתן לקבל מיקום GPS כעת'
          : 'Could not fetch GPS location'
      );
      setLoading(false);
    }
  };

  const handleSelectPreset = (preset: PresetOrigin) => {
    setGpsError(null);
    setActiveOrigin({
      ...preset,
      isGps: false,
    });
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

  const dirStyle = { direction: isRTL ? ('rtl' as const) : ('ltr' as const) };
  const rowDir = isRTL ? ('row-reverse' as const) : ('row' as const);
  const textAlign = isRTL ? ('right' as const) : ('left' as const);

  return (
    <SafeAreaView style={[styles.safeArea, dirStyle]}>
      <StatusBar barStyle="light-content" />

      {/* Top Header */}
      <View style={[styles.header, { flexDirection: rowDir }]}>
        <View style={{ flex: 1, alignItems: isRTL ? 'flex-end' : 'flex-start' }}>
          <View style={[styles.titleRow, { flexDirection: rowDir }]}>
            <View style={styles.redLineBadge}>
              <Text style={styles.redLineBadgeText}>R1•R2•R3</Text>
            </View>
            <Text style={[styles.appTitle, { textAlign }]}>{t.appTitle}</Text>
          </View>
          <Text style={[styles.appSubtitle, { textAlign }]}>
            {t.appSubtitle}
          </Text>
        </View>

        {/* Language Toggle (HE / EN) */}
        <TouchableOpacity
          style={styles.langToggle}
          onPress={() => setLang((prev) => (prev === 'he' ? 'en' : 'he'))}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.langOption,
              lang === 'he' && styles.langOptionActive,
            ]}
          >
            עב
          </Text>
          <Text style={styles.langDivider}>|</Text>
          <Text
            style={[
              styles.langOption,
              lang === 'en' && styles.langOptionActive,
            ]}
          >
            EN
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Origin & Controls Panel */}
        <View style={styles.controlCard}>
          {/* Active Origin Bar + GPS & Refresh Buttons */}
          <View style={[styles.originTopRow, { flexDirection: rowDir }]}>
            <View
              style={{
                flex: 1,
                alignItems: isRTL ? 'flex-end' : 'flex-start',
              }}
            >
              <Text style={styles.originLabel}>{t.customCoords}</Text>
              <Text style={[styles.originName, { textAlign }]}>
                📍 {isRTL ? activeOrigin.name_he : activeOrigin.name_en}
              </Text>
              <Text style={styles.coordSubtext}>
                {activeOrigin.lat.toFixed(4)}, {activeOrigin.lon.toFixed(4)}
                {lastUpdated ? ` • 🕒 ${lastUpdated}` : ''}
              </Text>
            </View>

            <View style={[styles.actionBtnsRow, { flexDirection: rowDir }]}>
              <TouchableOpacity
                style={[
                  styles.gpsButton,
                  activeOrigin.isGps && styles.gpsButtonActive,
                ]}
                onPress={handleUseMyGps}
              >
                <Text style={styles.gpsButtonText}>
                  🛰️ {activeOrigin.isGps ? t.gpsActive : t.useMyGps}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.refreshButton}
                onPress={() =>
                  fetchRoutes(activeOrigin.lat, activeOrigin.lon, k)
                }
              >
                <Text style={styles.refreshButtonText}>↻</Text>
              </TouchableOpacity>
            </View>
          </View>

          {gpsError ? (
            <Text style={[styles.errorText, { textAlign }]}>{gpsError}</Text>
          ) : null}

          {/* Preset Test Locations */}
          <Text style={[styles.sectionSmallLabel, { textAlign }]}>
            {t.presetLocations}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[
              styles.presetsRow,
              { flexDirection: rowDir },
            ]}
          >
            {PRESET_ORIGINS.map((preset) => {
              const selected =
                !activeOrigin.isGps && activeOrigin.id === preset.id;
              return (
                <TouchableOpacity
                  key={preset.id}
                  style={[
                    styles.presetChip,
                    selected && styles.presetChipActive,
                  ]}
                  onPress={() => handleSelectPreset(preset)}
                >
                  <Text
                    style={[
                      styles.presetChipText,
                      selected && styles.presetChipTextActive,
                    ]}
                  >
                    {isRTL ? preset.name_he : preset.name_en}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* k Selector + Sort Toggle */}
          <View style={[styles.kAndSortRow, { flexDirection: rowDir }]}>
            <View style={[styles.kSelectorGroup, { flexDirection: rowDir }]}>
              <Text style={styles.kLabel}>{t.kStationsLabel}</Text>
              {[2, 3, 4, 5].map((val) => (
                <TouchableOpacity
                  key={val}
                  style={[styles.kPill, k === val && styles.kPillActive]}
                  onPress={() => setK(val)}
                >
                  <Text
                    style={[
                      styles.kPillText,
                      k === val && styles.kPillTextActive,
                    ]}
                  >
                    {val}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={styles.sortToggleBtn}
              onPress={() =>
                setSortBy((prev) =>
                  prev === 'fastest' ? 'distance' : 'fastest'
                )
              }
            >
              <Text style={styles.sortToggleText}>
                {sortBy === 'fastest' ? t.sortByFastest : t.sortByDistance}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Loading indicator */}
        {loading && (
          <View style={[styles.loadingBanner, { flexDirection: rowDir }]}>
            <ActivityIndicator size="small" color="#EF4444" />
            <Text style={styles.loadingText}>{t.loadingLive}</Text>
          </View>
        )}

        {/* Station Route Cards */}
        {sortedRecommendations.map((rec, idx) => {
          const isFastest = rec.station.id === overallFastestStationId;
          const stationName = isRTL
            ? rec.station.name_he
            : rec.station.name_en;
          const cityName = isRTL ? rec.station.city_he : rec.station.city_en;

          return (
            <View
              key={rec.station.id}
              style={[
                styles.stationCard,
                isFastest && styles.stationCardFastest,
              ]}
            >
              {/* Fastest Banner */}
              {isFastest && (
                <View
                  style={[styles.fastestRibbon, { flexDirection: rowDir }]}
                >
                  <Text style={styles.fastestRibbonText}>
                    ⚡ {t.fastestOption} — {rec.bestTotalMinutes} {t.minUnit}
                  </Text>
                  {rec.minutesSavedByBus > 0 && (
                    <Text style={styles.savesBadgeText}>
                      {t.savesMinutes.replace(
                        '{m}',
                        String(rec.minutesSavedByBus)
                      )}
                    </Text>
                  )}
                </View>
              )}

              {/* Station Header */}
              <View style={[styles.stationHeader, { flexDirection: rowDir }]}>
                <View
                  style={{
                    flex: 1,
                    alignItems: isRTL ? 'flex-end' : 'flex-start',
                  }}
                >
                  <View
                    style={[
                      styles.stationTitleRow,
                      { flexDirection: rowDir },
                    ]}
                  >
                    <View style={styles.rankCircle}>
                      <Text style={styles.rankCircleText}>{idx + 1}</Text>
                    </View>
                    <Text style={[styles.stationTitle, { textAlign }]}>
                      {stationName}
                    </Text>
                    <View
                      style={[
                        styles.stationTypeBadge,
                        rec.station.is_underground
                          ? styles.undergroundBadge
                          : styles.surfaceBadge,
                      ]}
                    >
                      <Text style={styles.stationTypeText}>
                        {rec.station.is_underground
                          ? t.underground
                          : t.surface}
                      </Text>
                    </View>
                  </View>

                  <Text style={[styles.stationMeta, { textAlign }]}>
                    {cityName} • {rec.aerialMeters}
                    {t.metersUnit} • {t.dankalFreq}
                  </Text>
                </View>

                {/* Lines Badges (R1 / R2 / R3) */}
                <View style={[styles.linesRow, { flexDirection: rowDir }]}>
                  {rec.station.lines.map((line) => (
                    <View key={line} style={styles.linePill}>
                      <Text style={styles.linePillText}>{line}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Walk & Scooter Summary Pills */}
              <View style={[styles.microMobilityRow, { flexDirection: rowDir }]}>
                <View
                  style={[
                    styles.modeSummaryBox,
                    rec.bestMode === 'walk' && styles.modeSummaryBoxHighlight,
                    { flexDirection: rowDir },
                  ]}
                >
                  <Text style={styles.modeIcon}>🚶</Text>
                  <View
                    style={{
                      alignItems: isRTL ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <Text style={styles.modeLabel}>{t.walkDirect}</Text>
                    <Text style={styles.modeValue}>
                      {rec.walkMinutes} {t.minUnit}{' '}
                      <Text style={styles.modeSub}>
                        (~{rec.walkMeters}
                        {t.metersUnit})
                      </Text>
                    </Text>
                  </View>
                </View>

                <View
                  style={[styles.modeSummaryBox, { flexDirection: rowDir }]}
                >
                  <Text style={styles.modeIcon}>🛴</Text>
                  <View
                    style={{
                      alignItems: isRTL ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <Text style={styles.modeLabel}>{t.scooterBike}</Text>
                    <Text style={styles.modeValue}>
                      {rec.scooterMinutes} {t.minUnit}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Live Feeder Buses Section */}
              <Text style={[styles.feederSectionTitle, { textAlign }]}>
                🚌 {t.liveFeederBuses}
              </Text>

              {rec.liveBusOptions.length === 0 ? (
                <View style={styles.noBusesBox}>
                  <Text style={[styles.noBusesText, { textAlign }]}>
                    {t.noDirectBusesNow}
                  </Text>
                </View>
              ) : (
                rec.liveBusOptions.map((bus: LiveBusOption, bIdx: number) => (
                  <View
                    key={bus.id}
                    style={[
                      styles.busOptionCard,
                      bIdx === 0 && styles.busOptionCardBest,
                    ]}
                  >
                    {/* Top Row of Bus Card: Line Number + Live Arrival + Total Door-to-Platform */}
                    <View
                      style={[
                        styles.busCardTopRow,
                        { flexDirection: rowDir },
                      ]}
                    >
                      <View
                        style={[
                          styles.busLineGroup,
                          { flexDirection: rowDir },
                        ]}
                      >
                        <View style={styles.busNumberBadge}>
                          <Text style={styles.busNumberText}>
                            🚌 {bus.lineName}
                          </Text>
                        </View>
                        <View
                          style={{
                            alignItems: isRTL ? 'flex-end' : 'flex-start',
                          }}
                        >
                          <View
                            style={[
                              styles.livePulseRow,
                              { flexDirection: rowDir },
                            ]}
                          >
                            <View style={styles.liveDot} />
                            <Text style={styles.liveEtaText}>
                              {bus.waitMinutes <= 0
                                ? t.now
                                : `${t.arrivesIn} ${bus.waitMinutes} ${t.minUnit}`}{' '}
                              ({bus.etaFormatted})
                            </Text>
                          </View>
                          <Text style={styles.agencySubtext}>
                            {isRTL ? bus.agencyNameHe : bus.agencyNameEn}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.totalTimePill}>
                        <Text style={styles.totalTimeLabel}>{t.totalTime}</Text>
                        <Text style={styles.totalTimeValue}>
                          {bus.totalMinutes} {t.minUnit}
                        </Text>
                      </View>
                    </View>

                    {/* Step-by-step Journey Breakdown */}
                    <View
                      style={[
                        styles.stepsContainer,
                        { flexDirection: rowDir },
                      ]}
                    >
                      {/* Step 1: Walk to origin stop */}
                      <View style={styles.stepPill}>
                        <Text style={[styles.stepText, { textAlign }]}>
                          🚶 {bus.walkToBusMeters}
                          {t.metersUnit} ({bus.walkToBusMinutes} {t.minUnit}){' '}
                          {'\n'}
                          <Text style={styles.stepBold}>
                            {isRTL
                              ? bus.originStopNameHe
                              : bus.originStopNameEn}
                          </Text>
                        </Text>
                      </View>

                      <Text style={styles.stepArrow}>
                        {isRTL ? '←' : '→'}
                      </Text>

                      {/* Step 2: Bus Ride */}
                      <View style={styles.stepPill}>
                        <Text style={[styles.stepText, { textAlign }]}>
                          🚌 {t.rideDuration} ~{bus.rideMinutes} {t.minUnit}
                          {'\n'}
                          <Text style={styles.stepBold}>
                            {isRTL
                              ? bus.alightStopNameHe
                              : bus.alightStopNameEn}
                          </Text>
                        </Text>
                      </View>

                      <Text style={styles.stepArrow}>
                        {isRTL ? '←' : '→'}
                      </Text>

                      {/* Step 3: Walk from alighting stop to Dankal entrance */}
                      <View style={styles.stepPill}>
                        <Text style={[styles.stepText, { textAlign }]}>
                          🚇 {bus.walkFromBusMeters}
                          {t.metersUnit}
                          {'\n'}
                          <Text style={styles.stepBold}>{stationName}</Text>
                        </Text>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </View>
          );
        })}

        <Text style={styles.footerText}>{t.dataSourceFooter}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0B0F19',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#111827',
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleRow: {
    alignItems: 'center',
    gap: 8,
  },
  redLineBadge: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  redLineBadgeText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  appTitle: {
    color: '#F9FAFB',
    fontSize: 22,
    fontWeight: '800',
  },
  appSubtitle: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 2,
  },
  langToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#374151',
  },
  langOption: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 4,
  },
  langOptionActive: {
    color: '#F9FAFB',
    fontWeight: '800',
  },
  langDivider: {
    color: '#4B5563',
    fontSize: 12,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 14,
    paddingBottom: 40,
    gap: 14,
  },
  controlCard: {
    backgroundColor: '#111827',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1F2937',
    gap: 10,
  },
  originTopRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  originLabel: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  originName: {
    color: '#F9FAFB',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
  },
  coordSubtext: {
    color: '#6B7280',
    fontSize: 11,
    marginTop: 2,
  },
  actionBtnsRow: {
    alignItems: 'center',
    gap: 8,
  },
  gpsButton: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#3B82F6',
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 10,
  },
  gpsButtonActive: {
    backgroundColor: '#1D4ED8',
  },
  gpsButtonText: {
    color: '#EFF6FF',
    fontSize: 12,
    fontWeight: '700',
  },
  refreshButton: {
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: '#374151',
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshButtonText: {
    color: '#F9FAFB',
    fontSize: 18,
    fontWeight: '700',
  },
  errorText: {
    color: '#F87171',
    fontSize: 12,
  },
  sectionSmallLabel: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  presetsRow: {
    gap: 8,
    paddingVertical: 2,
  },
  presetChip: {
    backgroundColor: '#1F2937',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#374151',
  },
  presetChipActive: {
    backgroundColor: '#EF4444',
    borderColor: '#F87171',
  },
  presetChipText: {
    color: '#D1D5DB',
    fontSize: 12,
    fontWeight: '600',
  },
  presetChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  kAndSortRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1F2937',
    flexWrap: 'wrap',
    gap: 8,
  },
  kSelectorGroup: {
    alignItems: 'center',
    gap: 6,
  },
  kLabel: {
    color: '#D1D5DB',
    fontSize: 12,
    fontWeight: '600',
  },
  kPill: {
    backgroundColor: '#1F2937',
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#374151',
  },
  kPillActive: {
    backgroundColor: '#EF4444',
    borderColor: '#F87171',
  },
  kPillText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '700',
  },
  kPillTextActive: {
    color: '#FFFFFF',
  },
  sortToggleBtn: {
    backgroundColor: '#1F2937',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
  },
  sortToggleText: {
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '600',
  },
  loadingBanner: {
    backgroundColor: '#1E1B4B',
    padding: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    color: '#E0E7FF',
    fontSize: 13,
    fontWeight: '600',
  },
  stationCard: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1F2937',
    gap: 12,
  },
  stationCardFastest: {
    borderColor: '#10B981',
    borderWidth: 1.5,
  },
  fastestRibbon: {
    backgroundColor: '#064E3B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
  },
  fastestRibbonText: {
    color: '#34D399',
    fontSize: 13,
    fontWeight: '800',
  },
  savesBadgeText: {
    color: '#A7F3D0',
    fontSize: 12,
    fontWeight: '700',
  },
  stationHeader: {
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  stationTitleRow: {
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  rankCircle: {
    backgroundColor: '#1F2937',
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankCircleText: {
    color: '#F9FAFB',
    fontSize: 12,
    fontWeight: '800',
  },
  stationTitle: {
    color: '#F9FAFB',
    fontSize: 20,
    fontWeight: '800',
  },
  stationTypeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  undergroundBadge: {
    backgroundColor: '#312E81',
  },
  surfaceBadge: {
    backgroundColor: '#1E3A8A',
  },
  stationTypeText: {
    color: '#C7D2FE',
    fontSize: 10,
    fontWeight: '700',
  },
  stationMeta: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 4,
  },
  linesRow: {
    gap: 4,
  },
  linePill: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  linePillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  microMobilityRow: {
    gap: 10,
  },
  modeSummaryBox: {
    flex: 1,
    backgroundColor: '#1F2937',
    padding: 10,
    borderRadius: 10,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#374151',
  },
  modeSummaryBoxHighlight: {
    borderColor: '#34D399',
  },
  modeIcon: {
    fontSize: 18,
  },
  modeLabel: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '600',
  },
  modeValue: {
    color: '#F9FAFB',
    fontSize: 14,
    fontWeight: '800',
  },
  modeSub: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '500',
  },
  feederSectionTitle: {
    color: '#E5E7EB',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  noBusesBox: {
    backgroundColor: '#1F2937',
    padding: 12,
    borderRadius: 10,
  },
  noBusesText: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  busOptionCard: {
    backgroundColor: '#182234',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#26354D',
    gap: 10,
  },
  busOptionCardBest: {
    borderColor: '#3B82F6',
    backgroundColor: '#17253B',
  },
  busCardTopRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  busLineGroup: {
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  busNumberBadge: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  busNumberText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  livePulseRow: {
    alignItems: 'center',
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  liveEtaText: {
    color: '#34D399',
    fontSize: 13,
    fontWeight: '700',
  },
  agencySubtext: {
    color: '#9CA3AF',
    fontSize: 11,
    marginTop: 1,
  },
  totalTimePill: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  totalTimeLabel: {
    color: '#94A3B8',
    fontSize: 9,
    fontWeight: '600',
  },
  totalTimeValue: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '800',
  },
  stepsContainer: {
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F172A',
    padding: 8,
    borderRadius: 8,
    gap: 4,
  },
  stepPill: {
    flex: 1,
  },
  stepText: {
    color: '#94A3B8',
    fontSize: 11,
    lineHeight: 15,
  },
  stepBold: {
    color: '#E2E8F0',
    fontWeight: '700',
  },
  stepArrow: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '800',
    paddingHorizontal: 2,
  },
  footerText: {
    color: '#6B7280',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
  },
});
