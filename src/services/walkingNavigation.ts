import { haversineMeters } from './routingEngine';

export interface LatLon {
  latitude: number;
  longitude: number;
}

export type ManeuverIcon =
  | 'walk'
  | 'arrow-up'
  | 'arrow-forward'
  | 'arrow-back'
  | 'return-up-back'
  | 'flag';

export interface WalkingStep {
  index: number;
  instructionHe: string;
  instructionEn: string;
  streetName: string;
  distanceMeters: number;
  durationSeconds: number;
  maneuverType: string;
  maneuverModifier?: string;
  icon: ManeuverIcon;
  location: LatLon;
}

export interface WalkingRoute {
  coordinates: LatLon[];
  distanceMeters: number;
  durationSeconds: number;
  steps: WalkingStep[];
  source: 'osrm' | 'fallback';
}

export interface WalkingProgress {
  activeStepIndex: number;
  distanceToNextTurnMeters: number;
  remainingDistanceMeters: number;
  remainingMinutes: number;
  arrived: boolean;
  offRoute: boolean;
}

const routeCache = new Map<string, WalkingRoute>();

function makeCacheKey(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number
): string {
  return `${fromLat.toFixed(4)},${fromLon.toFixed(4)}->${toLat.toFixed(4)},${toLon.toFixed(4)}`;
}

export function getManeuverIcon(
  type: string,
  modifier?: string
): ManeuverIcon {
  if (type === 'arrive') return 'flag';
  if (type === 'depart') return 'walk';
  if (!modifier) return 'arrow-up';
  if (modifier === 'uturn') return 'return-up-back';
  if (modifier.includes('left')) return 'arrow-back';
  if (modifier.includes('right')) return 'arrow-forward';
  return 'arrow-up';
}

function formatHebrewStreet(name: string): string {
  const clean = (name || '').trim();
  if (!clean) return '';
  return `ל-${clean}`;
}

export function formatOsrmStep(
  type: string,
  modifier: string | undefined,
  streetName: string,
  destLabelHe?: string,
  destLabelEn?: string
): { instructionHe: string; instructionEn: string } {
  const cleanStreet = (streetName || '').trim();
  const ontoEn = cleanStreet ? ` onto ${cleanStreet}` : '';
  const alongEn = cleanStreet ? ` along ${cleanStreet}` : '';
  const ontoHe = cleanStreet ? ` ${formatHebrewStreet(cleanStreet)}` : '';
  const alongHe = cleanStreet ? ` ב-${cleanStreet}` : '';

  if (type === 'arrive') {
    return {
      instructionHe: destLabelHe ? `הגעה אל ${destLabelHe}` : 'הגעת ליעד',
      instructionEn: destLabelEn ? `Arrive at ${destLabelEn}` : 'Arrive at destination',
    };
  }

  if (type === 'depart') {
    return {
      instructionHe: cleanStreet ? `התחל ללכת${alongHe}` : 'התחל ללכת במסלול',
      instructionEn: cleanStreet ? `Start walking${alongEn}` : 'Start walking',
    };
  }

  if (type === 'roundabout' || type === 'rotary') {
    return {
      instructionHe: cleanStreet ? `המשך בכיכר${ontoHe}` : 'המשך דרך הכיכר',
      instructionEn: cleanStreet ? `At the roundabout, continue${ontoEn}` : 'Continue through the roundabout',
    };
  }

  switch (modifier) {
    case 'uturn':
      return {
        instructionHe: cleanStreet ? `פנה פרסה${ontoHe}` : 'פנה פרסה',
        instructionEn: cleanStreet ? `Make a U-turn${ontoEn}` : 'Make a U-turn',
      };
    case 'sharp left':
      return {
        instructionHe: `פנה פנייה חדה שמאלה${ontoHe}`,
        instructionEn: `Turn sharp left${ontoEn}`,
      };
    case 'left':
      return {
        instructionHe: `פנה שמאלה${ontoHe}`,
        instructionEn: `Turn left${ontoEn}`,
      };
    case 'slight left':
      return {
        instructionHe: `היצמד לשמאל${ontoHe}`,
        instructionEn: `Keep slight left${ontoEn}`,
      };
    case 'sharp right':
      return {
        instructionHe: `פנה פנייה חדה ימינה${ontoHe}`,
        instructionEn: `Turn sharp right${ontoEn}`,
      };
    case 'right':
      return {
        instructionHe: `פנה ימינה${ontoHe}`,
        instructionEn: `Turn right${ontoEn}`,
      };
    case 'slight right':
      return {
        instructionHe: `היצמד לימין${ontoHe}`,
        instructionEn: `Keep slight right${ontoEn}`,
      };
    case 'straight':
    default:
      return {
        instructionHe: cleanStreet ? `המשך ישר${alongHe}` : 'המשך ישר',
        instructionEn: cleanStreet ? `Continue straight${alongEn}` : 'Continue straight',
      };
  }
}

