import rawData from '../data/dankal_data.json';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DankalDataset,
  DankalDirection,
  DankalStation,
  IntermediateBusStop,
  LiveBusOption,
  StationRecommendation,
  TimeMode,
  UrgencyLevel,
} from '../types/transit';

const REMOTE_GTFS_JSON_URL =
  'https://raw.githubusercontent.com/manorbar/KalToRakal/main/src/data/dankal_data.json';
const CACHED_GTFS_KEY = 'kaltorakal_cached_gtfs_v1';

// Active dataset starts with the bundled offline JSON and silently upgrades if newer remote data is cached/fetched
let activeDataset: DankalDataset = rawData as unknown as DankalDataset;

/**
 * Loads any previously cached GTFS dataset from AsyncStorage, then checks GitHub Raw
 * in the background to silently refresh the Dankal feeder graph when the weekly/nightly Action updates it.
 */
export async function syncLatestGtfsDataset(): Promise<boolean> {
  try {
    const cachedStr = await AsyncStorage.getItem(CACHED_GTFS_KEY);
    if (cachedStr) {
      const parsed = JSON.parse(cachedStr) as DankalDataset;
      if (
        parsed?.generated_at &&
        parsed.generated_at > activeDataset.generated_at &&
        Array.isArray(parsed.stations)
      ) {
        activeDataset = parsed;
      }
    }
  } catch {
    // ignore storage read error
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const resp = await fetch(REMOTE_GTFS_JSON_URL, { signal: controller.signal });
    clearTimeout(timer);
    if (!resp.ok) return false;
    const remoteData = (await resp.json()) as DankalDataset;
    if (
      remoteData?.generated_at &&
      remoteData.generated_at > activeDataset.generated_at &&
      Array.isArray(remoteData.stations)
    ) {
      activeDataset = remoteData;
      await AsyncStorage.setItem(CACHED_GTFS_KEY, JSON.stringify(remoteData));
      return true;
    }
  } catch {
    // offline or timeout — bundled dataset continues working seamlessly
  }
  return false;
}

const AGENCY_NAMES: Record<string, { he: string; en: string }> = {
  '3': { he: 'אגד', en: 'Egged' },
  '4': { he: 'אלקטרה אפיקים', en: 'Electra Afikim' },
  '5': { he: 'דן', en: 'Dan' },
  '15': { he: 'מטרופולין', en: 'Metropoline' },
  '16': { he: 'סופרבוס', en: 'Superbus' },
  '18': { he: 'קווים', en: 'Kavim' },
  '25': { he: 'אלקטרה אפיקים', en: 'Electra Afikim' },
  '31': { he: 'דן בדרום', en: 'Dan South' },
  '34': { he: 'תנופה', en: 'Tnufa' },
  '37': { he: 'אקסטרה', en: 'Extra' },
};

// Realistic escalator / security gate buffer for the 10 deep underground Red Line stations
export const UNDERGROUND_PLATFORM_BUFFER_MIN = 2.5;

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dp / 2) * Math.sin(dp / 2) +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Checks whether coordinates are within reasonable range (~18km) of the Dankal Gush Dan service area.
 */
export function isWithinGushDanServiceArea(lat: number, lon: number): boolean {
  let minDist = Infinity;
  for (const st of activeDataset.stations) {
    const d = haversineMeters(lat, lon, st.lat, st.lon);
    if (d < minDist) minDist = d;
  }
  return minDist <= 18000;
}

/**
 * Checks if a given Date falls inside typical Shabbat transit shutdown hours in Israel
 * (Friday after ~16:00 through Saturday before ~19:00).
 */
export function isShabbatServiceWindow(d: Date): boolean {
  const day = d.getDay(); // 5 = Friday, 6 = Saturday
  const mins = d.getHours() * 60 + d.getMinutes();
  if (day === 5 && mins >= 16 * 60) return true;
  if (day === 6 && mins < 19 * 60) return true;
  return false;
}

export function getAllStations(): DankalStation[] {
  return activeDataset.stations;
}

