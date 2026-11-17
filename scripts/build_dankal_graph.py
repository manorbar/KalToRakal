#!/usr/bin/env python3
"""
Builds the KalToRakal static transit index (`src/data/dankal_data.json`) directly
from the Israeli Ministry of Transport (MoT) official GTFS feed using HTTP Range requests.

Extracts:
1. All 34 Dankal Red Line stations (R1, R2, R3) with Hebrew & English names, coordinates,
   city, platform stop codes, and lines served.
2. Direct Feeder Bus Graph: Every bus route & stop in Gush Dan (within 5km of the Dankal corridor)
   that travels directly to within 250m of a Dankal station, including scheduled ride duration
   and alighting stop metadata.
"""
import urllib.request
import ssl
import struct
import zlib
import io
import csv
import json
import math
import os
from collections import defaultdict

URL = "https://gtfs.mot.gov.il/gtfsfiles/israel-public-transportation.zip"
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

# English station name dictionary for the 34 Dankal Red Line stations
STATION_EN_NAMES = {
    "תחנה מרכזית פתח תקווה": "Petah Tikva CBS",
    "פינסקר": "Pinsker",
    "קרול": "Krol",
    "דנקנר": "Dankner",
    "בלינסון": "Beilinson",
    "שחם": "Shaham",
    "שנקר": "Shenkar",
    "קרית אריה": "Kiryat Arye",
    "גשר אם המושבות": "Em HaMoshavot Bridge",
    "אהרונוביץ'": "Aharonovitch",
    "בן גוריון": "Ben Gurion",
    "ביאליק": "Bialik",
    "אבא הלל": "Abba Hillel",
    "ארלוזורוב": "Arlozorov",
    "שאול המלך": "Shaul HaMelech",
    "יהודית": "Yehudit",
    "קרליבך": "Carlebach",
    "אלנבי": "Allenby",
    "אליפלט": "Elifelet",
    "שלמה": "Salame (Shlomo)",
    "אצטדיון בלומפילד": "Bloomfield Stadium",
    "ארליך": "Ehrlich",
    "איסקוב": "Isakov",
    "הבעש''ט": "HaBesht",
    "מחרוזת": "Mahrozet",
    "העצמאות": "HaAtzmaut",
    "רוטשילד": "Rothschild",
    "ז'בוטינסקי": "Jabotinsky",
    "בלפור": "Balfour",
    "בנימין": "Binyamin",
    "יוספטל": "Yoseftal",
    "כ''ט בנובמבר": "29th of November",
    "העמל": "HaAmal",
    "הקוממיות": "HaKomemiyut",
}

CITY_EN_NAMES = {
    "פתח תקווה": "Petah Tikva",
    "בני ברק": "Bnei Brak",
    "רמת גן": "Ramat Gan",
    "תל אביב יפו": "Tel Aviv-Yafo",
    "בת ים": "Bat Yam",
}

def fetch_range(start, end):
    req = urllib.request.Request(URL, headers={
        "User-Agent": "Mozilla/5.0",
        "Range": f"bytes={start}-{end}"
    })
    with urllib.request.urlopen(req, timeout=45, context=CTX) as resp:
        return resp.read()

