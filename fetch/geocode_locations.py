#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import requests

ROOT = Path(__file__).parent.parent
DATA_DIR = ROOT / "public" / "data"
ACTIVITIES_PATH = DATA_DIR / "activities.json"
CACHE_PATH = DATA_DIR / "location_cache.json"


def load_json(path: Path, default):
    if not path.exists():
        return default
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def save_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, separators=(",", ":"))


def start_coord(activity_id: int) -> tuple[float, float] | None:
    detail_path = DATA_DIR / f"activity_{activity_id}.json"
    detail = load_json(detail_path, {})
    coords = detail.get("gpxCoords") or []
    if not coords:
        return None
    lat, lon = coords[0]
    try:
        return float(lat), float(lon)
    except (TypeError, ValueError):
        return None


def cache_key(lat: float, lon: float) -> str:
    # ~100 m precision: enough to identify the departure area and high cache hit rate.
    return f"{lat:.3f},{lon:.3f}"


def reverse_geocode(lat: float, lon: float) -> dict:
    response = requests.get(
        "https://nominatim.openstreetmap.org/reverse",
        params={
            "format": "jsonv2",
            "lat": f"{lat:.6f}",
            "lon": f"{lon:.6f}",
            "zoom": 10,
            "addressdetails": 1,
            "accept-language": "es",
        },
        headers={
            "User-Agent": "MostlyZ2 local activity geocoder (personal use)",
        },
        timeout=30,
    )
    response.raise_for_status()
    data = response.json()
    address = data.get("address") or {}
    city = (
        address.get("city")
        or address.get("town")
        or address.get("village")
        or address.get("municipality")
        or address.get("county")
    )
    region = address.get("state") or address.get("region") or address.get("province")
    country = address.get("country")
    country_code = (address.get("country_code") or "").upper() or None
    parts = [part for part in [city, region, country] if part]
    return {
        "city": city,
        "region": region,
        "country": country,
        "countryCode": country_code,
        "label": ", ".join(parts) or data.get("display_name"),
        "lat": round(lat, 6),
        "lon": round(lon, 6),
    }


def apply_location(activity: dict, location: dict) -> bool:
    current = activity.get("startLocation")
    if current == location:
        return False
    activity["startLocation"] = location
    detail_path = DATA_DIR / f"activity_{activity['id']}.json"
    detail = load_json(detail_path, {})
    if detail:
        detail["startLocation"] = location
        save_json(detail_path, detail)
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract departure city/region/country from activity start coordinates")
    parser.add_argument("--limit", type=int, default=None, help="Maximum uncached coordinates to geocode")
    parser.add_argument("--sleep", type=float, default=1.05, help="Delay between external geocoding requests")
    args = parser.parse_args()

    activities = load_json(ACTIVITIES_PATH, [])
    cache = load_json(CACHE_PATH, {})
    changed = 0
    requested = 0

    for activity in activities:
        coord = start_coord(int(activity["id"]))
        if not coord:
            continue
        lat, lon = coord
        key = cache_key(lat, lon)
        location = cache.get(key)
        if not location:
            if args.limit is not None and requested >= args.limit:
                continue
            location = reverse_geocode(lat, lon)
            cache[key] = location
            requested += 1
            save_json(CACHE_PATH, cache)
            print(f"Geocoded {key}: {location.get('label')}")
            time.sleep(args.sleep)
        if apply_location(activity, location):
            changed += 1

    save_json(ACTIVITIES_PATH, activities)
    save_json(CACHE_PATH, cache)
    print(f"Locations updated: {changed}. New geocoding requests: {requested}. Cache entries: {len(cache)}.")


if __name__ == "__main__":
    main()
