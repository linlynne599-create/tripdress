"""Build per-city weather normals for the exact days we are in each place.

The trip is far enough out that no real forecast exists yet, so we summarise the
last ten years of reanalysis data for the same calendar window from Open-Meteo's
archive API (free, no key). app.js swaps these numbers for a live forecast once
the dates come inside the 16-day forecast horizon.

Writes trip/data/weather.json.
"""

from __future__ import annotations

import json
import pathlib
import time
import urllib.error
import urllib.request

ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"
YEARS = (2015, 2024)
UA = "TripItineraryBuilder/1.0 (https://github.com/tripdress; trip-builder@example.org)"

# key, label, lat, lon, (start month-day, end month-day) of our actual stay
PLACES = [
    ("singapore", "新加坡", 1.35, 103.82, (9, 24), (9, 24)),
    ("paris", "巴黎", 48.86, 2.35, (9, 25), (9, 28)),
    ("como", "科莫湖", 46.01, 9.26, (9, 28), (9, 28)),
    ("venice", "威尼斯", 45.44, 12.32, (9, 28), (9, 29)),
    ("florence", "佛罗伦萨", 43.77, 11.26, (9, 29), (9, 30)),
    ("rome", "罗马", 41.90, 12.50, (9, 30), (10, 2)),
    ("mallorca", "马略卡", 39.57, 2.65, (10, 2), (10, 5)),
    ("barcelona", "巴塞罗那", 41.39, 2.17, (10, 5), (10, 6)),
]


def get(url: str, tries: int = 4) -> dict:
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read().decode("utf-8"))
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as e:
            if attempt == tries - 1:
                raise
            print(f"  retry {attempt + 1}: {e}")
            time.sleep(4 * (attempt + 1))
    raise RuntimeError("unreachable")


def in_window(month: int, day: int, start: tuple, end: tuple) -> bool:
    """Window never crosses a year boundary here, so a plain tuple compare works."""
    return start <= (month, day) <= end


def main() -> None:
    out = {}
    for key, label, lat, lon, start, end in PLACES:
        url = (
            f"{ARCHIVE}?latitude={lat}&longitude={lon}"
            f"&start_date={YEARS[0]}-01-01&end_date={YEARS[1]}-12-31"
            "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum"
            "&timezone=auto"
        )
        print(f"{label} ...")
        data = get(url)["daily"]

        highs, lows, precip = [], [], []
        for date, hi, lo, pr in zip(
            data["time"], data["temperature_2m_max"], data["temperature_2m_min"], data["precipitation_sum"]
        ):
            _, m, d = (int(x) for x in date.split("-"))
            if not in_window(m, d, start, end):
                continue
            if hi is not None:
                highs.append(hi)
            if lo is not None:
                lows.append(lo)
            if pr is not None:
                precip.append(pr)

        # a "wet day" is the threshold most forecasts use for noticeable rain
        wet = sum(1 for p in precip if p >= 1.0)
        out[key] = {
            "label": label,
            "high": round(sum(highs) / len(highs), 1),
            "low": round(sum(lows) / len(lows), 1),
            "wetShare": round(wet / len(precip), 3) if precip else None,
            "samples": len(highs),
            "window": f"{start[0]}.{start[1]}–{end[0]}.{end[1]}",
        }
        print("   ", out[key])
        time.sleep(1.0)

    dest = pathlib.Path(__file__).resolve().parents[1] / "data" / "weather.json"
    dest.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("wrote", dest)


if __name__ == "__main__":
    main()