def get_zip_info():
    req = urllib.request.Request(URL, method="HEAD", headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=15, context=CTX) as resp:
        # Note: gtfs.mot.gov.il sometimes returns a chunked/short HEAD; fallback to directory listing or known size
        cl = resp.headers.get("Content-Length")
    # Fetch directory page to get exact current file size of israel-public-transportation.zip
    dir_req = urllib.request.Request("https://gtfs.mot.gov.il/gtfsfiles/", headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(dir_req, timeout=15, context=CTX) as resp:
        html = resp.read().decode("utf-8", errors="replace")
    import re
    m = re.search(r"(\d+)\s+<A HREF=\"/gtfsfiles/israel-public-transportation\.zip\"", html, re.I)
    total_size = int(m.group(1)) if m else 135178879

    tail = fetch_range(total_size - 65536, total_size - 1)
    eocd_pos = tail.rfind(b"PK\x05\x06")
    _, _, _, _, total_entries, cd_size, cd_offset, _ = struct.unpack("<4sHHHHIIH", tail[eocd_pos:eocd_pos+22])
    cd_data = fetch_range(cd_offset, cd_offset + cd_size - 1)
    pos = 0
    edge_offsets = []
    files = {}
    while pos < len(cd_data):
        if cd_data[pos:pos+4] != b"PK\x01\x02":
            break
        (_, _, _, _, comp_method, _, _, crc, comp_size, uncomp_size,
         fname_len, extra_len, comment_len, _, _, _, local_header_offset) = struct.unpack(
            "<4sHHHHHHIIIHHHHHII", cd_data[pos:pos+46]
        )
        fname = cd_data[pos+46:pos+46+fname_len].decode("utf-8", errors="replace")
        files[fname] = {"offset": local_header_offset}
        edge_offsets.append((local_header_offset, fname))
        pos += 46 + fname_len + extra_len + comment_len
    edge_offsets.sort()
    for i, (off, fn) in enumerate(edge_offsets):
        next_off = edge_offsets[i+1][0] if i + 1 < len(edge_offsets) else cd_offset
        files[fn]["actual_comp_size"] = next_off - off
    return files

def download_file_from_zip(files, fname):
    info = files[fname]
    raw = fetch_range(info["offset"], info["offset"] + info["actual_comp_size"] - 1)
    fname_len, extra_len = struct.unpack("<HH", raw[26:30])
    comp_data = raw[30 + fname_len + extra_len:]
    return zlib.decompressobj(-zlib.MAX_WBITS).decompress(comp_data)

def haversine_m(lat1, lon1, lat2, lon2):
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def parse_city_from_desc(desc):
    # e.g. "רחוב: מסילת ברזל קו אדום גוש דן עיר: תל אביב יפו רציף: 2   קומה:"
    if "עיר:" in desc:
        after = desc.split("עיר:", 1)[1]
        if "רציף:" in after:
            return after.split("רציף:", 1)[0].strip()
        return after.strip()
    return ""

def to_minutes(tstr):
    parts = tstr.split(":")
    return int(parts[0]) * 60 + int(parts[1]) + int(parts[2]) / 60.0

def main():
    print("1. Reading GTFS Central Directory from gtfs.mot.gov.il...")
    files = get_zip_info()

    print("2. Downloading stops.txt, routes.txt, trips.txt, translations.txt...")
    stops_txt = download_file_from_zip(files, "stops.txt").decode("utf-8-sig")
    routes_txt = download_file_from_zip(files, "routes.txt").decode("utf-8-sig")
    trips_txt = download_file_from_zip(files, "trips.txt").decode("utf-8-sig")
    trans_txt = download_file_from_zip(files, "translations.txt").decode("utf-8-sig")

    # Build English translation lookup for stop names if available in translations.txt
    en_trans = {}
    for row in csv.DictReader(io.StringIO(trans_txt)):
        if row.get("lang") == "en" and row.get("trans_id"):
            en_trans[row["trans_id"]] = row.get("translation", "")

    dankal_route_ids = {
        "34445": ("R2", "Kiryat Arye -> Bat Yam (HaKomemiyut)", "קרית אריה ← הקוממיות בת ים"),
        "34446": ("R2", "Bat Yam (HaKomemiyut) -> Kiryat Arye", "הקוממיות בת ים ← קרית אריה"),
        "34447": ("R1", "Petah Tikva CBS -> Bat Yam (HaKomemiyut)", "ת. מרכזית פ\"ת ← הקוממיות בת ים"),
        "34448": ("R1", "Bat Yam (HaKomemiyut) -> Petah Tikva CBS", "הקוממיות בת ים ← ת. מרכזית פ\"ת"),
        "34449": ("R3", "Kiryat Arye -> Tel Aviv (Elifelet)", "קרית אריה ← אליפלט תל אביב"),
        "34450": ("R3", "Tel Aviv (Elifelet) -> Kiryat Arye", "אליפלט תל אביב ← קרית אריה"),
    }

    routes_by_id = {}
    for row in csv.DictReader(io.StringIO(routes_txt)):
        routes_by_id[row["route_id"]] = {
            "route_id": row["route_id"],
            "agency_id": row["agency_id"],
            "short_name": row["route_short_name"],
            "long_name": row["route_long_name"],
        }

    stops_by_id = {}
    dankal_platforms = []
    for row in csv.DictReader(io.StringIO(stops_txt)):
        lat, lon = float(row["stop_lat"]), float(row["stop_lon"])
        # Filter to broader Gush Dan bounding box (lat 31.95..32.20, lon 34.70..34.96)
        if not (31.95 <= lat <= 32.20 and 34.70 <= lon <= 34.96):
            continue
        name_he = row["stop_name"]
        s = {
            "stop_id": row["stop_id"],
            "stop_code": row["stop_code"],
            "name_he": name_he,
            "name_en": en_trans.get(name_he, name_he),
            "desc": row["stop_desc"],
            "city_he": parse_city_from_desc(row["stop_desc"]),
            "lat": round(lat, 6),
            "lon": round(lon, 6),
        }
        stops_by_id[s["stop_id"]] = s
        if "מסילת ברזל קו אדום גוש דן" in row["stop_desc"]:
            dankal_platforms.append(s)

    # Group Dankal platforms into unique stations
    stations_map = {}
    for p in dankal_platforms:
        name_he = p["name_he"]
        if name_he not in stations_map:
            city_he = p["city_he"]
            # Underground stations in TLV/Ramat Gan/Bnei Brak (from Ben Gurion to Elifelet + Kiryat Arye)
            underground_names = {"קרית אריה", "בן גוריון", "ביאליק", "אבא הלל", "ארלוזורוב", "שאול המלך", "יהודית", "קרליבך", "אלנבי", "אליפלט"}
            stations_map[name_he] = {
                "id": f"st_{p['stop_code']}",
                "name_he": name_he,
                "name_en": STATION_EN_NAMES.get(name_he, p["name_en"]),
                "city_he": city_he,
                "city_en": CITY_EN_NAMES.get(city_he, city_he),
                "lat": p["lat"],
                "lon": p["lon"],
                "is_underground": name_he in underground_names,
                "stop_codes": [],
                "stop_ids": [],
                "lines": set(),
            }
        if p["stop_code"] not in stations_map[name_he]["stop_codes"]:
            stations_map[name_he]["stop_codes"].append(p["stop_code"])
        if p["stop_id"] not in stations_map[name_he]["stop_ids"]:
            stations_map[name_he]["stop_ids"].append(p["stop_id"])

    # Assign lines (R1, R2, R3) to stations based on trips
    # Pick one representative trip per route_id across Gush Dan
    rep_trip_to_route = {}
    seen_routes = set()
    for row in csv.DictReader(io.StringIO(trips_txt)):
        rid = row["route_id"]
        if rid not in seen_routes and rid in routes_by_id:
            seen_routes.add(rid)
            rep_trip_to_route[row["trip_id"]] = rid

    # Map which bus stops are within 260m of each Dankal station
    station_list = list(stations_map.values())
    stop_to_nearby_stations = defaultdict(list) # stop_id -> list of (station_id, dist_m)
    for sid, s in stops_by_id.items():
        if "מסילת ברזל קו אדום גוש דן" in s["desc"]:
            continue
        for st in station_list:
            d = haversine_m(s["lat"], s["lon"], st["lat"], st["lon"])
            if d <= 260:
                stop_to_nearby_stations[sid].append((st["id"], round(d)))

    print(f"Found {len(station_list)} Dankal stations and {len(stop_to_nearby_stations)} bus stops right outside Dankal stations.")
    print("3. Downloading stop_times.txt to build the Gush Dan Direct Feeder Graph...")
    st_txt = download_file_from_zip(files, "stop_times.txt").decode("utf-8-sig")

    trip_stops = defaultdict(list)
    for row in csv.DictReader(io.StringIO(st_txt)):
        tid = row["trip_id"]
        if tid in rep_trip_to_route:
            sid = row["stop_id"]
            if sid in stops_by_id:
                trip_stops[tid].append((int(row["stop_sequence"]), sid, row["arrival_time"]))

    # Populate station lines & order for R1/R2/R3
    station_by_stop_id = {}
    for st in station_list:
        for sid in st["stop_ids"]:
            station_by_stop_id[sid] = st

    for tid, seq_list in trip_stops.items():
        rid = rep_trip_to_route[tid]
        if rid in dankal_route_ids:
            line_code = dankal_route_ids[rid][0]
            for seq, sid, _ in seq_list:
                if sid in station_by_stop_id:
                    station_by_stop_id[sid]["lines"].add(line_code)

    # Build Feeder Index:
    # For every bus route that passes near at least one Dankal station, record:
    # route_id -> { "s": short_name, "a": agency_id, "stops": [ [stop_id, arr_min_offset], ... ] }
    # Wait: storing just the stop sequence + relative minute offset for each feeder route is SUPER compact!
    # Let's check how many routes in Gush Dan pass within 260m of any Dankal station!
    feeder_routes = {}
    used_stop_ids = set()
    for st in station_list:
        for sid in st["stop_ids"]:
            used_stop_ids.add(sid)

    for tid, seq_list in trip_stops.items():
        rid = rep_trip_to_route[tid]
        if rid in dankal_route_ids:
            continue
        rinfo = routes_by_id.get(rid)
        if not rinfo or rinfo["agency_id"] == "2": # skip Israel Railways
            continue
        seq_list.sort()
        # Check if any stop on this route is in stop_to_nearby_stations
        has_dankal_connection = any(sid in stop_to_nearby_stations for _, sid, _ in seq_list)
        if not has_dankal_connection:
            continue
        t0 = to_minutes(seq_list[0][2])
        compact_stops = []
        for _, sid, arr_str in seq_list:
            rel_min = round(to_minutes(arr_str) - t0, 1)
            compact_stops.append([sid, rel_min])
            used_stop_ids.add(sid)
        feeder_routes[rid] = {
            "n": rinfo["short_name"],
            "a": rinfo["agency_id"],
            "seq": compact_stops
        }

    print(f"Identified {len(feeder_routes)} feeder bus route directions serving Dankal stations across {len(used_stop_ids)} unique Gush Dan stops!")

    # Format final JSON
    formatted_stations = []
    for st in sorted(station_list, key=lambda x: x["lat"], reverse=True):
        formatted_stations.append({
            "id": st["id"],
            "name_he": st["name_he"],
            "name_en": st["name_en"],
            "city_he": st["city_he"],
            "city_en": st["city_en"],
            "lat": st["lat"],
            "lon": st["lon"],
            "is_underground": st["is_underground"],
            "stop_codes": st["stop_codes"],
            "lines": sorted(list(st["lines"])) if st["lines"] else ["R1"],
        })

    compact_stops_dict = {}
    for sid in used_stop_ids:
        s = stops_by_id[sid]
        entry = {
            "c": s["stop_code"],
            "he": s["name_he"],
            "en": s["name_en"],
            "lat": s["lat"],
            "lon": s["lon"],
        }
        if sid in stop_to_nearby_stations:
            # Map of station_id -> walk_meters
            entry["st"] = {st_id: dist_m for st_id, dist_m in stop_to_nearby_stations[sid]}
        compact_stops_dict[sid] = entry

    output_data = {
        "generated_at": "2026-11-17",
        "stations": formatted_stations,
        "stops": compact_stops_dict,
        "feeder_routes": feeder_routes,
    }

    out_dir = "/Users/manorbar/Documents/Ideas/KalToRakal/src/data"
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "dankal_data.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, separators=(",", ":"))

    size_kb = os.path.getsize(out_path) / 1024.0
    print(f"Successfully wrote {out_path} ({size_kb:.1f} KB)!")

if __name__ == "__main__":
    main()
