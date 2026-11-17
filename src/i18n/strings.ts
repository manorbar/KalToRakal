import { Language } from '../types/transit';

export interface Translations {
  appTitle: string;
  appSubtitle: string;
  useMyGps: string;
  gpsActive: string;
  presetLocations: string;
  kStationsLabel: string;
  refreshLive: string;
  loadingLive: string;
  fastestOption: string;
  underground: string;
  surface: string;
  walkDirect: string;
  scooterBike: string;
  liveFeederBuses: string;
  scheduledFeederBuses: string;
  noDirectBusesNow: string;
  walkToStop: string;
  boardLine: string;
  arrivesIn: string;
  departsAt: string;
  leaveAt: string;
  arrivePlatformAt: string;
  rideDuration: string;
  alightAt: string;
  walkToStation: string;
  totalTime: string;
  minUnit: string;
  metersUnit: string;
  now: string;
  savesMinutes: string;
  dankalFreq: string;
  sortByFastest: string;
  sortByDistance: string;
  customCoords: string;
  dataSourceFooter: string;
  modeLeaveNow: string;
  modeDepartAt: string;
  modeArriveBy: string;
  targetTimeLabel: string;
  liveBadge: string;
  scheduledBadge: string;
  openInMaps: string;
  walkToBusNav: string;
  done: string;
  changeOrigin: string;
  dirAny: string;
  dirTlvBatYam: string;
  dirPetahTikva: string;
  dirKiryatArye: string;
  urgencyChill: string;
  urgencyLeaveNow: string;
  urgencyBrisk: string;
  backupBusHint: string;
}

export const STRINGS: Record<Language, Translations> = {
  he: {
    appTitle: 'קל לרק"ל',
    appSubtitle: 'הדרך המהירה ביותר לקו האדום של דנקל',
    useMyGps: 'מיקום נוכחי',
    gpsActive: 'GPS פעיל',
    presetLocations: 'בחר נקודת מוצא בגוש דן:',
    kStationsLabel: 'תחנות דנקל:',
    refreshLive: 'רענן',
    loadingLive: 'מחשב מסלולים בזמן אמת...',
    fastestOption: 'הכי מהיר',
    underground: 'תת-קרקעית',
    surface: 'עילית',
    walkDirect: 'הליכה ישירה',
    scooterBike: 'קורקינט / אופניים',
    liveFeederBuses: 'אוטובוסים ישירים בזמן אמת:',
    scheduledFeederBuses: 'אוטובוסים מתוכננים לפי לו"ז:',
    noDirectBusesNow: 'אין אוטובוס ישיר בחלון הזמן שנבחר (מומלץ הליכה / קורקינט)',
    walkToStop: 'הליכה לתחנה',
    boardLine: 'קו',
    arrivesIn: 'בעוד',
    departsAt: 'בשעה',
    leaveAt: 'צא ב-',
    arrivePlatformAt: 'ברציף ב-',
    rideDuration: 'נסיעה',
    alightAt: 'ירידה ב-',
    walkToStation: 'לדנקל',
    totalTime: 'סה"כ',
    minUnit: "דק'",
    metersUnit: "מ'",
    now: 'כעת!',
    savesMinutes: 'חוסך {m} דק\'',
    dankalFreq: 'רכבת כל 3.5–6 דק\'',
    sortByFastest: 'הכי מהיר',
    sortByDistance: 'הכי קרוב',
    customCoords: 'נקודת מוצא',
    dataSourceFooter: 'נתוני אמת ממשרד התחבורה (GTFS + SIRI)',
    modeLeaveNow: 'צא עכשיו',
    modeDepartAt: 'שעת יציאה',
    modeArriveBy: 'שעת הגעה',
    targetTimeLabel: 'זמן מבוקש:',
    liveBadge: 'זמן אמת',
    scheduledBadge: 'לו"ז',
    openInMaps: 'נווט לתחנה',
    walkToBusNav: 'נווט לתחנת האוטובוס',
    done: 'סיום',
    changeOrigin: 'החלף מוצא',
    dirAny: 'כל הכיוונים',
    dirTlvBatYam: 'לת"א / בת-ים',
    dirPetahTikva: 'לפ"ת (R1)',
    dirKiryatArye: 'לקריית אריה (R2/R3)',
    urgencyChill: 'צא בעוד {m} דק\' (בנחת)',
    urgencyLeaveNow: 'צא עכשיו לתחנה',
    urgencyBrisk: 'הליכה מהירה! (צא מיד)',
    backupBusHint: 'גיבוי: קו {line} עוד +{m} דק\'',
  },
  en: {
    appTitle: 'KalToRakal',
    appSubtitle: 'Fastest routes to the Dankal Red Line',
    useMyGps: 'My GPS',
    gpsActive: 'GPS Active',
    presetLocations: 'Choose an origin in Gush Dan:',
    kStationsLabel: 'Stations (k):',
    refreshLive: 'Refresh',
    loadingLive: 'Computing optimal routes...',
    fastestOption: 'Fastest',
    underground: 'Underground',
    surface: 'Surface',
    walkDirect: 'Direct Walk',
    scooterBike: 'Scooter / Bike',
    liveFeederBuses: 'Live direct feeder buses:',
    scheduledFeederBuses: 'Scheduled direct feeder buses:',
    noDirectBusesNow: 'No direct bus in this time window (walk/scooter recommended)',
    walkToStop: 'Walk to stop',
    boardLine: 'Line',
    arrivesIn: 'In',
    departsAt: 'At',
    leaveAt: 'Leave',
    arrivePlatformAt: 'On platform',
    rideDuration: 'Ride',
    alightAt: 'Alight',
    walkToStation: 'To Dankal',
    totalTime: 'Total',
    minUnit: 'min',
    metersUnit: 'm',
    now: 'Now!',
    savesMinutes: 'Saves {m}m',
    dankalFreq: 'Every 3.5–6 min',
    sortByFastest: 'Fastest',
    sortByDistance: 'Closest',
    customCoords: 'Origin',
    dataSourceFooter: 'Official Israeli MoT Data (GTFS + SIRI)',
    modeLeaveNow: 'Leave Now',
    modeDepartAt: 'Depart At',
    modeArriveBy: 'Arrive By',
    targetTimeLabel: 'Target time:',
    liveBadge: 'LIVE',
    scheduledBadge: 'SCHED',
    openInMaps: 'To Station',
    walkToBusNav: 'Walk to Bus Stop',
    done: 'Done',
    changeOrigin: 'Change Origin',
    dirAny: 'All Directions',
    dirTlvBatYam: 'To TLV / Bat Yam',
    dirPetahTikva: 'To Petah Tikva (R1)',
    dirKiryatArye: 'To Kiryat Arye (R2/R3)',
    urgencyChill: 'Leave in {m}m (Chill)',
    urgencyLeaveNow: 'Leave Now',
    urgencyBrisk: 'Walk Fast! (Tight)',
    backupBusHint: 'Backup: Line {line} in +{m}m',
  },
};