export function getRedLinePolylines(): {
  r1Coords: { latitude: number; longitude: number }[];
  r2BranchCoords: { latitude: number; longitude: number }[];
} {
  const stationById = new Map(activeDataset.stations.map((s) => [s.id, s]));
  const r1Coords = (activeDataset.r1_polyline_ids || [])
    .map((id) => stationById.get(id))
    .filter((s): s is DankalStation => Boolean(s))
    .map((s) => ({ latitude: s.lat, longitude: s.lon }));

  const r2BranchCoords = (activeDataset.r2_branch_ids || [])
    .map((id) => stationById.get(id))
    .filter((s): s is DankalStation => Boolean(s))
    .map((s) => ({ latitude: s.lat, longitude: s.lon }));

  return { r1Coords, r2BranchCoords };
}

interface FeederMatch {
  routeId: string;
  lineName: string;
  agencyId: string;
  originStopId: string;
  originStopCode: string;
  originOffsetMinutes: number;
  walkToBusMeters: number;
  stationId: string;
  alightStopId: string;
  walkFromBusMeters: number;
  rideMinutes: number;
  intermediateStops: IntermediateBusStop[];
  deps: number[];
}

function formatMinFromMidnight(totalMin: number): string {
  const normalized = ((Math.round(totalMin) % 1440) + 1440) % 1440;
  const hh = Math.floor(normalized / 60);
  const mm = normalized % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function dateToMinutesFromMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

function parseEntranceHint(
  alightStopNameHe: string,
  walkFromBusMeters: number
): { he: string | null; en: string | null } {
  const letterMatch = alightStopNameHe.match(/\b([A-D])$/);
  if (letterMatch) {
    const letter = letterMatch[1];
    return {
      he: `כניסה ${letter}`,
      en: `Entrance ${letter}`,
    };
  }
  if (walkFromBusMeters <= 65) {
    return {
      he: 'צמוד לכניסה',
      en: 'Direct to entrance',
    };
  }
  return { he: null, en: null };
}

function computeUrgency(spareMinutesToWalk: number): UrgencyLevel {
  if (spareMinutesToWalk >= 3) return 'chill';
  if (spareMinutesToWalk >= 0) return 'leave_now';
  return 'brisk';
}

function stationMatchesDirection(
  station: DankalStation,
  direction: DankalDirection
): boolean {
  if (direction === 'any' || direction === 'to_tlv_batyam') {
    return true;
  }
  if (direction === 'to_pt') {
    return station.lines.includes('R1');
  }
  if (direction === 'to_kiryat_arye') {
    return station.lines.includes('R2') || station.lines.includes('R3');
  }
  return true;
}

function getDeparturesForDay(
  route: { deps?: number[]; fri?: number[]; sat?: number[] },
  dayOfWeek: number
): number[] {
  if (dayOfWeek === 5) return route.fri || [];
  if (dayOfWeek === 6) return route.sat || [];
  return route.deps || [];
}

function findCandidateFeederConnections(
  userLat: number,
  userLon: number,
  targetStationIds: Set<string>,
  dayOfWeek: number,
  maxWalkToBusMeters = 500
): {
  matches: FeederMatch[];
  originStopCodesToQuery: string[];
} {
  const nearbyOriginStops = new Map<string, number>();
  for (const [stopId, stop] of Object.entries(activeDataset.stops)) {
    const d = haversineMeters(userLat, userLon, stop.lat, stop.lon);
    if (d <= maxWalkToBusMeters) {
      nearbyOriginStops.set(stopId, Math.round(d));
    }
  }

  const matches: FeederMatch[] = [];
  const originStopsWithValidRoutes = new Map<string, number>();

  for (const [routeId, route] of Object.entries(activeDataset.feeder_routes)) {
    const seq = route.seq;
    let bestOriginIdx = -1;
    let bestOriginDist = Infinity;

    for (let i = 0; i < seq.length - 1; i++) {
      const sid = seq[i][0];
      const dist = nearbyOriginStops.get(sid);
      if (dist !== undefined && dist < bestOriginDist) {
        bestOriginDist = dist;
        bestOriginIdx = i;
      }
    }

    if (bestOriginIdx === -1) continue;

    const [originStopId, originTimeMin] = seq[bestOriginIdx];
    const originStop = activeDataset.stops[originStopId];
    if (!originStop) continue;

    const bestAlightPerStation = new Map<
      string,
      {
        alightIdx: number;
        alightStopId: string;
        walkFromBusMeters: number;
        rideMinutes: number;
      }
    >();

    for (let j = bestOriginIdx + 1; j < seq.length; j++) {
      const [destStopId, destTimeMin] = seq[j];
      const destStop = activeDataset.stops[destStopId];
      if (!destStop || !destStop.st) continue;

      for (const [stId, walkFromBusM] of Object.entries(destStop.st)) {
        if (!targetStationIds.has(stId)) continue;
        const rideMin = Math.max(1, Math.round(destTimeMin - originTimeMin));
        const existing = bestAlightPerStation.get(stId);
        if (
          !existing ||
          rideMin + walkFromBusM / 80 <
            existing.rideMinutes + existing.walkFromBusMeters / 80
        ) {
          bestAlightPerStation.set(stId, {
            alightIdx: j,
            alightStopId: destStopId,
            walkFromBusMeters: walkFromBusM,
            rideMinutes: rideMin,
          });
        }
      }
    }

    for (const [stId, alight] of bestAlightPerStation.entries()) {
      const intermediateStops: IntermediateBusStop[] = [];
      for (let kIdx = bestOriginIdx + 1; kIdx <= alight.alightIdx; kIdx++) {
        const [interSid, interTime] = seq[kIdx];
        const stp = activeDataset.stops[interSid];
        if (!stp) continue;
        intermediateStops.push({
          stopId: interSid,
          stopCode: stp.c,
          nameHe: stp.he,
          nameEn: stp.en,
          lat: stp.lat,
          lon: stp.lon,
          minutesFromBoarding: Math.max(
            1,
            Math.round(interTime - originTimeMin)
          ),
        });
      }

      matches.push({
        routeId,
        lineName: route.n,
        agencyId: route.a,
        originStopId,
        originStopCode: originStop.c,
        originOffsetMinutes: originTimeMin,
        walkToBusMeters: bestOriginDist,
        stationId: stId,
        alightStopId: alight.alightStopId,
        walkFromBusMeters: alight.walkFromBusMeters,
        rideMinutes: alight.rideMinutes,
        intermediateStops,
        deps: getDeparturesForDay(route, dayOfWeek),
      });

      const prevDist = originStopsWithValidRoutes.get(originStop.c);
      if (prevDist === undefined || bestOriginDist < prevDist) {
        originStopsWithValidRoutes.set(originStop.c, bestOriginDist);
      }
    }
  }

  const originStopCodesToQuery = Array.from(originStopsWithValidRoutes.entries())
    .sort((a, b) => a[1] - b[1])
    .slice(0, 8)
    .map(([code]) => code);

  return { matches, originStopCodesToQuery };
}

interface CurlbusVisit {
  line_name: string;
  route_id: string | number;
  operator_id: string | number;
  eta: string;
}

async function fetchLiveArrivalsForStopCode(
  stopCode: string
): Promise<CurlbusVisit[]> {
  const urls = [
    `https://curlbus.app/${stopCode}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(
      `https://curlbus.app/${stopCode}`
    )}`,
  ];

  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5500);
      const resp = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) continue;
      const data = await resp.json();
      const visits = data?.visits?.[stopCode];
      if (Array.isArray(visits)) {
        return visits;
      }
    } catch {
      // fallback
    }
  }
  return [];
}

export async function computeRoutesToNearestDankalStations(
  userLat: number,
  userLon: number,
  k: number = 3,
  timeMode: TimeMode = 'now',
  targetDate: Date = new Date(),
  direction: DankalDirection = 'any'
): Promise<StationRecommendation[]> {
  const now = new Date();
  const effectiveDate = timeMode === 'now' ? now : targetDate;
  const dayOfWeek = effectiveDate.getDay();
  const targetMinOfDay = dateToMinutesFromMidnight(effectiveDate);
  const diffFromNowMinutes = (effectiveDate.getTime() - now.getTime()) / 60000;

  const useLiveSiri =
    timeMode === 'now' ||
    (timeMode === 'depart_at' &&
      diffFromNowMinutes >= -3 &&
      diffFromNowMinutes <= 20);

  const candidateStations = activeDataset.stations.filter((st) =>
    stationMatchesDirection(st, direction)
  );

  const stationsWithDist = candidateStations
    .map((station) => {
      const aerialMeters = Math.round(
        haversineMeters(userLat, userLon, station.lat, station.lon)
      );
      const undergroundBuffer = station.is_underground
        ? UNDERGROUND_PLATFORM_BUFFER_MIN
        : 0;
      const walkMeters = Math.round(aerialMeters * 1.28);
      const walkMinutes = Math.max(
        1,
        Math.round(walkMeters / 80 + undergroundBuffer)
      );
      const scooterMinutes = Math.max(
        1,
        Math.round(walkMeters / 250 + undergroundBuffer)
      );
      return {
        station,
        aerialMeters,
        walkMeters,
        walkMinutes,
        undergroundBufferMinutes: undergroundBuffer,
        scooterMinutes,
      };
    })
    .sort((a, b) => a.aerialMeters - b.aerialMeters);

  const nearestK = stationsWithDist.slice(0, k);
  const targetStationIds = new Set(nearestK.map((item) => item.station.id));

  const { matches, originStopCodesToQuery } = findCandidateFeederConnections(
    userLat,
    userLon,
    targetStationIds,
    dayOfWeek,
    500
  );

  const liveVisitsByStopCode = new Map<string, CurlbusVisit[]>();
  if (useLiveSiri) {
    await Promise.all(
      originStopCodesToQuery.map(async (code) => {
        const visits = await fetchLiveArrivalsForStopCode(code);
        liveVisitsByStopCode.set(code, visits);
      })
    );
  }

  return nearestK.map((item) => {
    const {
      station,
      aerialMeters,
      walkMeters,
      walkMinutes,
      undergroundBufferMinutes,
      scooterMinutes,
    } = item;
    const stationMatches = matches.filter((m) => m.stationId === station.id);

    const liveBusOptions: LiveBusOption[] = [];
    const seenOptionKeys = new Set<string>();

    for (const m of stationMatches) {
      const originStop = activeDataset.stops[m.originStopId];
      const alightStop = activeDataset.stops[m.alightStopId];
      if (!originStop || !alightStop) continue;

      const walkToBusMinutes = Math.max(
        1,
        Math.round((m.walkToBusMeters * 1.25) / 80)
      );
      const walkFromBusMinutes = Math.max(
        1,
        Math.round((m.walkFromBusMeters * 1.2) / 80)
      );

      const agency = AGENCY_NAMES[m.agencyId] || {
        he: 'תחבורה ציבורית',
        en: 'Public Transit',
      };
      const entranceHint = parseEntranceHint(
        alightStop.he,
        m.walkFromBusMeters
      );

      // 1. Live SIRI arrivals
      if (useLiveSiri) {
        const visits = liveVisitsByStopCode.get(m.originStopCode) || [];
        for (const v of visits) {
          const isExactRoute = String(v.route_id) === m.routeId;
          const isSameLineAndAgency =
            String(v.line_name) === m.lineName &&
            String(v.operator_id) === m.agencyId;
          if (!isExactRoute && !isSameLineAndAgency) continue;

          const etaDate = new Date(v.eta.replace(' ', 'T'));
          const waitMinRaw = Math.round(
            (etaDate.getTime() - effectiveDate.getTime()) / 60000
          );
          if (waitMinRaw < walkToBusMinutes - 1 || waitMinRaw > 45) continue;

          const waitMinutes = Math.max(0, waitMinRaw);
          const spareMinutesToWalk = waitMinRaw - walkToBusMinutes;
          const urgency = computeUrgency(spareMinutesToWalk);

          const busArrivalMinOfDay = dateToMinutesFromMidnight(etaDate);
          const leaveHomeMinOfDay = busArrivalMinOfDay - walkToBusMinutes;
          const arriveStationMinOfDay = Math.round(
            busArrivalMinOfDay +
              m.rideMinutes +
              walkFromBusMinutes +
              undergroundBufferMinutes
          );
          const totalMinutes = Math.round(
            Math.max(walkToBusMinutes, waitMinutes) +
              m.rideMinutes +
              walkFromBusMinutes +
              undergroundBufferMinutes
          );

          const etaHHMM = v.eta.slice(11, 16);
          const dedupKey = `${m.lineName}_${etaHHMM}`;
          if (seenOptionKeys.has(dedupKey)) continue;
          seenOptionKeys.add(dedupKey);

          liveBusOptions.push({
            id: `${dedupKey}_${m.originStopCode}`,
            lineName: m.lineName,
            agencyNameHe: agency.he,
            agencyNameEn: agency.en,
            originStopId: m.originStopId,
            originStopCode: m.originStopCode,
            originStopNameHe: originStop.he,
            originStopNameEn: originStop.en,
            originStopLat: originStop.lat,
            originStopLon: originStop.lon,
            walkToBusMeters: m.walkToBusMeters,
            walkToBusMinutes,
            waitMinutes,
            spareMinutesToWalk,
            urgency,
            nextBackupBusMinutesLater: null,
            nextBackupBusLine: null,
            leaveHomeFormatted: formatMinFromMidnight(leaveHomeMinOfDay),
            etaFormatted: etaHHMM,
            arriveStationFormatted: formatMinFromMidnight(
              arriveStationMinOfDay
            ),
            rideMinutes: m.rideMinutes,
            intermediateStops: m.intermediateStops,
            alightStopId: m.alightStopId,
            alightStopNameHe: alightStop.he,
            alightStopNameEn: alightStop.en,
            alightStopCode: alightStop.c,
            alightStopLat: alightStop.lat,
            alightStopLon: alightStop.lon,
            entranceHintHe: entranceHint.he,
            entranceHintEn: entranceHint.en,
            walkFromBusMeters: m.walkFromBusMeters,
            walkFromBusMinutes,
            undergroundBufferMinutes,
            totalMinutes,
            isRealtime: true,
          });
        }
      }

      // 2. Scheduled GTFS timetable calculation (day-aware: Sun-Thu / Friday / Saturday)
      if (!useLiveSiri || liveBusOptions.length === 0) {
        for (const depMin of m.deps) {
          const busAtOriginMin = Math.round(depMin + m.originOffsetMinutes);
          const arriveStationMin = Math.round(
            busAtOriginMin +
              m.rideMinutes +
              walkFromBusMinutes +
              undergroundBufferMinutes
          );
          const leaveHomeMin = busAtOriginMin - walkToBusMinutes;

          if (timeMode === 'arrive_by') {
            const earlyMargin = targetMinOfDay - arriveStationMin;
            if (earlyMargin < 0 || earlyMargin > 45) continue;
          } else {
            const waitMin = busAtOriginMin - targetMinOfDay;
            if (waitMin < walkToBusMinutes - 1 || waitMin > 45) continue;
          }

          const waitMinRaw = busAtOriginMin - targetMinOfDay;
          const waitMinutes =
            timeMode === 'arrive_by'
              ? Math.max(0, targetMinOfDay - arriveStationMin)
              : Math.max(0, waitMinRaw);

          const spareMinutesToWalk =
            timeMode === 'arrive_by' ? 3 : waitMinRaw - walkToBusMinutes;
          const urgency = computeUrgency(spareMinutesToWalk);

          const totalMinutes = Math.round(
            timeMode === 'arrive_by'
              ? walkToBusMinutes +
                  m.rideMinutes +
                  walkFromBusMinutes +
                  undergroundBufferMinutes
              : Math.max(walkToBusMinutes, waitMinutes) +
                  m.rideMinutes +
                  walkFromBusMinutes +
                  undergroundBufferMinutes
          );

          const etaHHMM = formatMinFromMidnight(busAtOriginMin);
          const dedupKey = `${m.lineName}_${etaHHMM}`;
          if (seenOptionKeys.has(dedupKey)) continue;
          seenOptionKeys.add(dedupKey);

          liveBusOptions.push({
            id: `${dedupKey}_${m.originStopCode}_sched`,
            lineName: m.lineName,
            agencyNameHe: agency.he,
            agencyNameEn: agency.en,
            originStopId: m.originStopId,
            originStopCode: m.originStopCode,
            originStopNameHe: originStop.he,
            originStopNameEn: originStop.en,
            originStopLat: originStop.lat,
            originStopLon: originStop.lon,
            walkToBusMeters: m.walkToBusMeters,
            walkToBusMinutes,
            waitMinutes,
            spareMinutesToWalk,
            urgency,
            nextBackupBusMinutesLater: null,
            nextBackupBusLine: null,
            leaveHomeFormatted: formatMinFromMidnight(leaveHomeMin),
            etaFormatted: etaHHMM,
            arriveStationFormatted: formatMinFromMidnight(arriveStationMin),
            rideMinutes: m.rideMinutes,
            intermediateStops: m.intermediateStops,
            alightStopId: m.alightStopId,
            alightStopNameHe: alightStop.he,
            alightStopNameEn: alightStop.en,
            alightStopCode: alightStop.c,
            alightStopLat: alightStop.lat,
            alightStopLon: alightStop.lon,
            entranceHintHe: entranceHint.he,
            entranceHintEn: entranceHint.en,
            walkFromBusMeters: m.walkFromBusMeters,
            walkFromBusMinutes,
            undergroundBufferMinutes,
            totalMinutes,
            isRealtime: false,
          });
        }
      }
    }

    if (timeMode === 'arrive_by') {
      liveBusOptions.sort((a, b) => {
        const leaveCmp = b.leaveHomeFormatted.localeCompare(
          a.leaveHomeFormatted
        );
        if (leaveCmp !== 0) return leaveCmp;
        return a.intermediateStops.length - b.intermediateStops.length;
      });
    } else {
      liveBusOptions.sort((a, b) => {
        if (a.totalMinutes !== b.totalMinutes) {
          return a.totalMinutes - b.totalMinutes;
        }
        return a.intermediateStops.length - b.intermediateStops.length;
      });
    }

    for (let i = 0; i < liveBusOptions.length - 1; i++) {
      const cur = liveBusOptions[i];
      const next = liveBusOptions.find(
        (cand, idx) => idx > i && cand.waitMinutes > cur.waitMinutes
      );
      if (next) {
        cur.nextBackupBusMinutesLater = Math.max(
          1,
          next.waitMinutes - cur.waitMinutes
        );
        cur.nextBackupBusLine = next.lineName;
      }
    }

    const topBusOptions = liveBusOptions.slice(0, 4);
    const bestBusMin =
      topBusOptions.length > 0 ? topBusOptions[0].totalMinutes : Infinity;
    const bestTotalMinutes = Math.min(walkMinutes, bestBusMin);
    const bestMode: 'bus' | 'walk' =
      bestBusMin < walkMinutes ? 'bus' : 'walk';
    const minutesSavedByBus =
      bestMode === 'bus' ? Math.max(0, walkMinutes - bestBusMin) : 0;

    const walkLeaveFormatted =
      timeMode === 'arrive_by'
        ? formatMinFromMidnight(targetMinOfDay - walkMinutes)
        : formatMinFromMidnight(targetMinOfDay);
    const walkArriveFormatted =
      timeMode === 'arrive_by'
        ? formatMinFromMidnight(targetMinOfDay)
        : formatMinFromMidnight(targetMinOfDay + walkMinutes);

    const nextTrainHeadwayMin =
      station.lines.length >= 2 ? '3.5–5' : '5–7';

    return {
      station,
      aerialMeters,
      walkMeters,
      walkMinutes,
      undergroundBufferMinutes,
      walkLeaveFormatted,
      walkArriveFormatted,
      scooterMinutes,
      bestTotalMinutes,
      bestMode,
      minutesSavedByBus,
      liveBusOptions: topBusOptions,
      nextTrainHeadwayMin,
    };
  });
}
