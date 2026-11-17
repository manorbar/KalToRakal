export type Language = 'he' | 'en';

export interface DankalStation {
  id: string;
  name_he: string;
  name_en: string;
  city_he: string;
  city_en: string;
  lat: number;
  lon: number;
  is_underground: boolean;
  stop_codes: string[];
  lines: string[];
}

export interface CompactBusStop {
  c: string; // stop_code
  he: string; // Hebrew name
  en: string; // English name
  lat: number;
  lon: number;
  st?: Record<string, number>; // station_id -> walk_meters
}

export interface FeederRoute {
  n: string; // route_short_name (e.g. "63", "238")
  a: string; // agency_id (e.g. "5" for Dan)
  seq: [string, number][]; // [stop_id, relative_minutes][]
}

export interface DankalDataset {
  generated_at: string;
  stations: DankalStation[];
  stops: Record<string, CompactBusStop>;
  feeder_routes: Record<string, FeederRoute>;
}

export interface LiveBusOption {
  id: string;
  lineName: string;
  agencyNameHe: string;
  agencyNameEn: string;
  originStopId: string;
  originStopCode: string;
  originStopNameHe: string;
  originStopNameEn: string;
  walkToBusMeters: number;
  walkToBusMinutes: number;
  waitMinutes: number;
  etaFormatted: string;
  rideMinutes: number;
  alightStopId: string;
  alightStopNameHe: string;
  alightStopNameEn: string;
  walkFromBusMeters: number;
  walkFromBusMinutes: number;
  totalMinutes: number;
  isRealtime: boolean;
}

export interface StationRecommendation {
  station: DankalStation;
  aerialMeters: number;
  walkMeters: number;
  walkMinutes: number;
  scooterMinutes: number;
  bestTotalMinutes: number;
  bestMode: 'bus' | 'walk';
  minutesSavedByBus: number;
  liveBusOptions: LiveBusOption[];
  nextTrainHeadwayMin: string;
}