export interface PresetOrigin {
  id: string;
  name_he: string;
  name_en: string;
  lat: number;
  lon: number;
}

export const PRESET_ORIGINS: PresetOrigin[] = [
  {
    id: 'levi_eshkol_ono',
    name_he: 'דרך לוי אשכול/הרוגי מלכות בבל (קריית אונו)',
    name_en: 'Levi Eshkol / Harugei Malchut Bavel (Kiryat Ono)',
    lat: 32.05742,
    lon: 34.8644,
  },
  {
    id: 'dizengoff',
    name_he: 'דיזנגוף סנטר, ת"א',
    name_en: 'Dizengoff Center, TLV',
    lat: 32.0754,
    lon: 34.7749,
  },
  {
    id: 'rabin',
    name_he: 'כיכר רבין / העירייה, ת"א',
    name_en: 'Rabin Square, TLV',
    lat: 32.0809,
    lon: 34.7806,
  },
  {
    id: 'florentin',
    name_he: 'פלורנטין / לוינסקי, ת"א',
    name_en: 'Florentin / Levinsky, TLV',
    lat: 32.0598,
    lon: 34.7715,
  },
  {
    id: 'givatayim',
    name_he: 'כצנלסון / ויצמן, גבעתיים',
    name_en: 'Katznelson, Givatayim',
    lat: 32.0756,
    lon: 34.8087,
  },
  {
    id: 'ramat_gan',
    name_he: 'מרום נווה / הירדן, רמת גן',
    name_en: 'Marom Naveh, Ramat Gan',
    lat: 32.0695,
    lon: 34.8278,
  },
  {
    id: 'holon',
    name_he: 'קוגל / סוקולוב, חולון',
    name_en: 'Kugel / Sokolov, Holon',
    lat: 32.0211,
    lon: 34.7731,
  },
  {
    id: 'petah_tikva',
    name_he: 'כפר גנים / העצמאות, פ"ת',
    name_en: 'Kfar Ganim, Petah Tikva',
    lat: 32.0762,
    lon: 34.8765,
  },
];
