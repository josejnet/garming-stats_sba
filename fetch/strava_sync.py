from __future__ import annotations

import argparse
import json
import os
import secrets
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse

import requests
from dotenv import load_dotenv

from merge import load_json, save_json, write_merged


ROOT = Path(__file__).parent.parent
OUTPUT_DIR = ROOT / "public" / "data"
TOKEN_PATH = ROOT / ".strava_tokens.json"
CALLBACK_URL = "http://localhost:8765/callback"

load_dotenv(ROOT / ".env")


SPORT_MAP = {
    "Run": "running",
    "TrailRun": "running",
    "VirtualRun": "running",
    "Ride": "cycling",
    "MountainBikeRide": "cycling",
    "GravelRide": "cycling",
    "VirtualRide": "cycling",
    "EBikeRide": "cycling",
    "Swim": "swimming",
    "Walk": "walking",
    "Hike": "walking",
    "WeightTraining": "gym",
    "Workout": "gym",
    "Crossfit": "gym",
    "Elliptical": "gym",
    "Yoga": "gym",
    "Pilates": "gym",
}


def credentials() -> tuple[str, str]:
    client_id = (os.getenv("STRAVA_CLIENT_ID") or "").strip()
    client_secret = (os.getenv("STRAVA_CLIENT_SECRET") or "").strip()
    invalid = {"", "tu_client_id", "tu_client_secret"}
    if client_id in invalid or client_secret in invalid:
        raise SystemExit(
            "Set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET in .env first. "
            "Create the application at https://www.strava.com/settings/api"
        )
    return client_id, client_secret


def save_tokens(tokens: dict) -> None:
    safe = {
        "access_token": tokens["access_token"],
        "refresh_token": tokens["refresh_token"],
        "expires_at": tokens["expires_at"],
    }
    save_json(TOKEN_PATH, safe)


def authorize() -> dict:
    client_id, client_secret = credentials()
    state = secrets.token_urlsafe(24)
    result: dict[str, str] = {}

    class CallbackHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            params = parse_qs(urlparse(self.path).query)
            result["code"] = params.get("code", [""])[0]
            result["state"] = params.get("state", [""])[0]
            result["error"] = params.get("error", [""])[0]
            ok = bool(result["code"]) and result["state"] == state
            body = (
                "<h1>Strava conectado</h1><p>Ya puedes cerrar esta ventana.</p>"
                if ok
                else "<h1>No se pudo conectar Strava</h1><p>Vuelve a la terminal.</p>"
            )
            encoded = body.encode("utf-8")
            self.send_response(200 if ok else 400)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)

        def log_message(self, *_args):
            return

    query = urlencode(
        {
            "client_id": client_id,
            "redirect_uri": CALLBACK_URL,
            "response_type": "code",
            "approval_prompt": "auto",
            "scope": "activity:read_all",
            "state": state,
        }
    )
    url = f"https://www.strava.com/oauth/authorize?{query}"
    server = HTTPServer(("127.0.0.1", 8765), CallbackHandler)
    server.timeout = 180
    print("Opening Strava authorization in your browser...")
    print(f"If it does not open, visit: {url}")
    webbrowser.open(url)
    server.handle_request()
    server.server_close()

    if result.get("error"):
        raise SystemExit(f"Strava authorization was denied: {result['error']}")
    if not result.get("code") or result.get("state") != state:
        raise SystemExit("Strava authorization timed out or returned an invalid state.")

    response = requests.post(
        "https://www.strava.com/oauth/token",
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "code": result["code"],
            "grant_type": "authorization_code",
        },
        timeout=30,
    )
    response.raise_for_status()
    tokens = response.json()
    save_tokens(tokens)
    print("Strava authorization saved locally.")
    return tokens


def access_token(force_authorize: bool) -> str:
    tokens = authorize() if force_authorize else load_json(TOKEN_PATH, {})
    if not tokens:
        raise SystemExit("Run this command once with --authorize to connect Strava.")

    if int(tokens.get("expires_at") or 0) > int(time.time()) + 3600:
        return tokens["access_token"]

    client_id, client_secret = credentials()
    response = requests.post(
        "https://www.strava.com/oauth/token",
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "grant_type": "refresh_token",
            "refresh_token": tokens["refresh_token"],
        },
        timeout=30,
    )
    response.raise_for_status()
    tokens = response.json()
    save_tokens(tokens)
    return tokens["access_token"]