export function buildFallbackWalkingRoute(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
  destLabelHe?: string,
  destLabelEn?: string
): WalkingRoute {
  const straightMeters = Math.max(
    10,
    Math.round(haversineMeters(fromLat, fromLon, toLat, toLon))
  );
  const estWalkMeters = Math.round(straightMeters * 1.25);
  const estSeconds = Math.max(30, Math.round(estWalkMeters / 1.33));

  return {
    coordinates: [
      { latitude: fromLat, longitude: fromLon },
      { latitude: toLat, longitude: toLon },
    ],
    distanceMeters: estWalkMeters,
    durationSeconds: estSeconds,
    source: 'fallback',
    steps: [
      {
        index: 0,
        instructionHe: destLabelHe
          ? `לך לכיוון ${destLabelHe}`
          : 'לך לכיוון היעד',
        instructionEn: destLabelEn
          ? `Walk toward ${destLabelEn}`
          : 'Walk toward destination',
        streetName: '',
        distanceMeters: estWalkMeters,
        durationSeconds: estSeconds,
        maneuverType: 'depart',
        icon: 'walk',
        location: { latitude: fromLat, longitude: fromLon },
      },
      {
        index: 1,
        instructionHe: destLabelHe ? `הגעה אל ${destLabelHe}` : 'הגעת ליעד',
        instructionEn: destLabelEn
          ? `Arrive at ${destLabelEn}`
          : 'Arrive at destination',
        streetName: '',
        distanceMeters: 0,
        durationSeconds: 0,
        maneuverType: 'arrive',
        icon: 'flag',
        location: { latitude: toLat, longitude: toLon },
      },
    ],
  };
}

