#!/usr/bin/env python3
"""
Builds the KalToRakal static transit index (`src/data/dankal_data.json`) directly
from the Israeli Ministry of Transport (MoT) official GTFS feed using HTTP Range requests.

Extracts:
1. All 34 Dankal Red Line stations (R1, R2, R3) ordered along the corridor for map polyline rendering,
   with Hebrew & English names, coordinates, city, platform stop codes, and lines served.
2. Direct Feeder Bus Graph: Every bus route & stop in Gush Dan that travels directly to within 260m
   of a Dankal station, including:
   - Stop sequences & relative travel time offsets (`seq`)
   - Weekday scheduled departure times from the route's first stop (`deps`, in minutes from midnight)
     so the app can compute exact "Depart At" and "Arrive By" plans for any time of day!
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
import re
from collections import defaultdict

URL = "https://gtfs.mot.gov.il/gtfsfiles/israel-public-transportation.zip"
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

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
    dir_req = urllib.request.Request("https://gtfs.mot.gov.il/gtfsfiles/", headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(dir_req, timeout=15, context=CTX) as resp:
        html = resp.read().decode("utf-8", errors="replace")
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

    print("2. Downloading stops.txt, routes.txt, trips.txt, calendar.txt, translations.txt...")
    stops_txt = download_file_from_zip(files, "stops.txt").decode("utf-8-sig")
    routes_txt = download_file_from_zip(files, "routes.txt").decode("utf-8-sig")
    trips_txt = download_file_from_zip(files, "trips.txt").decode("utf-8-sig")
    cal_txt = download_file_from_zip(files, "calendar.txt").decode("utf-8-sig")
    trans_txt = download_file_from_zip(files, "translations.txt").decode("utf-8-sig")

    en_trans = {}
    for row in csv.DictReader(io.StringIO(trans_txt)):
        if row.get("lang") == "en" and row.get("trans_id"):
            en_trans[row["trans_id"]] = row.get("translation", "")

    # Identify active weekday (Tuesday/Wednesday) service_ids so we collect a clean 1-day departure schedule per route
    weekday_services = set()
    for row in csv.DictReader(io.StringIO(cal_txt)):
        if row.get("tuesday") == "1" or row.get("wednesday") == "1":
            weekday_services.add(row["service_id"])

    dankal_route_ids = {
        "34445": "R2",
        "34446": "R2",
        "34447": "R1",
        "34448": "R1",
        "34449": "R3",
        "34450": "R3",
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

    stations_map = {}
    for p in dankal_platforms:
        name_he = p["name_he"]
        if name_he not in stations_map:
            city_he = p["city_he"]
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

    # Pick one representative trip per route_id AND map all weekday trips to their route_id
    rep_trip_to_route = {}
    seen_routes = set()
    weekday_trip_to_route = {}
    for row in csv.DictReader(io.StringIO(trips_txt)):
        rid = row["route_id"]
        tid = row["trip_id"]
        sid = row["service_id"]
        if rid not in routes_by_id:
            continue
        if rid not in seen_routes:
            seen_routes.add(rid)
            rep_trip_to_route[tid] = rid
        if sid in weekday_services:
            weekday_trip_to_route[tid] = rid

    station_list = list(stations_map.values())
    stop_to_nearby_stations = defaultdict(list)
    for sid, s in stops_by_id.items():
        if "מסילת ברזל קו אדום גוש דן" in s["desc"]:
            continue
        for st in station_list:
            d = haversine_m(s["lat"], s["lon"], st["lat"], st["lon"])
            if d <= 260:
                stop_to_nearby_stations[sid].append((st["id"], round(d)))

    print("3. Downloading stop_times.txt to build Feeder Graph + Daily Timetables...")
    st_txt = download_file_from_zip(files, "stop_times.txt").decode("utf-8-sig")

    trip_stops = defaultdict(list)
    route_departures = defaultdict(set) # route_id -> set of integer minutes from midnight (at stop_sequence=1)

    for row in csv.DictReader(io.StringIO(st_txt)):
        tid = row["trip_id"]
        seq = int(row["stop_sequence"])
        if seq == 1 and tid in weekday_trip_to_route:
            rid = weekday_trip_to_route[tid]
            route_departures[rid].add(round(to_minutes(row["departure_time"])))
        if tid in rep_trip_to_route:
            sid = row["stop_id"]
            if sid in stops_by_id:
                trip_stops[tid].append((seq, sid, row["arrival_time"]))

    station_by_stop_id = {}
    for st in station_list:
        for sid in st["stop_ids"]:
            station_by_stop_id[sid] = st

    r1_ordered_station_ids = []
    r2_branch_station_ids = []

    for tid, seq_list in trip_stops.items():
        rid = rep_trip_to_route[tid]
        if rid in dankal_route_ids:
            line_code = dankal_route_ids[rid]
            seq_list.sort()
            for seq, sid, _ in seq_list:
                if sid in station_by_stop_id:
                    st_obj = station_by_stop_id[sid]
                    st_obj["lines"].add(line_code)
                    if rid == "34447" and st_obj["id"] not in r1_ordered_station_ids:
                        r1_ordered_station_ids.append(st_obj["id"])
                    if rid == "34445" and seq <= 3 and st_obj["id"] not in r2_branch_station_ids:
                        r2_branch_station_ids.append(st_obj["id"])

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
        if not rinfo or rinfo["agency_id"] == "2":
            continue
        seq_list.sort()
        has_dankal_connection = any(sid in stop_to_nearby_stations for _, sid, _ in seq_list)
        if not has_dankal_connection:
            continue
        t0 = to_minutes(seq_list[0][2])
        compact_stops = []
        for _, sid, arr_str in seq_list:
            rel_min = round(to_minutes(arr_str) - t0, 1)
            compact_stops.append([sid, rel_min])
            used_stop_ids.add(sid)
        deps_sorted = sorted(list(route_departures.get(rid, [])))
        feeder_routes[rid] = {
            "n": rinfo["short_name"],
            "a": rinfo["agency_id"],
            "seq": compact_stops,
            "deps": deps_sorted,
        }

    formatted_stations = []
    station_by_id = {st["id"]: st for st in station_list}
    # Order stations along R1 (Petah Tikva -> Bat Yam) + Kiryat Arye branch
    ordered_all = []
    seen_st = set()
    for st_id in r1_ordered_station_ids + r2_branch_station_ids:
        if st_id in station_by_id and st_id not in seen_st:
            seen_st.add(st_id)
            ordered_all.append(station_by_id[st_id])
    for st in station_list:
        if st["id"] not in seen_st:
            ordered_all.append(st)

    for st in ordered_all:
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
            entry["st"] = {st_id: dist_m for st_id, dist_m in stop_to_nearby_stations[sid]}
        compact_stops_dict[sid] = entry

    output_data = {
        "generated_at": "2026-11-17",
        "r1_polyline_ids": r1_ordered_station_ids,
        "r2_branch_ids": r2_branch_station_ids,
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
    print(f"Successfully wrote {out_path} ({size_kb:.1f} KB) with daily departure timetables!")

if __name__ == "__main__":
    main()
