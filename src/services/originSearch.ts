import rawData from '../data/dankal_data.json';
import * as Location from 'expo-location';
import { DankalDataset } from '../types/transit';

const dataset = rawData as unknown as DankalDataset;

export interface OriginSearchResult {
  id: string;
  name_he: string;
  name_en: string;
  subtitle_he: string;
  subtitle_en: string;
  lat: number;
  lon: number;
  kind: 'stop' | 'address';
}

// Pre-build a lightweight array of all 4,225 Gush Dan bus stops once for instant (<5ms) offline search
interface IndexedStop {
  stopId: string;
  code: string;
  he: string;
  en: string;
  heLower: string;
  enLower: string;
  lat: number;
  lon: number;
}

const INDEXED_STOPS: IndexedStop[] = Object.entries(dataset.stops).map(
  ([stopId, s]) => ({
    stopId,
    code: s.c,
    he: s.he,
    en: s.en,
    heLower: s.he.toLowerCase(),
    enLower: s.en.toLowerCase(),
    lat: s.lat,
    lon: s.lon,
  })
);

/**
 * Instant offline search across all 4,225 Gush Dan bus stops by Hebrew/English name or 5-digit stop code.
 */
export function searchLocalBusStops(
  query: string,
  limit = 6
): OriginSearchResult[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const tokens = q.split(/\s+/).filter(Boolean);
  const results: OriginSearchResult[] = [];
  const seenNames = new Set<string>();

  for (const s of INDEXED_STOPS) {
    const codeMatch = s.code.startsWith(q);
    const nameMatch = tokens.every(
      (tok) => s.heLower.includes(tok) || s.enLower.includes(tok)
    );

    if (codeMatch || nameMatch) {
      // Avoid cluttering results with opposite-side stops of the exact same name unless searching by code
      const dedupKey = codeMatch ? s.code : s.he;
      if (seenNames.has(dedupKey)) continue;
      seenNames.add(dedupKey);

      results.push({
        id: `stop_${s.stopId}`,
        name_he: s.he,
        name_en: s.en,
        subtitle_he: `תחנת אוטובוס • מק"ט ${s.code}`,
        subtitle_en: `Bus Stop • #${s.code}`,
        lat: s.lat,
        lon: s.lon,
        kind: 'stop',
      });

      if (results.length >= limit) break;
    }
  }

  return results;
}

interface PhotonFeature {
  geometry?: {
    coordinates?: [number, number]; // [lon, lat]
  };
  properties?: {
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    district?: string;
    countrycode?: string;
  };
}

/**
 * Free address & landmark autocomplete in Central Israel using Photon (OpenStreetMap),
 * with fallback to native OS Geocoder (`Location.geocodeAsync`).
 */
export async function searchAddressesAndPlaces(
  query: string,
  lang: 'he' | 'en',
  limit = 6
): Promise<OriginSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const results: OriginSearchResult[] = [];
  const seenKeys = new Set<string>();

  // 1. Query Photon (free OSM geocoder biased to Central Israel / Gush Dan)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(
      q
    )}&lat=32.075&lon=34.805&limit=10&bbox=34.68,31.93,34.98,32.22`;

    const resp = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (resp.ok) {
      const data = await resp.json();
      const features: PhotonFeature[] = Array.isArray(data?.features)
        ? data.features
        : [];

      for (const feat of features) {
        const coords = feat.geometry?.coordinates;
        const props = feat.properties;
        if (!coords || coords.length < 2 || !props) continue;

        const [lon, lat] = coords;
        // Double-check within broader Central Israel
        if (lat < 31.9 || lat > 32.25 || lon < 34.65 || lon > 35.0) continue;

        const streetPart = props.street
          ? props.housenumber
            ? `${props.street} ${props.housenumber}`
            : props.street
          : '';
        const mainName = props.name || streetPart || q;
        const cityPart = props.city || props.district || '';

        const displayTitle =
          props.name && streetPart && props.name !== streetPart
            ? `${props.name}, ${streetPart}`
            : mainName;

        const dedup = `${displayTitle}_${cityPart}`;
        if (seenKeys.has(dedup)) continue;
        seenKeys.add(dedup);

        results.push({
          id: `addr_${lat.toFixed(5)}_${lon.toFixed(5)}`,
          name_he: displayTitle,
          name_en: displayTitle,
          subtitle_he: cityPart || 'כתובת בגוש דן',
          subtitle_en: cityPart || 'Address in Gush Dan',
          lat: Number(lat.toFixed(6)),
          lon: Number(lon.toFixed(6)),
          kind: 'address',
        });

        if (results.length >= limit) break;
      }
    }
  } catch {
    // Fall through to native OS geocoder
  }

  // 2. If Photon returned nothing, try native Apple/Google geocoder (`Location.geocodeAsync`)
  if (results.length === 0) {
    try {
      const withRegion =
        q.includes('ישראל') || q.toLowerCase().includes('israel')
          ? q
          : lang === 'he'
          ? `${q}, ישראל`
          : `${q}, Israel`;
      const geocoded = await Location.geocodeAsync(withRegion);
      for (const g of geocoded.slice(0, 3)) {
        if (
          g.latitude < 31.9 ||
          g.latitude > 32.25 ||
          g.longitude < 34.65 ||
          g.longitude > 35.0
        ) {
          continue;
        }
        results.push({
          id: `geo_${g.latitude.toFixed(5)}_${g.longitude.toFixed(5)}`,
          name_he: q,
          name_en: q,
          subtitle_he: `${g.latitude.toFixed(4)}, ${g.longitude.toFixed(4)}`,
          subtitle_en: `${g.latitude.toFixed(4)}, ${g.longitude.toFixed(4)}`,
          lat: Number(g.latitude.toFixed(6)),
          lon: Number(g.longitude.toFixed(6)),
          kind: 'address',
        });
      }
    } catch {
      // Ignore geocoder failure
    }
  }

  return results;
}