export async function fetchWalkingRoute(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
  destLabelHe?: string,
  destLabelEn?: string,
  bypassCache = false
): Promise<WalkingRoute> {
  const key = makeCacheKey(fromLat, fromLon, toLat, toLon);
  if (!bypassCache && routeCache.has(key)) {
    return routeCache.get(key)!;
  }

  // If already right next to destination (< 15m), return instant fallback
  const directDist = haversineMeters(fromLat, fromLon, toLat, toLon);
  if (directDist < 15) {
    return buildFallbackWalkingRoute(
      fromLat,
      fromLon,
      toLat,
      toLon,
      destLabelHe,
      destLabelEn
    );
  }

  const url = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${fromLon},${fromLat};${toLon},${toLat}?overview=full&geometries=geojson&steps=true`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return buildFallbackWalkingRoute(
        fromLat,
        fromLon,
        toLat,
        toLon,
        destLabelHe,
        destLabelEn
      );
    }

    const data = await res.json();
    const route = data?.routes?.[0];
    const coordsRaw: [number, number][] | undefined =
      route?.geometry?.coordinates;

    if (!route || !Array.isArray(coordsRaw) || coordsRaw.length < 2) {
      return buildFallbackWalkingRoute(
        fromLat,
        fromLon,
        toLat,
        toLon,
        destLabelHe,
        destLabelEn
      );
    }

    const coordinates: LatLon[] = coordsRaw.map(([lon, lat]) => ({
      latitude: lat,
      longitude: lon,
    }));

    const rawSteps: any[] = route?.legs?.[0]?.steps || [];
    const steps: WalkingStep[] = rawSteps.map((s: any, idx: number) => {
      const mType: string = s?.maneuver?.type || 'continue';
      const mMod: string | undefined = s?.maneuver?.modifier;
      const mLoc: [number, number] = s?.maneuver?.location || [fromLon, fromLat];
      const streetName: string = typeof s?.name === 'string' ? s.name : '';
      const { instructionHe, instructionEn } = formatOsrmStep(
        mType,
        mMod,
        streetName,
        destLabelHe,
        destLabelEn
      );

      return {
        index: idx,
        instructionHe,
        instructionEn,
        streetName,
        distanceMeters: Math.round(s?.distance || 0),
        durationSeconds: Math.round(s?.duration || 0),
        maneuverType: mType,
        maneuverModifier: mMod,
        icon: getManeuverIcon(mType, mMod),
        location: {
          latitude: mLoc[1],
          longitude: mLoc[0],
        },
      };
    });

    const result: WalkingRoute = {
      coordinates,
      distanceMeters: Math.round(route.distance || directDist),
      durationSeconds: Math.round(route.duration || directDist / 1.33),
      steps:
        steps.length > 0
          ? steps
          : buildFallbackWalkingRoute(
              fromLat,
              fromLon,
              toLat,
              toLon,
              destLabelHe,
              destLabelEn
            ).steps,
      source: 'osrm',
    };

    routeCache.set(key, result);
    return result;
  } catch {
    clearTimeout(timeout);
    return buildFallbackWalkingRoute(
      fromLat,
      fromLon,
      toLat,
      toLon,
      destLabelHe,
      destLabelEn
    );
  }
}

export function computeWalkingProgress(
  userLat: number,
  userLon: number,
  route: WalkingRoute,
  previousStepIndex: number
): WalkingProgress {
  const coords = route.coordinates;
  const dest = coords[coords.length - 1];
  const distToDest = haversineMeters(
    userLat,
    userLon,
    dest.latitude,
    dest.longitude
  );

  // Check distance to nearest polyline vertex for off-route detection & remaining distance
  let minVertexDist = Infinity;
  let nearestVertexIdx = 0;
  for (let i = 0; i < coords.length; i++) {
    const d = haversineMeters(
      userLat,
      userLon,
      coords[i].latitude,
      coords[i].longitude
    );
    if (d < minVertexDist) {
      minVertexDist = d;
      nearestVertexIdx = i;
    }
  }

  let remainingAlongPolyline = minVertexDist;
  for (let i = nearestVertexIdx; i < coords.length - 1; i++) {
    remainingAlongPolyline += haversineMeters(
      coords[i].latitude,
      coords[i].longitude,
      coords[i + 1].latitude,
      coords[i + 1].longitude
    );
  }

  const remainingDistanceMeters = Math.max(
    0,
    Math.round(Math.min(remainingAlongPolyline, Math.max(distToDest * 1.4, distToDest)))
  );
  const arrived = distToDest <= 30;
  const offRoute = !arrived && route.source === 'osrm' && minVertexDist > 65;

  // Advance step when within 22m of the next step's maneuver location
  const steps = route.steps;
  let activeStepIndex = Math.max(
    0,
    Math.min(previousStepIndex, steps.length - 1)
  );

  if (arrived) {
    activeStepIndex = steps.length - 1;
  } else {
    // Check if user reached the maneuver point of any upcoming step
    for (let i = activeStepIndex + 1; i < steps.length; i++) {
      const dToStep = haversineMeters(
        userLat,
        userLon,
        steps[i].location.latitude,
        steps[i].location.longitude
      );
      if (dToStep <= 22) {
        activeStepIndex = i;
      }
    }
  }

  const nextStepIdx = Math.min(activeStepIndex + 1, steps.length - 1);
  const nextStepLoc = steps[nextStepIdx]?.location || dest;
  const distanceToNextTurnMeters = arrived
    ? 0
    : Math.max(
        5,
        Math.round(
          haversineMeters(
            userLat,
            userLon,
            nextStepLoc.latitude,
            nextStepLoc.longitude
          )
        )
      );

  const remainingMinutes = arrived
    ? 0
    : Math.max(1, Math.round(remainingDistanceMeters / 80));

  return {
    activeStepIndex,
    distanceToNextTurnMeters,
    remainingDistanceMeters,
    remainingMinutes,
    arrived,
    offRoute,
  };
}

export function clearWalkingRouteCache(): void {
  routeCache.clear();
}
