from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path


def load_json(path: Path, default):
    if not path.exists():
        return default
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def save_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, separators=(",", ":"))


def _local_timestamp(value: str | None) -> float | None:
    if not value:
        return None
    try:
        # Garmin and Strava both expose a local wall-clock start time. Comparing
        # those avoids false offsets when Garmin's local timestamp has no zone.
        clean = value[:19]
        return datetime.fromisoformat(clean).timestamp()
    except (TypeError, ValueError):
        return None


def duplicate_score(garmin: dict, strava: dict) -> float | None:
    if garmin.get("sport") != strava.get("sport"):
        return None

    garmin_start = _local_timestamp(garmin.get("startTime"))
    strava_start = _local_timestamp(strava.get("startTime"))
    if garmin_start is None or strava_start is None:
        return None

    garmin_distance = float(garmin.get("distance") or 0)
    strava_distance = float(strava.get("distance") or 0)
    max_distance = max(garmin_distance, strava_distance)
    both_zero_distance = max_distance == 0

    time_delta = abs(garmin_start - strava_start)
    time_tolerance = 20 * 60 if both_zero_distance else 5 * 60
    if time_delta > time_tolerance:
        return None

    distance_delta = abs(garmin_distance - strava_distance)
    distance_pct = 0.10 if time_delta <= 60 else 0.05
    distance_tolerance = max(0.5, max_distance * distance_pct)
    if distance_delta > distance_tolerance:
        return None

    garmin_duration = float(garmin.get("movingTime") or garmin.get("duration") or 0)
    strava_duration = float(strava.get("movingTime") or strava.get("duration") or 0)
    duration_delta = abs(garmin_duration - strava_duration)
    duration_tolerance = max(600, max(garmin_duration, strava_duration) * 0.20)
    if duration_delta > duration_tolerance:
        return None

    return time_delta / 300 + distance_delta / distance_tolerance + duration_delta / duration_tolerance


def _title_quality(item: dict) -> int:
    title = (item.get("title") or "").strip().lower()
    if not title or title in {"sin título", "untitled"}:
        return 0
    if title in {"morning ride", "afternoon ride", "evening ride", "lunch ride"}:
        return 1
    return 2


def _activity_quality(item: dict) -> tuple:
    return (
        1 if item.get("source") == "strava" else 0,
        _title_quality(item),
        1 if item.get("gpxCoords") else 0,
        float(item.get("distance") or 0),
        float(item.get("movingTime") or item.get("duration") or 0),
    )


def exact_duplicate_score(left: dict, right: dict) -> float | None:
    if left.get("source", "garmin") != right.get("source", "garmin"):
        return None
    if left.get("sport") != right.get("sport"):
        return None

    left_start = _local_timestamp(left.get("startTime"))
    right_start = _local_timestamp(right.get("startTime"))
    if left_start is None or right_start is None:
        return None

    time_delta = abs(left_start - right_start)
    if time_delta > 60:
        return None

    left_distance = float(left.get("distance") or 0)
    right_distance = float(right.get("distance") or 0)
    distance_delta = abs(left_distance - right_distance)
    distance_tolerance = max(0.05, max(left_distance, right_distance) * 0.01)
    if distance_delta > distance_tolerance:
        return None

    left_duration = float(left.get("movingTime") or left.get("duration") or 0)
    right_duration = float(right.get("movingTime") or right.get("duration") or 0)
    duration_delta = abs(left_duration - right_duration)
    duration_tolerance = max(60, max(left_duration, right_duration) * 0.02)
    if duration_delta > duration_tolerance:
        return None

    return time_delta / 60 + distance_delta / distance_tolerance + duration_delta / duration_tolerance


def dedupe_exact_same_source(activities: list[dict]) -> list[dict]:
    kept: list[dict] = []
    for activity in activities:
        duplicate_index = None
        for index, candidate in enumerate(kept):
            if exact_duplicate_score(candidate, activity) is not None:
                duplicate_index = index
                break
        if duplicate_index is None:
            kept.append(activity)
            continue
        if _activity_quality(activity) > _activity_quality(kept[duplicate_index]):
            kept[duplicate_index] = activity
    return kept


def merge_activities(garmin_activities: list[dict], strava_activities: list[dict]):
    unmatched_garmin = {int(item["id"]): item for item in garmin_activities}
    matches: dict[int, dict] = {}

    for strava in strava_activities:
        candidates = []
        for garmin_id, garmin in unmatched_garmin.items():
            score = duplicate_score(garmin, strava)
            if score is not None:
                candidates.append((score, garmin_id, garmin))
        if candidates:
            _, garmin_id, garmin = min(candidates, key=lambda item: item[0])
            matches[int(strava["id"])] = garmin
            for _, matched_garmin_id, _ in candidates:
                del unmatched_garmin[matched_garmin_id]

    merged = dedupe_exact_same_source(list(unmatched_garmin.values()) + strava_activities)
    merged.sort(key=lambda item: item.get("startTime") or "", reverse=True)
    return merged, matches


def compute_stats(summaries: list[dict]) -> dict:
    by_sport: dict[str, list] = {}
    for summary in summaries:
        by_sport.setdefault(summary.get("sport", "other"), []).append(summary)

    vo2max_history = [
        {"date": item["startTime"][:10], "value": item["vo2max"]}
        for item in summaries
        if item.get("vo2max") and item.get("startTime")
    ]
    vo2max_history.sort(key=lambda item: item["date"])

    return {
        "totalActivities": len(summaries),
        "byType": {sport: len(items) for sport, items in by_sport.items()},
        "bySource": {
            "garmin": sum(item.get("source", "garmin") == "garmin" for item in summaries),
            "strava": sum(item.get("source") == "strava" for item in summaries),
        },
        "vo2maxHistory": vo2max_history,
        "syncedAt": datetime.now().isoformat(),
    }


def write_merged(output_dir: Path):
    garmin = load_json(output_dir / "garmin_activities.json", [])
    strava = load_json(output_dir / "strava_activities.json", [])
    merged, matches = merge_activities(garmin, strava)
    save_json(output_dir / "activities.json", merged)
    save_json(output_dir / "stats.json", compute_stats(merged))
    return merged, matches
