#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).parent.parent
OUTPUT_DIR = ROOT / "public" / "data"
STATUS_PATH = OUTPUT_DIR / "sync_status.json"
LOG_PATH = ROOT / ".codex-sync.log"
LOCK_PATH = ROOT / ".mostlyz2-sync.lock"

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def write_status(phase: str, message: str, running: bool = True, error: str | None = None) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "running": running,
        "phase": phase,
        "message": message,
        "error": error,
        "updatedAt": datetime.now().isoformat(),
    }
    with open(STATUS_PATH, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))


def run_step(label: str, command: list[str]) -> None:
    write_status(label, f"Ejecutando {label}...")
    print(f"\n=== {label.upper()} ===", flush=True)
    env = {**os.environ, "PYTHONUTF8": "1"}
    process = subprocess.Popen(
        command,
        cwd=ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    assert process.stdout is not None
    for line in process.stdout:
        print(line, end="", flush=True)
    code = process.wait()
    if code != 0:
        raise SystemExit(f"{label} fallo con codigo {code}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Update MostlyZ2 data from Garmin and Strava")
    parser.add_argument(
        "--provider",
        choices=["all", "garmin", "strava"],
        default="all",
        help="Provider to update. Use garmin to skip Strava until it is connected.",
    )
    parser.add_argument("--garmin-limit", type=int, default=None, help="Limit Garmin activities")
    parser.add_argument("--strava-limit", type=int, default=None, help="Limit Strava activities")
    parser.add_argument("--no-gpx", action="store_true", help="Skip Garmin GPX downloads")
    parser.add_argument("--no-geocode", action="store_true", help="Skip reverse geocoding after merge")
    args = parser.parse_args()

    python = sys.executable
    LOG_PATH.write_text("", encoding="utf-8")
    write_status("starting", "Preparando actualizacion...")
    lock_handle = None

    try:
        try:
            lock_handle = os.open(LOCK_PATH, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError as exc:
            raise SystemExit("Ya hay una actualizacion de MostlyZ2 en marcha.") from exc
        os.write(lock_handle, str(os.getpid()).encode("utf-8"))

        if args.provider in ("all", "garmin"):
            garmin_cmd = [python, "fetch/sync.py"]
            if args.garmin_limit:
                garmin_cmd += ["--limit", str(args.garmin_limit)]
            if args.no_gpx:
                garmin_cmd.append("--no-gpx")
            run_step("garmin", garmin_cmd)

        if args.provider in ("all", "strava"):
            strava_cmd = [python, "fetch/strava_sync.py"]
            if args.strava_limit:
                strava_cmd += ["--limit", str(args.strava_limit)]
            run_step("strava", strava_cmd)

        write_status("merge", "Recalculando datos unicos...")
        from merge import write_merged
        merged, matches = write_merged(OUTPUT_DIR)

        if not args.no_geocode:
            try:
                run_step("ubicaciones", [python, "fetch/geocode_locations.py"])
            except BaseException as exc:
                print(f"WARNING: no se pudieron completar las ubicaciones: {exc}", flush=True)
        from merge import load_json
        merged = load_json(OUTPUT_DIR / "activities.json", merged)

        message = f"Actualizacion completa: {len(merged)} actividades unicas, {len(matches)} duplicados Garmin-Strava."
        print(message, flush=True)
        write_status("done", message, running=False)
    except BaseException as exc:
        message = str(exc)
        write_status("failed", "La actualizacion fallo.", running=False, error=message)
        print(f"ERROR: {message}", flush=True)
        raise
    finally:
        if lock_handle is not None:
            os.close(lock_handle)
            LOCK_PATH.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
