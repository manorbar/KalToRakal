import rawData from '../data/dankal_data.json';
import {
  DankalDataset,
  DankalStation,
  LiveBusOption,
  StationRecommendation,
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

interface FeederMatch {
  routeId: string;
  lineName: string;
  agencyId: string;
  originStopId: string;
  originStopCode: string;
  walkToBusMeters: number;
  stationId: string;
  alightStopId: string;
  walkFromBusMeters: number;
  rideMinutes: number;
}

/**
 * Finds all direct bus connections from bus stops near the user (within maxWalkToBusMeters)
 * that travel directly to bus stops right outside any of the target Dankal stations.
 */
function findCandidateFeederConnections(
  userLat: number,
  userLon: number,
  targetStationIds: Set<string>,
  maxWalkToBusMeters = 450
): {
  matches: FeederMatch[];
  originStopCodesToQuery: string[];
} {
  // 1. Find all stops in dataset.stops within maxWalkToBusMeters of user
  const nearbyOriginStops = new Map<string, number>(); // stopId -> walkMeters
  for (const [stopId, stop] of Object.entries(dataset.stops)) {
    const d = haversineMeters(userLat, userLon, stop.lat, stop.lon);
    if (d <= maxWalkToBusMeters) {
      nearbyOriginStops.set(stopId, Math.round(d));
    }
  }

  // 2. Scan feeder_routes for routes that visit a nearbyOriginStop BEFORE a stop serving a targetStationId
  const matches: FeederMatch[] = [];
  const originStopsWithValidRoutes = new Map<string, number>(); // stopCode -> walkMeters

  for (const [routeId, route] of Object.entries(dataset.feeder_routes)) {
    const seq = route.seq;
    // Find earliest index where stopId is in nearbyOriginStops (closest to user)
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

    // Look downstream for stops that have `st` matching any of targetStationIds
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
        walkToBusMeters: bestOriginDist,
        stationId: stId,
        alightStopId: alight.alightStopId,
        walkFromBusMeters: alight.walkFromBusMeters,
        rideMinutes: alight.rideMinutes,
      });

      const prevDist = originStopsWithValidRoutes.get(originStop.c);
      if (prevDist === undefined || bestOriginDist < prevDist) {
        originStopsWithValidRoutes.set(originStop.c, bestOriginDist);
      }
    }
  }

  // Sort unique origin stop codes by walking distance from user (query top 8 closest stops)
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
      const timer = setTimeout(() => controller.abort(), 6000);
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
      // Try fallback if CORS or network issue
    }
  }
  return [];
}

/**
 * Core KalToRakal engine:
 * 1. Finds the k nearest Dankal Red Line stations to (userLat, userLon).
 * 2. Finds all direct feeder bus routes from stops near the user to those k stations.
 * 3. Fetches live SIRI bus arrivals in parallel for the user's nearby stops.
 * 4. Computes total door-to-platform ETA (walk to stop + live wait + ride + walk to Dankal)
 *    and compares against direct walking and bike/scooter.
 */
