from __future__ import annotations
"""
Converts raw Garmin Connect API responses into the normalized JSON shape
that the React frontend expects. See src/types/garmin.ts for the TypeScript
types that mirror these structures.
"""

SPORT_MAP = {
    "running": "running",
    "trail_running": "running",
    "treadmill_running": "running",
    "cycling": "cycling",
    "road_cycling": "cycling",
    "road_biking": "cycling",
    "indoor_cycling": "cycling",
    "indoor_biking": "cycling",
    "virtual_ride": "cycling",
    "mountain_biking": "cycling",
    "gravel_cycling": "cycling",
    "swimming": "swimming",
    "open_water_swimming": "swimming",
    "pool_swimming": "swimming",
    "walking": "walking",
    "hiking": "walking",
    "casual_walking": "walking",
    "speed_walking": "walking",
    "strength_training": "gym",
    "cardio_training": "gym",
    "hiit": "gym",
    "indoor_cardio": "gym",
    "elliptical": "gym",
    "pilates": "gym",
    "yoga": "gym",
}


def _sport(activity: dict) -> str:
    raw = activity.get("activityType", {}).get("typeKey", "other").lower()
    return SPORT_MAP.get(raw, "other")


def _safe(d: dict, *keys, default=None):
    for k in keys:
        if d is None:
            return default
        d = d.get(k)
    return d if d is not None else default


def normalize_summary(activity: dict) -> dict:
    """Produces the lightweight ActivitySummary used in the activities list."""
    sport = _sport(activity)

    # Pace in seconds per km (only meaningful for running/swimming)
    avg_speed = _safe(activity, "averageSpeed") or 0  # m/s
    avg_pace = round(1000 / avg_speed) if avg_speed > 0 else None

    summary = {
        "id": activity.get("activityId"),
        "sourceUrl": f"https://connect.garmin.com/modern/activity/{activity.get('activityId')}",
        "title": activity.get("activityName", "Untitled"),
        "sport": sport,
        "sourceType": activity.get("activityType", {}).get("typeKey"),
        "startTime": activity.get("startTimeLocal") or activity.get("startTimeGMT"),
        "distance": round((_safe(activity, "distance") or 0) / 1000, 2),  # km
        "duration": round(_safe(activity, "duration") or 0),  # seconds
        "movingTime": round(_safe(activity, "movingDuration") or _safe(activity, "duration") or 0),
        "elevationGain": round(_safe(activity, "elevationGain") or 0),
        "avgHR": round(_safe(activity, "averageHR") or 0),
        "maxHR": round(_safe(activity, "maxHR") or 0),
        "calories": round(_safe(activity, "calories") or 0),
        "tss": _safe(activity, "trainingStressScore"),
        "avgPace": avg_pace,  # sec/km, running/swim only
        "avgSpeed": round(avg_speed * 3.6, 1) if avg_speed else None,  # km/h, cycling
        "avgPower": round(_safe(activity, "avgPower") or 0) or None,
        "normalizedPower": round(_safe(activity, "normPower") or 0) or None,
        "avgCadence": round(_safe(activity, "averageRunningCadenceInStepsPerMinute") or
                           _safe(activity, "averageBikingCadenceInRevPerMinute") or 0) or None,
        "vo2max": _safe(activity, "vO2MaxValue"),
        "aerobicTE": _safe(activity, "aerobicTrainingEffect"),
        "anaerobicTE": _safe(activity, "anaerobicTrainingEffect"),
    }

    # Swimming-specific
    if sport == "swimming":
        summary["swolf"] = _safe(activity, "averageSwolf")
        summary["avgStrokesPerLength"] = _safe(activity, "averageStrokeDistance")

    return summary


def normalize_detail(summary: dict, details: dict, hr_zones_raw: list, splits_raw: dict, gpx_coords: list) -> dict:
    """Merges summary + activity details + HR zones + splits + GPS into the full ActivityDetail."""
    detail = dict(summary)

    # Laps from splits endpoint (garminconnect 0.2.x)
    # get_activity_splits returns {"lapDTOs": [...]} or {"splits": [...]}
    laps_data = (
        splits_raw.get("lapDTOs")
        or splits_raw.get("splits")
        or _safe(details, "activityDetailMetrics")
        or []
    )
    detail["laps"] = _normalize_laps(laps_data, summary.get("sport"))

    # HR zones from get_activity_hr_in_timezones (returns a list directly)
    # or fall back to whatever details has
    hr_zones = hr_zones_raw or _safe(details, "heartRateZones") or []
    detail["hrZones"] = _normalize_hr_zones(hr_zones)

    detail["gpxCoords"] = gpx_coords or []

    # Extra metrics from the details summaryDTO if present
    metrics = _safe(details, "summaryDTO") or {}
    if metrics:
        detail["avgStrideLength"] = _safe(metrics, "avgStrideLength")
        detail["trainingEffect"] = _safe(metrics, "trainingEffect")

    return detail


def _normalize_laps(laps_data: list, sport: str) -> list:
    """Handles both lapDTOs format and legacy activityDetailMetrics format."""
    laps = []
    for i, lap in enumerate(laps_data):
        if not isinstance(lap, dict):
            continue
        # lapDTOs format
        if "lapIndex" in lap or "distance" in lap:
            speed = lap.get("averageSpeed") or 0
            avg_pace = round(1000 / speed) if speed > 0 else None
            laps.append({
                "index": lap.get("lapIndex", i + 1),
                "distance": round((lap.get("distance") or 0) / 1000, 3),
                "duration": round(lap.get("duration") or lap.get("elapsedDuration") or 0),
                "avgHR": round(lap.get("averageHR") or 0) or None,
                "avgPace": avg_pace,
                "avgSpeed": round(speed * 3.6, 1) if speed else None,
                "avgPower": round(lap.get("avgPower") or 0) or None,
                "elevationGain": round(lap.get("elevationGain") or 0),
            })
        else:
            # Legacy activityDetailMetrics format
            metrics = lap.get("metrics", {})
            speed = metrics.get("averageSpeed") or 0
            avg_pace = round(1000 / speed) if speed > 0 else None
            laps.append({
                "index": i + 1,
                "distance": round((metrics.get("distance") or 0) / 1000, 3),
                "duration": round(metrics.get("duration") or 0),
                "avgHR": round(metrics.get("averageHR") or 0) or None,
                "avgPace": avg_pace,
                "avgSpeed": round(speed * 3.6, 1) if speed else None,
                "avgPower": round(metrics.get("avgPower") or 0) or None,
                "elevationGain": round(metrics.get("elevationGain") or 0),
            })
    return laps


def _normalize_hr_zones(hr_zones: list) -> list:
    """Handles both get_activity_hr_in_timezones and heartRateZones formats."""
    if not hr_zones:
        return []
    result = []
    for zone in hr_zones:
        if not isinstance(zone, dict):
            continue
        # get_activity_hr_in_timezones returns: {zoneNumber, zoneName, secsInZone, ...}
        zone_num = zone.get("zoneNumber") or zone.get("zone")
        seconds = zone.get("secsInZone") or zone.get("seconds") or 0
        result.append({
            "zone": zone_num,
            "name": zone.get("zoneName") or zone.get("name") or f"Zona {zone_num}",
            "seconds": round(seconds),
            "lowBPM": zone.get("zoneLowBoundary") or zone.get("lowBPM"),
            "highBPM": zone.get("zoneHighBoundary") or zone.get("highBPM"),
        })
    return result
