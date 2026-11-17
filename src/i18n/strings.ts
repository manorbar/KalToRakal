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
  backToStations: string;
  activeJourneyTitle: string;
  step1WalkToBus: string;
  step2WaitAndBoard: string;
  step3RideStops: string;
  step4AlightAndWalk: string;
  step5BoardDankal: string;
  stopCodeLabel: string;
  showStopsCount: string;
  hideStopsCount: string;
  startWalkingInMaps: string;
  navigateToStationMaps: string;
  tapForTravelScreen: string;
  startLiveTrackingBtn: string;
  stopLiveTrackingBtn: string;
  simulateRideBtn: string;
  trackingActiveBanner: string;
  stopsRemainingLabel: string;
  prepareToGetOffAlertTitle: string;
  prepareToGetOffAlertBody: string;
  getOffNowAlertTitle: string;
  getOffNowAlertBody: string;
  reachedDankalTitle: string;
  reachedDankalBody: string;
  passedStopStatus: string;
  nextStopStatus: string;
  getOffHereBadge: string;
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
    backToStations: 'חזרה לכל התחנות',
    activeJourneyTitle: 'מסלול נסיעה לדנקל',
    step1WalkToBus: 'הליכה לתחנת האוטובוס',
    step2WaitAndBoard: 'עלייה על קו {line} ({agency})',
    step3RideStops: 'נסיעה של {m} דק\' ({s} תחנות)',
    step4AlightAndWalk: 'ירידה ב-{stop} והליכה לדנקל',
    step5BoardDankal: 'רציף דנקל {station}',
    stopCodeLabel: 'מק"ט תחנה',
    showStopsCount: 'הצג {s} תחנות ביניים',
    hideStopsCount: 'הסתר תחנות ביניים',
    startWalkingInMaps: 'נווט בהליכה לתחנת האוטובוס',
    navigateToStationMaps: 'פתח ניווט לתחנת הדנקל',
    tapForTravelScreen: 'לחץ לפירוט מסלול ומעקב חי ‹',
    startLiveTrackingBtn: 'הפעל מעקב חי והתראת ירידה 🔔',
    stopLiveTrackingBtn: 'עצור מעקב חי',
    simulateRideBtn: 'הדמיית נסיעה ⚡',
    trackingActiveBanner: 'מעקב GPS פעיל • נתריע לך תחנה לפני הירידה',
    stopsRemainingLabel: 'נותרו {s} תחנות לירידה',
    prepareToGetOffAlertTitle: '🔔 היכונו לירידה בתחנה הבאה!',
    prepareToGetOffAlertBody: 'התחנה הבאה היא {stop}. שם יורדים לדנקל {station}.',
    getOffNowAlertTitle: '🛑 רד עכשיו מהאוטובוס!',
    getOffNowAlertBody: 'הגעת ל-{stop}! הולכים {m} מ\' לרציף דנקל {station}.',
    reachedDankalTitle: '🎉 הגעת לתחנת דנקל {station}!',
    reachedDankalBody: 'נסיעה טובה בקו האדום!',
    passedStopStatus: 'עברנו',
    nextStopStatus: 'התחנה הבאה',
    getOffHereBadge: 'יורדים כאן!',
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
    backToStations: 'All Stations',
    activeJourneyTitle: 'Live Route to Dankal',
    step1WalkToBus: 'Walk to Bus Stop',
    step2WaitAndBoard: 'Board Line {line} ({agency})',
    step3RideStops: 'Ride {m} min ({s} stops)',
    step4AlightAndWalk: 'Get off at {stop} & walk to Dankal',
    step5BoardDankal: 'Dankal {station} Platform',
    stopCodeLabel: 'Stop #',
    showStopsCount: 'Show {s} stops along the way',
    hideStopsCount: 'Hide intermediate stops',
    startWalkingInMaps: 'Start Walking to Bus Stop in Maps',
    navigateToStationMaps: 'Open Directions to Dankal Station',
    tapForTravelScreen: 'Tap for live route & get-off alerts ›',
    startLiveTrackingBtn: 'Start Live Tracking & Get-Off Alerts 🔔',
    stopLiveTrackingBtn: 'Stop Tracking',
    simulateRideBtn: 'Simulate Ride ⚡',
    trackingActiveBanner: 'Live GPS Tracking • Alerting 1 stop before exit',
    stopsRemainingLabel: '{s} stops left until exit',
    prepareToGetOffAlertTitle: '🔔 Get Ready! Next Stop is Yours',
    prepareToGetOffAlertBody: 'Next stop is {stop}. Get off there for Dankal {station}.',
    getOffNowAlertTitle: '🛑 Get Off the Bus Now!',
    getOffNowAlertBody: 'Arrived at {stop}! Walk {m}m to Dankal {station}.',
    reachedDankalTitle: '🎉 Arrived at Dankal {station}!',
    reachedDankalBody: 'Have a great ride on the Red Line!',
    passedStopStatus: 'Passed',
    nextStopStatus: 'Next Stop',
    getOffHereBadge: 'GET OFF HERE',
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
