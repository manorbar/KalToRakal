# KalToRakal (קל לרק"ל)

A native iOS, Android, and Web app built with **React Native (Expo)** that finds the fastest real-time way to reach the nearest **Dankal Red Line (`R1`, `R2`, `R3`)** stations in Central Israel (Gush Dan).

## Features
- **100% Free & Open Israeli Transit Data:** Powered by official Ministry of Transport (MoT) GTFS static data (`gtfs.mot.gov.il`) and live SIRI stop monitoring (`curlbus.app`).
- **Pre-Computed Gush Dan Feeder Graph (`src/data/dankal_data.json`):** Bundles all 34 Dankal stations (from Petah Tikva & Kiryat Arye through Bnei Brak, Ramat Gan, Tel Aviv-Yafo, and Bat Yam) and 921 direct feeder bus route directions across 4,225 Gush Dan bus stops in under 1 MB.
- **Smart $k$-Nearest Station Comparison:** Ranks the $k$ nearest Dankal stations by **live total door-to-platform time** (comparing walking to a nearby bus stop + live SIRI wait time + bus ride duration + walk to station entrance vs. direct walking or bike/scooter).
- **Bilingual (Hebrew RTL + English LTR):** Instant toggle between Hebrew (`עב`) and English (`EN`).

## Running the App

Make sure Homebrew's `node` is in your `PATH`:

```bash
export PATH="/opt/homebrew/bin:$PATH"

# Start Expo (scan QR code with Expo Go on iOS/Android, or press i / a / w)
npm start
```

## Updating the Transit Dataset

To refresh `src/data/dankal_data.json` from the Israeli Ministry of Transport's daily GTFS feed (uses HTTP Range requests to download only the required tables in ~3 seconds):

```bash
python3 scripts/build_dankal_graph.py
```
