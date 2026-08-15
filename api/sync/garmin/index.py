from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote

import psycopg
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


ROOT = Path(__file__).resolve().parents[3]
FETCH_DIR = ROOT / "fetch"
if str(FETCH_DIR) not in sys.path:
    sys.path.insert(0, str(FETCH_DIR))

from normalizer import normalize_detail, normalize_summary  # noqa: E402


COOKIE_NAME = "mostlyz2_session"
app = FastAPI()


def response(status: int, body: dict) -> JSONResponse:
    return JSONResponse(content=body, status_code=status)


def base64url_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def base64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def signing_secret() -> str:
    return os.environ.get("SESSION_SECRET") or os.environ.get("TOKEN_ENCRYPTION_KEY") or "mostlyz2-dev-secret"


def encryption_secret() -> str:
    return os.environ.get("TOKEN_ENCRYPTION_KEY") or os.environ.get("SESSION_SECRET") or "mostlyz2-dev-secret"


def verify_session_cookie(cookie_header: str | None) -> str | None:
    if os.environ.get("MOSTLYZ2_PERSONAL_MODE") == "true":
        return os.environ.get("MOSTLYZ2_DEMO_USER_ID")

    cookies: dict[str, str] = {}
    for raw_part in (cookie_header or "").split(";"):
        part = raw_part.strip()
        if not part or "=" not in part:
            continue
        key, value = part.split("=", 1)
        cookies[key] = unquote(value)

    raw = cookies.get(COOKIE_NAME)
    if not raw or "." not in raw:
        return None
    user_id, signature = raw.split(".", 1)
    expected = hmac.new(signing_secret().encode("utf-8"), user_id.encode("utf-8"), hashlib.sha256).digest()
    if hmac.compare_digest(base64url_encode(expected), signature):
        return user_id
    return None


def decrypt_text(payload: str) -> str:
    iv_raw, tag_raw, encrypted_raw = payload.split(".")
    key = hashlib.sha256(encryption_secret().encode("utf-8")).digest()
    iv = base64url_decode(iv_raw)
    tag = base64url_decode(tag_raw)
    encrypted = base64url_decode(encrypted_raw)
    return AESGCM(key).decrypt(iv, encrypted + tag, None).decode("utf-8")


def database_url() -> str:
    value = os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL")
    if not value:
        raise RuntimeError("DATABASE_URL no está configurada.")
    return value


def connect_db():
    return psycopg.connect(database_url(), autocommit=False)


def garmin_credentials(conn, user_id: str) -> tuple[str, str]:
    row = conn.execute(
        """
          select access_token_encrypted, refresh_token_encrypted
          from provider_connections
          where user_id = %s and provider = 'garmin' and status = 'connected'
          limit 1
        """,
        (user_id,),
    ).fetchone()
    if not row or not row[0] or not row[1]:
        raise RuntimeError("Guarda primero tu usuario y contraseña de Garmin en Ajustes.")
    return decrypt_text(row[0]), decrypt_text(row[1])


def dedupe_key(summary: dict) -> str:
    return ":".join(
        [
            str(summary.get("startTime") or "")[:16],
            str(summary.get("sport") or "other"),
            str(round(float(summary.get("distance") or 0) * 10)),
            str(round(float(summary.get("movingTime") or summary.get("duration") or 0) / 10)),
        ]
    )


def visible_activity_filter_sql() -> str:
    return """
      not (
        source = 'garmin'
        and exists (
          select 1
          from activities strava_match
          where strava_match.user_id = activities.user_id
            and strava_match.source = 'strava'
            and strava_match.sport = activities.sport
            and (
              (
                abs(coalesce(strava_match.duration_seconds, 0) - coalesce(activities.duration_seconds, 0))
                  <= greatest(180, coalesce(activities.duration_seconds, 0) * 0.10)
                and abs(coalesce(strava_match.distance_km, 0) - coalesce(activities.distance_km, 0))
                  <= greatest(0.50, coalesce(activities.distance_km, 0) * 0.05)
                and (
                  abs(extract(epoch from (strava_match.start_time - activities.start_time))) <= 900
                  or strava_match.start_time::date = activities.start_time::date
                )
              )
              or (
                strava_match.start_time::date = activities.start_time::date
                and coalesce(activities.distance_km, 0) >= 2
                and abs(coalesce(strava_match.distance_km, 0) - coalesce(activities.distance_km, 0))
                  <= greatest(0.08, coalesce(activities.distance_km, 0) * 0.003)
              )
              or (
                strava_match.summary->'startLocation'->>'lat' is not null
                and strava_match.summary->'startLocation'->>'lon' is not null
                and activities.summary->'startLocation'->>'lat' is not null
                and activities.summary->'startLocation'->>'lon' is not null
                and abs((strava_match.summary->'startLocation'->>'lat')::double precision - (activities.summary->'startLocation'->>'lat')::double precision) <= 0.003
                and abs((strava_match.summary->'startLocation'->>'lon')::double precision - (activities.summary->'startLocation'->>'lon')::double precision) <= 0.003
                and abs(coalesce(strava_match.distance_km, 0) - coalesce(activities.distance_km, 0))
                  <= greatest(0.50, coalesce(activities.distance_km, 0) * 0.05)
              )
            )
        )
      )
    """


