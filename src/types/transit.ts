export type Language = 'he' | 'en';

export type TimeMode = 'now' | 'depart_at' | 'arrive_by';

/**
 * Filter / optimize by which direction the user is traveling on the Dankal Red Line:
 * - 'any': Any Dankal station (R1, R2, R3)
 * - 'to_tlv_batyam': Heading West/South toward Tel Aviv / Jaffa / Bat Yam
 * - 'to_pt': Heading East toward Petah Tikva CBS (R1)
 * - 'to_kiryat_arye': Heading North/East toward Kiryat Arye (R2 / R3)
 */
export type DankalDirection =
  | 'any'
  | 'to_tlv_batyam'
  | 'to_pt'
  | 'to_kiryat_arye';

/**
 * "Run or Chill?" urgency level for catching a live/scheduled bus:
 * - 'chill': 3+ minutes spare before you even need to start walking
 * - 'leave_now': Start walking now (0–2 minutes spare)
 * - 'brisk': Tight connection (-1 minute spare — walk briskly/jog)
 */
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
  spareMinutesToWalk: number; // waitMinutes - walkToBusMinutes
  urgency: UrgencyLevel;
  nextBackupBusMinutesLater: number | null; // e.g. "Next bus in +4 min if missed"
  nextBackupBusLine: string | null;
  leaveHomeFormatted: string; // HH:MM when user should start walking
  etaFormatted: string; // HH:MM when bus arrives at origin stop
  arriveStationFormatted: string; // HH:MM when user reaches the Dankal platform
  rideMinutes: number;
  alightStopId: string;
  alightStopNameHe: string;
  alightStopNameEn: string;
  alightStopLat: number;
  alightStopLon: number;
  entranceHintHe: string | null; // e.g. "כניסה A" / "צמוד לכניסה"
  entranceHintEn: string | null; // e.g. "Entrance A" / "Direct entrance"
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