def api_get(token: str, path: str, params: dict | None = None):
    response = requests.get(
        f"https://www.strava.com/api/v3{path}",
        headers={"Authorization": f"Bearer {token}"},
        params=params,
        timeout=30,
    )
    if response.status_code == 429:
        usage = response.headers.get("X-RateLimit-Usage", "unknown")
        limit = response.headers.get("X-RateLimit-Limit", "unknown")
        raise SystemExit(f"Strava rate limit reached (usage {usage}, limit {limit}). Try again later.")
    response.raise_for_status()
    return response.json()


def fetch_activities(token: str, limit: int | None) -> list[dict]:
    activities: list[dict] = []
    page = 1
    while True:
        remaining = limit - len(activities) if limit else 100
        if limit and remaining <= 0:
            break
        batch = api_get(
            token,
            "/athlete/activities",
            {"page": page, "per_page": min(100, remaining)},
        )
        if not batch:
            break
        activities.extend(batch)
        print(f"  Fetched {len(activities)} Strava activities...")
        if len(batch) < min(100, remaining):
            break
        page += 1
    return activities[:limit] if limit else activities


def normalize_summary(activity: dict) -> dict:
    speed = float(activity.get("average_speed") or 0)
    sport_key = activity.get("sport_type") or activity.get("type") or "Other"
    sport = SPORT_MAP.get(sport_key, "other")
    return {
        "id": int(activity["id"]),
        "title": activity.get("name") or "Untitled",
        "sport": sport,
        "startTime": activity.get("start_date_local") or activity.get("start_date"),
        "distance": round(float(activity.get("distance") or 0) / 1000, 2),
        "duration": round(activity.get("elapsed_time") or 0),
        "movingTime": round(activity.get("moving_time") or activity.get("elapsed_time") or 0),
        "elevationGain": round(activity.get("total_elevation_gain") or 0),
        "avgHR": round(activity.get("average_heartrate") or 0),
        "maxHR": round(activity.get("max_heartrate") or 0),
        "calories": round(activity.get("calories") or 0),
        "tss": None,
        "avgPace": round(1000 / speed) if speed and sport in {"running", "walking", "swimming"} else None,
        "avgSpeed": round(speed * 3.6, 1) if speed else None,
        "avgPower": round(activity.get("average_watts") or 0) or None,
        "normalizedPower": round(activity.get("weighted_average_watts") or 0) or None,
        "avgCadence": round(activity.get("average_cadence") or 0) or None,
        "vo2max": None,
        "aerobicTE": None,
        "anaerobicTE": None,
        "source": "strava",
        "sourceType": sport_key,
        "sourceUrl": f"https://www.strava.com/activities/{int(activity['id'])}",
        "summaryPolyline": (activity.get("map") or {}).get("summary_polyline"),
    }


def decode_polyline(encoded: str | None) -> list[list[float]]:
    if not encoded:
        return []
    coords = []
    index = latitude = longitude = 0
    while index < len(encoded):
        values = []
        for _ in range(2):
            result = shift = 0
            while True:
                value = ord(encoded[index]) - 63
                index += 1
                result |= (value & 0x1F) << shift
                shift += 5
                if value < 0x20:
                    break
            values.append(~(result >> 1) if result & 1 else result >> 1)
        latitude += values[0]
        longitude += values[1]
        coords.append([latitude / 1e5, longitude / 1e5])
    if len(coords) > 500:
        step = max(1, len(coords) // 500)
        coords = coords[::step]
    return coords


def write_strava_details(summaries: list[dict], matches: dict[int, dict]) -> None:
    for summary in summaries:
        matched = matches.get(int(summary["id"]))
        base = {}
        if matched:
            base = load_json(OUTPUT_DIR / f"activity_{matched['id']}.json", {})
        detail = {
            **base,
            **summary,
            "laps": base.get("laps", []),
            "hrZones": base.get("hrZones", []),
            "gpxCoords": decode_polyline(summary.get("summaryPolyline")) or base.get("gpxCoords", []),
        }
        if matched:
            detail["matchedGarminId"] = matched["id"]
        save_json(OUTPUT_DIR / f"activity_{summary['id']}.json", detail)


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync and merge Strava activities")
    parser.add_argument("--authorize", action="store_true", help="Authorize Strava in the browser")
    parser.add_argument("--limit", type=int, default=None, help="Maximum Strava activities")
    args = parser.parse_args()

    token = access_token(args.authorize)
    raw = fetch_activities(token, args.limit)
    summaries = [normalize_summary(item) for item in raw]
    save_json(OUTPUT_DIR / "strava_activities.json", summaries)
    merged, matches = write_merged(OUTPUT_DIR)
    write_strava_details(summaries, matches)

    print(f"Saved {len(summaries)} Strava activities")
    print(f"Matched and replaced {len(matches)} Garmin duplicates")
    print(f"Total unique activities: {len(merged)}")


if __name__ == "__main__":
    main()