export async function computeRoutesToNearestDankalStations(
  userLat: number,
  userLon: number,
  k: number = 3
): Promise<StationRecommendation[]> {
  // 1. Rank all 34 Dankal stations by distance from user
  const stationsWithDist = dataset.stations
    .map((station) => {
      const aerialMeters = Math.round(
        haversineMeters(userLat, userLon, station.lat, station.lon)
      );
      const walkMeters = Math.round(aerialMeters * 1.28); // urban street grid factor
      const walkMinutes = Math.max(1, Math.round(walkMeters / 80)); // 4.8 km/h walking speed
      const scooterMinutes = Math.max(1, Math.round(walkMeters / 250)); // 15 km/h scooter/bike speed
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

  // 2. Find candidate feeder bus routes & stops near the user
  const { matches, originStopCodesToQuery } = findCandidateFeederConnections(
    userLat,
    userLon,
    targetStationIds,
    500
  );

  // 3. Query live SIRI arrivals for the relevant nearby bus stops in parallel
  const liveVisitsByStopCode = new Map<string, CurlbusVisit[]>();
  await Promise.all(
    originStopCodesToQuery.map(async (code) => {
      const visits = await fetchLiveArrivalsForStopCode(code);
      liveVisitsByStopCode.set(code, visits);
    })
  );

  const nowMs = Date.now();

  // 4. Build live route options for each of the k stations
  return nearestK.map((item) => {
    const { station, aerialMeters, walkMeters, walkMinutes, scooterMinutes } =
      item;
    const stationMatches = matches.filter((m) => m.stationId === station.id);

    const liveBusOptions: LiveBusOption[] = [];
    const seenOptionKeys = new Set<string>();

    for (const m of stationMatches) {
      const visits = liveVisitsByStopCode.get(m.originStopCode) || [];
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

      // Match live SIRI visits by route_id OR by line_name (in case GTFS route_id rotated for another variant of same line)
      for (const v of visits) {
        const isExactRoute = String(v.route_id) === m.routeId;
        const isSameLineAndAgency =
          String(v.line_name) === m.lineName &&
          String(v.operator_id) === m.agencyId;

        if (!isExactRoute && !isSameLineAndAgency) continue;

        const etaDate = new Date(v.eta.replace(' ', 'T'));
        const waitMinRaw = Math.round((etaDate.getTime() - nowMs) / 60000);

        // Ensure the user can actually walk to the bus stop before the bus departs (allow 1 min grace)
        if (waitMinRaw < walkToBusMinutes - 1 || waitMinRaw > 45) continue;

        const waitMinutes = Math.max(0, waitMinRaw);
        const totalMinutes =
          Math.max(walkToBusMinutes, waitMinutes) +
          m.rideMinutes +
          walkFromBusMinutes;

        const etaHHMM = v.eta.slice(11, 16);
        const dedupKey = `${m.lineName}_${etaHHMM}_${m.originStopCode}`;
        if (seenOptionKeys.has(dedupKey)) continue;
        seenOptionKeys.add(dedupKey);

        const agency = AGENCY_NAMES[m.agencyId] || {
          he: 'תחבורה ציבורית',
          en: 'Public Transit',
        };

        liveBusOptions.push({
          id: dedupKey,
          lineName: m.lineName,
          agencyNameHe: agency.he,
          agencyNameEn: agency.en,
          originStopId: m.originStopId,
          originStopCode: m.originStopCode,
          originStopNameHe: originStop.he,
          originStopNameEn: originStop.en,
          walkToBusMeters: m.walkToBusMeters,
          walkToBusMinutes,
          waitMinutes,
          etaFormatted: etaHHMM,
          rideMinutes: m.rideMinutes,
          alightStopId: m.alightStopId,
          alightStopNameHe: alightStop.he,
          alightStopNameEn: alightStop.en,
          walkFromBusMeters: m.walkFromBusMeters,
          walkFromBusMinutes,
          totalMinutes,
          isRealtime: true,
        });
      }
    }

    // Sort live bus options by earliest total arrival time on the Dankal platform
    liveBusOptions.sort((a, b) => a.totalMinutes - b.totalMinutes);
    const topBusOptions = liveBusOptions.slice(0, 4);

    const bestBusMin =
      topBusOptions.length > 0 ? topBusOptions[0].totalMinutes : Infinity;
    const bestTotalMinutes = Math.min(walkMinutes, bestBusMin);
    const bestMode: 'bus' | 'walk' =
      bestBusMin < walkMinutes ? 'bus' : 'walk';
    const minutesSavedByBus =
      bestMode === 'bus' ? Math.max(0, walkMinutes - bestBusMin) : 0;

    // Shared trunk (Ben Gurion <-> Elifelet) has R1+R2+R3 every ~3.5 mins; branches every ~6 mins
    const nextTrainHeadwayMin =
      station.lines.length >= 2 ? '3.5–5' : '5–7';

    return {
      station,
      aerialMeters,
      walkMeters,
      walkMinutes,
      scooterMinutes,
      bestTotalMinutes,
      bestMode,
      minutesSavedByBus,
      liveBusOptions: topBusOptions,
      nextTrainHeadwayMin,
    };
  });
}
