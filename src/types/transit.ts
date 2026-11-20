export type Language = 'he' | 'en';

export type TimeMode = 'now' | 'depart_at' | 'arrive_by';

export type DankalDirection =
  | 'any'
  | 'to_tlv_batyam'
  | 'to_pt'
  | 'to_kiryat_arye';

export type UrgencyLevel = 'chill' | 'leave_now' | 'brisk';

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
  deps?: number[]; // scheduled Sun-Thu weekday departures from stop #1 in minutes from midnight
  fri?: number[]; // scheduled Friday departures
  sat?: number[]; // scheduled Saturday / Motzash departures
}

export interface DankalDataset {
  generated_at: string;
  r1_polyline_ids?: string[];
  r2_branch_ids?: string[];
  stations: DankalStation[];
  stops: Record<string, CompactBusStop>;
  feeder_routes: Record<string, FeederRoute>;
}

export interface IntermediateBusStop {
  stopId: string;
  stopCode: string;
  nameHe: string;
  nameEn: string;
  lat: number;
  lon: number;
  minutesFromBoarding: number;
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
  originStopLat: number;
  originStopLon: number;
  walkToBusMeters: number;
  walkToBusMinutes: number;
  waitMinutes: number;
  spareMinutesToWalk: number;
  urgency: UrgencyLevel;
  nextBackupBusMinutesLater: number | null;
  nextBackupBusLine: string | null;
  leaveHomeFormatted: string;
  leaveHomeMinutesOfDay: number; // numeric minutes for safe midnight-rollover sorting
  etaFormatted: string;
  arriveStationFormatted: string;
  rideMinutes: number;
  intermediateStops: IntermediateBusStop[];
  alightStopId: string;
  alightStopNameHe: string;
  alightStopNameEn: string;
  alightStopCode: string;
  alightStopLat: number;
  alightStopLon: number;
  entranceHintHe: string | null;
  entranceHintEn: string | null;
  walkFromBusMeters: number;
  walkFromBusMinutes: number;
  undergroundBufferMinutes: number; // +2.5 min (rounded to 3) for underground escalators/security
  totalMinutes: number;
  isRealtime: boolean;
}

export interface StationRecommendation {
  station: DankalStation;
  aerialMeters: number;
  walkMeters: number;
  walkMinutes: number;
  undergroundBufferMinutes: number;
  walkLeaveFormatted: string;
  walkArriveFormatted: string;
  scooterMinutes: number;
  scooterArriveFormatted: string;
  bestTotalMinutes: number;
  bestMode: 'bus' | 'walk';
  minutesSavedByBus: number;
  liveBusOptions: LiveBusOption[];
  nextTrainHeadwayMin: string;
}

export interface SavedPlace {
  slot: 'home' | 'work';
  name_he: string;
  name_en: string;
  lat: number;
  lon: number;
}

export interface SelectedJourney {
  recommendation: StationRecommendation;
  mode: 'bus' | 'walk' | 'scooter';
  busOption?: LiveBusOption;
}
