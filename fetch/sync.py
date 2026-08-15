#!/usr/bin/env python3
from __future__ import annotations
"""
Garmin Connect â†’ local JSON sync script.

Usage:
    python sync.py                  # sync all activities
    python sync.py --limit 20       # only fetch 20 (for testing)
    python sync.py --since 2024-01-01  # only activities after this date

Credentials are read from ../.env (GARMIN_EMAIL, GARMIN_PASSWORD).
Auth tokens are cached in ~/.garth/ so login only happens once.

Output: ../public/data/activities.json + ../public/data/activity_{id}.json
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Load .env from project root (parent of fetch/)
load_dotenv(Path(__file__).parent.parent / ".env")


def get_api():
    """Authenticate and return a Garmin Connect API client."""
    try:
        import garminconnect
    except ImportError:
        print("ERROR: garminconnect not installed. Run: pip install -r requirements.txt")
        sys.exit(1)

    email = os.getenv("GARMIN_EMAIL")
    password = os.getenv("GARMIN_PASSWORD")

    if not email or not password:
        print("ERROR: Set GARMIN_EMAIL and GARMIN_PASSWORD in .env (copy from .env.example)")
        sys.exit(1)

    api = garminconnect.Garmin(email, password)
    try:
        api.login()
    except garminconnect.GarminConnectAuthenticationError as e:
        print(f"Authentication failed: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Login error: {e}")
        sys.exit(1)

    print("Logged in successfully")
    return api


def fetch_activities(api, limit: int | None, since: str | None) -> list:
    """Download the activity list from Garmin Connect."""
    print("Fetching activity list...")

    if limit:
        raw = api.get_activities(0, limit)
    else:
        # Paginate through all activities in chunks of 100
        raw = []
        start = 0
        chunk = 100
        while True:
            batch = api.get_activities(start, chunk)
            if not batch:
                break
            raw.extend(batch)
            print(f"  Fetched {len(raw)} activities so far...")
            if len(batch) < chunk:
                break
            start += chunk
            time.sleep(0.3)

    # Filter by date if requested
    if since:
        raw = [a for a in raw if (a.get("startTimeLocal") or "") >= since]

    print(f"Total activities: {len(raw)}")
    return raw


def _try(fn, *args, label="", **kwargs):
    """Call fn(*args, **kwargs) with retries, return {} / [] / None on failure."""
    for attempt in range(3):
        try:
            return fn(*args, **kwargs)
        except Exception as e:
            if attempt < 2:
                time.sleep(2 ** attempt)
            else:
                if label:
                    print(f"  WARNING: {label}: {e}")
    return None


def fetch_activity_details(api, activity_id: int) -> dict:
    """Download core details for a single activity (garminconnect 0.2.x API)."""
    result = _try(api.get_activity_details, activity_id, label=f"details {activity_id}")
    return result or {}


def fetch_activity_hr_zones(api, activity_id: int) -> list:
    """Fetch HR zone breakdown (seconds per zone) for a single activity."""
    result = _try(api.get_activity_hr_in_timezones, activity_id, label=f"hr_zones {activity_id}")
    return result or []


def fetch_activity_splits(api, activity_id: int) -> dict:
    """Fetch lap/split data for a single activity."""
    result = _try(api.get_activity_splits, activity_id, label=f"splits {activity_id}")
    return result or {}


def fetch_gpx_coords(api, activity_id: int) -> list:
    """Return [[lat, lon], ...] from GPX download, or [] on failure."""
    import re
    import garminconnect
    try:
        gpx_data = api.download_activity(
            activity_id,
            dl_fmt=garminconnect.Garmin.ActivityDownloadFormat.GPX,
        )
        if not gpx_data:
            return []
        text = gpx_data.decode("utf-8", errors="ignore")
        coords = re.findall(r'<trkpt lat="([\d.\-]+)" lon="([\d.\-]+)"', text)
        if len(coords) > 500:
            step = len(coords) // 500
            coords = coords[::step]
        return [[float(lat), float(lon)] for lat, lon in coords]
    except Exception:
        return []


def save_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))


def is_recent_summary(summary: dict, days: int = 30) -> bool:
    start_time = (summary.get("startTime") or "")[:10]
    try:
        started = datetime.fromisoformat(start_time)
    except ValueError:
        return False
    return started >= datetime.now() - timedelta(days=days)


def main():
    parser = argparse.ArgumentParser(description="Sync Garmin activities to local JSON")
    parser.add_argument("--limit", type=int, default=None, help="Max activities to sync (for testing)")
    parser.add_argument("--since", type=str, default=None, help="Only sync activities after this date (YYYY-MM-DD)")
    parser.add_argument("--no-gpx", action="store_true", help="Skip GPS data download (faster)")
    parser.add_argument(
        "--backfill-missing-details",
        action="store_true",
        help="Fetch details for old activities that are missing detail JSON. Slow; use only for one-off backfills.",
    )
    args = parser.parse_args()

    from normalizer import normalize_summary, normalize_detail
    from merge import compute_stats, load_json, save_json as save_merged_json, write_merged

    output_dir = Path(__file__).parent.parent / "public" / "data"
    output_dir.mkdir(parents=True, exist_ok=True)
    existing_summaries = load_json(output_dir / "garmin_activities.json", [])
    existing_ids = {int(item["id"]) for item in existing_summaries if item.get("id")}

    api = get_api()

    # Step 1: Get activity list
    raw_activities = fetch_activities(api, args.limit, args.since)

    # Step 2: Normalize summaries
    summaries = []
    for raw in raw_activities:
        try:
            s = normalize_summary(raw)
            if s.get("id"):
                s["source"] = "garmin"
                summaries.append(s)
        except Exception as e:
            print(f"  WARNING: Failed to normalize activity {raw.get('activityId')}: {e}")

    if args.limit or args.since:
        merged_by_id = {int(item["id"]): item for item in existing_summaries if item.get("id")}
        for item in summaries:
            merged_by_id[int(item["id"])] = item
        summaries = sorted(merged_by_id.values(), key=lambda item: item.get("startTime") or "", reverse=True)

    # Save Garmin summaries. The visible app dataset is written by the merge step,
    # so Strava precedence and duplicate removal are always preserved.
    save_json(output_dir / "garmin_activities.json", summaries)
    print(f"Saved {len(summaries)} Garmin activity summaries")

    # Step 3: Fetch and save details for new activities only.
    print("\nFetching details for new activities only (rate-limited)...")
    skipped_old_missing = 0
    for i, summary in enumerate(summaries):
        activity_id = summary["id"]
        detail_path = output_dir / f"activity_{activity_id}.json"

        if detail_path.exists():
            print(f"  [{i+1}/{len(summaries)}] {activity_id} â€” already cached, skipping")
            continue

        is_existing_activity = int(activity_id) in existing_ids
        if (
            is_existing_activity
            and not is_recent_summary(summary)
            and not args.backfill_missing_details
            and not args.limit
            and not args.since
        ):
            skipped_old_missing += 1
            continue

        print(f"  [{i+1}/{len(summaries)}] Fetching {activity_id} ({summary.get('title', '')})...")

        details = fetch_activity_details(api, activity_id)
        hr_zones = fetch_activity_hr_zones(api, activity_id)
        splits = fetch_activity_splits(api, activity_id)
        gpx_coords = [] if args.no_gpx else fetch_gpx_coords(api, activity_id)

        try:
            full = normalize_detail(summary, details, hr_zones, splits, gpx_coords)
            save_json(detail_path, full)
        except Exception as e:
            print(f"  WARNING: Failed to process detail for {activity_id}: {e}")

        # Rate limiting â€” critical to avoid Garmin banning the account
        time.sleep(0.5)

    if skipped_old_missing:
        print(
            f"Skipped {skipped_old_missing} old activities without cached details. "
            "Run with --backfill-missing-details if you want to fill them later."
        )

    # Step 4: Compute and save global stats
    if (output_dir / "strava_activities.json").exists():
        merged, _ = write_merged(output_dir)
        print(f"Merged Garmin and Strava: {len(merged)} unique activities")
    else:
        stats = compute_stats(summaries)
        save_merged_json(output_dir / "stats.json", stats)
    print(f"\nDone! Saved stats â†’ public/data/stats.json")
    print("Run 'npm run dev' to open the app.")


if __name__ == "__main__":
    main()