def ensure_sync_jobs_schema(conn) -> None:
    conn.execute("create extension if not exists pgcrypto")
    conn.execute(
        """
          create table if not exists sync_jobs (
            id uuid primary key default gen_random_uuid(),
            user_id text not null references app_users(id) on delete cascade,
            provider text not null,
            status text not null default 'queued',
            message text,
            payload jsonb not null default '{}'::jsonb,
            started_at timestamptz,
            finished_at timestamptz,
            created_at timestamptz not null default now(),
            updated_at timestamptz not null default now()
          )
        """
    )
    conn.execute("alter table sync_jobs add column if not exists payload jsonb not null default '{}'::jsonb")
    conn.execute("alter table sync_jobs add column if not exists updated_at timestamptz not null default now()")


def append_log(payload: dict, message: str) -> dict:
    log = list(payload.get("log") or [])
    clean = str(message)
    if not clean.startswith("Garmin ·") and not clean.startswith("Strava ·"):
        clean = f"Garmin · {clean}"
    log.append(clean)
    payload["log"] = log[-40:]
    return payload


def to_isoish(value: str | None) -> str:
    clean = str(value or "").replace(" ", "T")
    return clean or datetime.now(timezone.utc).isoformat()


def build_stats(summaries: list[dict]) -> dict:
    by_type: dict[str, int] = {}
    by_source = {"garmin": 0, "strava": 0}
    vo2max_history = []
    for item in summaries:
        sport = item.get("sport") or "other"
        by_type[sport] = by_type.get(sport, 0) + 1
        source = item.get("source") or "garmin"
        if source in by_source:
            by_source[source] += 1
        if item.get("vo2max") and item.get("startTime"):
            vo2max_history.append({"date": str(item["startTime"])[:10], "value": item["vo2max"]})
    vo2max_history.sort(key=lambda item: item["date"])
    return {
        "totalActivities": len(summaries),
        "byType": by_type,
        "bySource": by_source,
        "vo2maxHistory": vo2max_history,
        "syncedAt": datetime.now(timezone.utc).isoformat(),
    }


def upsert_activity(conn, user_id: str, summary: dict, detail: dict) -> None:
    activity_id = str(summary["id"])
    summary["source"] = "garmin"
    detail["source"] = "garmin"
    summary["sourceUrl"] = summary.get("sourceUrl") or f"https://connect.garmin.com/modern/activity/{activity_id}"
    detail["sourceUrl"] = detail.get("sourceUrl") or summary["sourceUrl"]

    conn.execute(
        """
          insert into activities (
            user_id, activity_id, source, source_activity_id, source_url, sport, start_time,
            distance_km, duration_seconds, summary, dedupe_key, updated_at
          )
          values (%s, %s, 'garmin', %s, %s, %s, %s, %s, %s, %s::jsonb, %s, now())
          on conflict (user_id, activity_id) do update set
            source_url = excluded.source_url,
            sport = excluded.sport,
            start_time = excluded.start_time,
            distance_km = excluded.distance_km,
            duration_seconds = excluded.duration_seconds,
            summary = excluded.summary,
            dedupe_key = excluded.dedupe_key,
            updated_at = now()
        """,
        (
            user_id,
            activity_id,
            activity_id,
            summary["sourceUrl"],
            summary.get("sport") or "other",
            to_isoish(summary.get("startTime")),
            summary.get("distance"),
            round(summary.get("movingTime") or summary.get("duration") or 0),
            json.dumps(summary, ensure_ascii=False),
            dedupe_key(summary),
        ),
    )
    conn.execute(
        """
          insert into activity_details (user_id, activity_id, detail, updated_at)
          values (%s, %s, %s::jsonb, now())
          on conflict (user_id, activity_id) do update set
            detail = excluded.detail,
            updated_at = now()
        """,
        (user_id, activity_id, json.dumps(detail, ensure_ascii=False)),
    )


def refresh_stats(conn, user_id: str) -> None:
    rows = conn.execute(
        """
          select summary
          from activities
          where user_id = %s
            and """ + visible_activity_filter_sql() + """
        """,
        (user_id,),
    ).fetchall()
    summaries = [row[0] for row in rows]
    conn.execute(
        """
          insert into user_stats (user_id, stats, calculated_at)
          values (%s, %s::jsonb, now())
          on conflict (user_id) do update set stats = excluded.stats, calculated_at = now()
        """,
        (user_id, json.dumps(build_stats(summaries), ensure_ascii=False)),
    )


