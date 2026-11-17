import rawData from '../data/dankal_data.json';
import {
  DankalDataset,
  DankalStation,
  LiveBusOption,
  StationRecommendation,
  TimeMode,
} from '../types/transit';

const dataset = rawData as unknown as DankalDataset;

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

export function getAllStations(): DankalStation[] {
  return dataset.stations;
}

export function getRedLinePolylines(): {
  r1Coords: { latitude: number; longitude: number }[];
  r2BranchCoords: { latitude: number; longitude: number }[];
} {
  const stationById = new Map(dataset.stations.map((s) => [s.id, s]));
  const r1Coords = (dataset.r1_polyline_ids || [])
    .map((id) => stationById.get(id))
    .filter((s): s is DankalStation => Boolean(s))
    .map((s) => ({ latitude: s.lat, longitude: s.lon }));

  const r2BranchCoords = (dataset.r2_branch_ids || [])
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

function findCandidateFeederConnections(
  userLat: number,
  userLon: number,
  targetStationIds: Set<string>,
  maxWalkToBusMeters = 500
): {
  matches: FeederMatch[];
  originStopCodesToQuery: string[];
} {
  const nearbyOriginStops = new Map<string, number>();
  for (const [stopId, stop] of Object.entries(dataset.stops)) {
    const d = haversineMeters(userLat, userLon, stop.lat, stop.lon);
    if (d <= maxWalkToBusMeters) {
      nearbyOriginStops.set(stopId, Math.round(d));
    }
  }

  const matches: FeederMatch[] = [];
  const originStopsWithValidRoutes = new Map<string, number>();

  for (const [routeId, route] of Object.entries(dataset.feeder_routes)) {
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
    const originStop = dataset.stops[originStopId];
    if (!originStop) continue;

    const bestAlightPerStation = new Map<
      string,
      { alightStopId: string; walkFromBusMeters: number; rideMinutes: number }
    >();

    for (let j = bestOriginIdx + 1; j < seq.length; j++) {
      const [destStopId, destTimeMin] = seq[j];
      const destStop = dataset.stops[destStopId];
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
            alightStopId: destStopId,
            walkFromBusMeters: walkFromBusM,
            rideMinutes: rideMin,
          });
        }
      }
    }

    for (const [stId, alight] of bestAlightPerStation.entries()) {
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
        deps: route.deps || [],
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

/**
 * Supports 3 Time Modes:
 * - 'now': Uses live MoT SIRI arrivals (`curlbus.app`) with GTFS timetable fallback.
 * - 'depart_at': Computes optimal routes starting at `targetDate` (live SIRI if within 25 min of now, else GTFS schedule).
 * - 'arrive_by': Works backwards from `targetDate` so the user reaches the Dankal platform on or before `targetDate`.
 */
export async function computeRoutesToNearestDankalStations(
  userLat: number,
  userLon: number,
  k: number = 3,
  timeMode: TimeMode = 'now',
  targetDate: Date = new Date()
): Promise<StationRecommendation[]> {
  const now = new Date();
  const effectiveDate = timeMode === 'now' ? now : targetDate;
  const targetMinOfDay = dateToMinutesFromMidnight(effectiveDate);
  const diffFromNowMinutes = (effectiveDate.getTime() - now.getTime()) / 60000;

  // Use live SIRI if mode is 'now' or if target departure is within the next 20 minutes
  const useLiveSiri =
    timeMode === 'now' ||
    (timeMode === 'depart_at' &&
      diffFromNowMinutes >= -3 &&
      diffFromNowMinutes <= 20);

  const stationsWithDist = dataset.stations
    .map((station) => {
      const aerialMeters = Math.round(
        haversineMeters(userLat, userLon, station.lat, station.lon)
      );
      const walkMeters = Math.round(aerialMeters * 1.28);
      const walkMinutes = Math.max(1, Math.round(walkMeters / 80));
      const scooterMinutes = Math.max(1, Math.round(walkMeters / 250));
      return {
        station,
        aerialMeters,
        walkMeters,
        walkMinutes,
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
    const { station, aerialMeters, walkMeters, walkMinutes, scooterMinutes } =
      item;
    const stationMatches = matches.filter((m) => m.stationId === station.id);

    const liveBusOptions: LiveBusOption[] = [];
    const seenOptionKeys = new Set<string>();

    for (const m of stationMatches) {
      const originStop = dataset.stops[m.originStopId];
      const alightStop = dataset.stops[m.alightStopId];
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

      // 1. Live SIRI arrivals (if in live window)
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
          const busArrivalMinOfDay = dateToMinutesFromMidnight(etaDate);
          const leaveHomeMinOfDay = busArrivalMinOfDay - walkToBusMinutes;
          const arriveStationMinOfDay =
            busArrivalMinOfDay + m.rideMinutes + walkFromBusMinutes;
          const totalMinutes =
            Math.max(walkToBusMinutes, waitMinutes) +
            m.rideMinutes +
            walkFromBusMinutes;

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
            leaveHomeFormatted: formatMinFromMidnight(leaveHomeMinOfDay),
            etaFormatted: etaHHMM,
            arriveStationFormatted: formatMinFromMidnight(
              arriveStationMinOfDay
            ),
            rideMinutes: m.rideMinutes,
            alightStopId: m.alightStopId,
            alightStopNameHe: alightStop.he,
            alightStopNameEn: alightStop.en,
            alightStopLat: alightStop.lat,
            alightStopLon: alightStop.lon,
            walkFromBusMeters: m.walkFromBusMeters,
            walkFromBusMinutes,
            totalMinutes,
            isRealtime: true,
          });
        }
      }

      // 2. Scheduled GTFS timetable calculation (used for 'depart_at', 'arrive_by', or fallback when no live SIRI)
      if (!useLiveSiri || liveBusOptions.length === 0) {
        for (const depMin of m.deps) {
          const busAtOriginMin = Math.round(depMin + m.originOffsetMinutes);
          const arriveStationMin =
            busAtOriginMin + m.rideMinutes + walkFromBusMinutes;
          const leaveHomeMin = busAtOriginMin - walkToBusMinutes;

          if (timeMode === 'arrive_by') {
            // Must arrive at the Dankal station on or before targetMinOfDay, and at most 45 mins before
            const earlyMargin = targetMinOfDay - arriveStationMin;
            if (earlyMargin < 0 || earlyMargin > 45) continue;
          } else {
            // 'depart_at' or fallback 'now': user leaves at or after targetMinOfDay
            const waitMin = busAtOriginMin - targetMinOfDay;
            if (waitMin < walkToBusMinutes - 1 || waitMin > 45) continue;
          }

          const waitMinutes =
            timeMode === 'arrive_by'
              ? Math.max(0, targetMinOfDay - arriveStationMin)
              : Math.max(0, busAtOriginMin - targetMinOfDay);

          const totalMinutes =
            timeMode === 'arrive_by'
              ? walkToBusMinutes + m.rideMinutes + walkFromBusMinutes
              : Math.max(walkToBusMinutes, waitMinutes) +
                m.rideMinutes +
                walkFromBusMinutes;

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
            leaveHomeFormatted: formatMinFromMidnight(leaveHomeMin),
            etaFormatted: etaHHMM,
            arriveStationFormatted: formatMinFromMidnight(arriveStationMin),
            rideMinutes: m.rideMinutes,
            alightStopId: m.alightStopId,
            alightStopNameHe: alightStop.he,
            alightStopNameEn: alightStop.en,
            alightStopLat: alightStop.lat,
            alightStopLon: alightStop.lon,
            walkFromBusMeters: m.walkFromBusMeters,
            walkFromBusMinutes,
            totalMinutes,
            isRealtime: false,
          });
        }
      }
    }

    if (timeMode === 'arrive_by') {
      // For 'arrive_by', sort by latest departure from home that still makes the target arrival time!
      liveBusOptions.sort((a, b) =>
        b.leaveHomeFormatted.localeCompare(a.leaveHomeFormatted)
      );
    } else {
      liveBusOptions.sort((a, b) => a.totalMinutes - b.totalMinutes);
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
