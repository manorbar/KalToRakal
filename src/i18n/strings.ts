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
  noDirectBusesNow: string;
  walkToStop: string;
  boardLine: string;
  arrivesIn: string;
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
}

export const STRINGS: Record<Language, Translations> = {
  he: {
    appTitle: 'קל לרק"ל',
    appSubtitle: 'הדרך המהירה ביותר לקו האדום של דנקל בגוש דן',
    useMyGps: 'מיקום נוכחי (GPS)',
    gpsActive: 'מתבסס על GPS',
    presetLocations: 'או בחר נקודת מוצא לבדיקה:',
    kStationsLabel: 'מספר תחנות דנקל להשוואה (k):',
    refreshLive: 'רענן זמן אמת',
    loadingLive: 'מושך נתוני אמת (SIRI)...',
    fastestOption: 'הכי מהיר כרגע',
    underground: 'תת-קרקעית',
    surface: 'עילית',
    walkDirect: 'הליכה ישירה',
    scooterBike: 'קורקינט / אופניים',
    liveFeederBuses: 'אוטובוסים ישירים בזמן אמת לתחנה זו:',
    noDirectBusesNow: 'אין אוטובוס ישיר בדקות הקרובות (מומלץ הליכה / קורקינט)',
    walkToStop: 'הליכה לתחנת האוטובוס',
    boardLine: 'עלה על קו',
    arrivesIn: 'מגיע בעוד',
    rideDuration: 'נסיעה',
    alightAt: 'רד ב-',
    walkToStation: 'הליכה לדנקל',
    totalTime: 'סה"כ עד הרציף',
    minUnit: "דק'",
    metersUnit: "מ'",
    now: 'כעת!',
    savesMinutes: 'חוסך ~{m} דק\' לעומת הליכה',
    dankalFreq: 'תדירות רכבות: כל 3.5–6 דק\'',
    sortByFastest: 'מיון: הכי מהיר',
    sortByDistance: 'מיון: הכי קרוב',
    customCoords: 'נקודת מוצא פעילה',
    dataSourceFooter: 'נתוני אמת ממשרד התחבורה (GTFS + SIRI) • 100% חינם וללא פרסומות',
  },
  en: {
    appTitle: 'KalToRakal',
    appSubtitle: 'Fastest live routes to the Dankal Red Line in Central Israel',
    useMyGps: 'Use My GPS',
    gpsActive: 'Using Live GPS',
    presetLocations: 'Or test from a Central Israel spot:',
    kStationsLabel: 'Nearest Dankal stations (k):',
    refreshLive: 'Refresh Live',
    loadingLive: 'Fetching live SIRI arrivals...',
    fastestOption: 'Fastest Right Now',
    underground: 'Underground',
    surface: 'Surface',
    walkDirect: 'Direct Walk',
    scooterBike: 'Scooter / Bike',
    liveFeederBuses: 'Live direct feeder buses to this station:',
    noDirectBusesNow: 'No direct feeder bus in the next few mins (walk/scooter recommended)',
    walkToStop: 'Walk to bus stop',
    boardLine: 'Take Line',
    arrivesIn: 'Arrives in',
    rideDuration: 'Ride',
    alightAt: 'Alight at',
    walkToStation: 'Walk to Dankal',
    totalTime: 'Total to platform',
    minUnit: 'min',
    metersUnit: 'm',
    now: 'Now!',
    savesMinutes: 'Saves ~{m} min vs walking',
    dankalFreq: 'Trains every 3.5–6 min',
    sortByFastest: 'Sort: Fastest ETA',
    sortByDistance: 'Sort: Closest Distance',
    customCoords: 'Active Origin',
    dataSourceFooter: 'Live Israeli MoT Data (GTFS + SIRI) • 100% Free & Open',
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
    name_en: 'Katznelson / Weizmann, Givatayim',
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