def fetch_detail(api, activity_id: int, with_gpx: bool) -> tuple[dict, list, dict, list]:
    details: dict = {}
    hr_zones: list = []
    splits: dict = {}
    gpx_coords: list = []
    try:
        details = api.get_activity_details(activity_id) or {}
    except Exception:
        details = {}
    try:
        hr_zones = api.get_activity_hr_in_timezones(activity_id) or []
    except Exception:
        hr_zones = []
    try:
        splits = api.get_activity_splits(activity_id) or {}
    except Exception:
        splits = {}
    if with_gpx:
        try:
            import garminconnect
            import re

            raw_gpx = api.download_activity(activity_id, dl_fmt=garminconnect.Garmin.ActivityDownloadFormat.GPX)
            text = raw_gpx.decode("utf-8", errors="ignore") if isinstance(raw_gpx, bytes) else str(raw_gpx or "")
            coords = re.findall(r'<trkpt lat="([\d.\-]+)" lon="([\d.\-]+)"', text)
            if len(coords) > 500:
                step = max(1, len(coords) // 500)
                coords = coords[::step]
            gpx_coords = [[float(lat), float(lon)] for lat, lon in coords]
        except Exception:
            gpx_coords = []
    return details, hr_zones, splits, gpx_coords


def latest_active_job(conn, user_id: str):
    return conn.execute(
        """
          select id, payload
          from sync_jobs
          where user_id = %s and provider = 'garmin' and status in ('queued', 'running', 'paused')
          order by created_at desc
          limit 1
        """,
        (user_id,),
    ).fetchone()


def create_job(conn, user_id: str) -> tuple[str, dict]:
    limit = int(os.environ.get("GARMIN_SYNC_LIMIT") or "2000")
    detail_limit = int(os.environ.get("GARMIN_DETAIL_LIMIT") or "20")
    batch_size = max(10, min(int(os.environ.get("GARMIN_SYNC_BATCH") or "50"), 100))
    payload = {
        "offset": 0,
        "imported": 0,
        "detailed": 0,
        "limit": limit,
        "detailLimit": detail_limit,
        "batchSize": batch_size,
        "progress": {"done": 0, "total": limit},
        "log": [],
    }
    row = conn.execute(
        """
          insert into sync_jobs (user_id, provider, status, message, payload, created_at, updated_at)
          values (%s, 'garmin', 'queued', 'Garmin en cola.', %s::jsonb, now(), now())
          returning id
        """,
        (user_id, json.dumps(payload, ensure_ascii=False)),
    ).fetchone()
    return str(row[0]), payload


def update_job(conn, job_id: str, status: str, message: str, payload: dict, finished: bool = False) -> None:
    conn.execute(
        """
          update sync_jobs
          set status = %s,
              message = %s,
              payload = %s::jsonb,
              started_at = coalesce(started_at, now()),
              finished_at = case when %s then now() else finished_at end,
              updated_at = now()
          where id = %s
        """,
        (status, message, json.dumps(payload, ensure_ascii=False), finished, job_id),
    )


def fail_active_job(user_id: str, message: str) -> None:
    try:
        with connect_db() as conn:
            ensure_sync_jobs_schema(conn)
            row = latest_active_job(conn, user_id)
            if not row:
                return
            payload = row[1] or {}
            append_log(payload, message)
            update_job(conn, str(row[0]), "failed", message, payload, finished=True)
            conn.commit()
    except Exception:
        return


def pause_active_job(user_id: str, message: str) -> None:
    try:
        with connect_db() as conn:
            ensure_sync_jobs_schema(conn)
            row = latest_active_job(conn, user_id)
            if not row:
                return
            payload = row[1] or {}
            append_log(payload, message)
            update_job(conn, str(row[0]), "paused", message, payload, finished=False)
            conn.commit()
    except Exception:
        return


def run_sync(user_id: str, reset: bool = False) -> dict:
    import garminconnect

    with connect_db() as conn:
        ensure_sync_jobs_schema(conn)
        if reset:
            conn.execute(
                """
                  update sync_jobs
                  set status = 'stopped',
                      message = 'Importación reiniciada por el usuario.',
                      finished_at = now(),
                      updated_at = now()
                  where user_id = %s and provider = 'garmin' and status in ('queued', 'running', 'paused')
                """,
                (user_id,),
            )

        active = None if reset else latest_active_job(conn, user_id)
        if active:
            job_id = str(active[0])
            payload = active[1] or {}
        else:
            job_id, payload = create_job(conn, user_id)

        limit = int(payload.get("limit") or os.environ.get("GARMIN_SYNC_LIMIT") or "2000")
        detail_limit = int(payload.get("detailLimit") or os.environ.get("GARMIN_DETAIL_LIMIT") or "20")
        configured_batch_size = int(os.environ.get("GARMIN_SYNC_BATCH") or "50")
        batch_size = max(10, min(configured_batch_size, 100))
        payload["batchSize"] = batch_size
        offset = int(payload.get("offset") or 0)

        email, password = garmin_credentials(conn, user_id)

        api = garminconnect.Garmin(email, password)
        api.login()

        remaining = max(0, limit - offset)
        count = min(batch_size, remaining)
        if count <= 0:
            refresh_stats(conn, user_id)
            payload["progress"] = {"done": offset, "total": limit}
            append_log(payload, "Sin nuevas actividades pendientes.")
            update_job(conn, job_id, "completed", "Garmin ya estaba completo.", payload, finished=True)
            conn.commit()
            return {
                "started": True,
                "running": False,
                "provider": "garmin",
                "jobId": job_id,
                "imported": payload.get("imported", 0),
                "detailed": payload.get("detailed", 0),
                "limit": limit,
                "message": "Garmin ya estaba completo.",
            }

        update_job(conn, job_id, "running", f"Garmin: importando actividades {offset + 1}-{offset + count}.", payload)
        conn.commit()

        raw_activities = api.get_activities(offset, count) or []

        imported = int(payload.get("imported") or 0)
        detailed = int(payload.get("detailed") or 0)
        for index, raw in enumerate(raw_activities):
            summary = normalize_summary(raw)
            if not summary.get("id"):
                continue
            summary["source"] = "garmin"

            absolute_index = offset + index
            if absolute_index < detail_limit:
                details, hr_zones, splits, gpx_coords = fetch_detail(api, int(summary["id"]), with_gpx=True)
                detail = normalize_detail(summary, details, hr_zones, splits, gpx_coords)
                detailed += 1
            else:
                detail = {**summary, "laps": [], "hrZones": [], "gpxCoords": []}

            upsert_activity(conn, user_id, summary, detail)
            imported += 1

        next_offset = offset + len(raw_activities)
        payload["offset"] = next_offset
        payload["imported"] = imported
        payload["detailed"] = detailed
        payload["progress"] = {"done": next_offset, "total": limit}
        append_log(payload, f"[{next_offset}/{limit}] importadas {imported}; detalle/mapa {detailed}.")

        completed = len(raw_activities) < count or next_offset >= limit
        if completed or next_offset <= batch_size or next_offset % 500 == 0:
            refresh_stats(conn, user_id)
        message = (
            f"Garmin sincronizado: {imported} actividades. Detalle/mapa en las {detailed} más recientes."
            if completed
            else f"Garmin en curso: {next_offset}/{limit}. MostlyZ2 continuará por tandas mientras Ajustes esté abierto."
        )
        update_job(conn, job_id, "completed" if completed else "running", message, payload, finished=completed)
        conn.commit()

    return {
        "started": True,
        "running": not completed,
        "provider": "garmin",
        "jobId": job_id,
        "imported": imported,
        "detailed": detailed,
        "limit": limit,
        "message": message,
    }


def garmin_error_details(error: BaseException) -> tuple[int, str]:
    text = str(error)
    lowered = text.lower()
    if isinstance(error, SystemExit):
        status = 429
        message = "Garmin ha rechazado el login móvil temporalmente. Espera un rato y vuelve a intentarlo."
    elif "429" in text or "rate" in lowered:
        status = 429
        message = "Garmin ha limitado temporalmente el acceso. Espera un rato y vuelve a intentarlo."
    elif "mfa" in lowered or "authentication" in lowered or "login" in lowered:
        status = 401
        message = "Garmin no aceptó las credenciales o pide verificación adicional."
    else:
        status = 500
        message = text or "No se pudo sincronizar Garmin."
    return status, message


def garmin_error_response(error: BaseException) -> JSONResponse:
    status, message = garmin_error_details(error)
    return response(status, {"error": "garmin_sync_failed", "message": message})


@app.post("/")
@app.post("/api/sync/garmin")
async def post_garmin_sync(request: Request) -> JSONResponse:
    user_id = verify_session_cookie(request.headers.get("cookie"))
    if not user_id:
        return response(401, {"error": "login_required", "message": "Inicia sesión antes de importar actividades."})

    try:
        body = await request.json()
    except Exception:
        body = {}

    try:
        return response(200, run_sync(user_id, reset=bool(body.get("reset"))))
    except BaseException as error:
        status, message = garmin_error_details(error)
        if status in (429, 500):
            pause_active_job(user_id, message)
        else:
            fail_active_job(user_id, message)
        return garmin_error_response(error)


@app.get("/")
@app.get("/api/sync/garmin")
async def get_garmin_sync() -> JSONResponse:
    return response(405, {"error": "method_not_allowed"})
