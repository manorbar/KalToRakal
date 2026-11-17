export type Language = 'he' | 'en';

export type TimeMode = 'now' | 'depart_at' | 'arrive_by';

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
  deps?: number[]; // scheduled weekday departures from stop #1 in minutes from midnight
}

export interface DankalDataset {
  generated_at: string;
  r1_polyline_ids?: string[];
  r2_branch_ids?: string[];
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
  originStopLat: number;
  originStopLon: number;
  walkToBusMeters: number;
  walkToBusMinutes: number;
  waitMinutes: number;
  leaveHomeFormatted: string; // HH:MM when user should start walking
  etaFormatted: string; // HH:MM when bus arrives at origin stop
  arriveStationFormatted: string; // HH:MM when user reaches the Dankal platform
  rideMinutes: number;
  alightStopId: string;
  alightStopNameHe: string;
  alightStopNameEn: string;
  alightStopLat: number;
  alightStopLon: number;
  walkFromBusMeters: number;
  walkFromBusMinutes: number;
  totalMinutes: number;
  isRealtime: boolean; // true = live SIRI, false = GTFS scheduled timetable
}

export interface StationRecommendation {
  station: DankalStation;
  aerialMeters: number;
  walkMeters: number;
  walkMinutes: number;
  walkLeaveFormatted: string;
  walkArriveFormatted: string;
  scooterMinutes: number;
  bestTotalMinutes: number;
  bestMode: 'bus' | 'walk';
  minutesSavedByBus: number;
  liveBusOptions: LiveBusOption[];
  nextTrainHeadwayMin: string;
}
