"""Turn world-atlas TopoJSON into a small GeoJSON of just the countries the map shows.

Downloads countries-50m.json (50m is needed so the Balearic Islands survive),
decodes the TopoJSON arcs, clips to a Western-Europe bounding box, rounds
coordinates, and writes trip/data/europe.geo.json.
"""

from __future__ import annotations

import json
import pathlib
import urllib.request

SRC = "https://unpkg.com/world-atlas@2.0.2/countries-50m.json"
DATA_DIR = pathlib.Path(__file__).resolve().parents[1] / "data"
DEST = DATA_DIR / "europe.geo.json"
# Same payload wrapped as a script so index.html also works over file://,
# where fetching a local .json is blocked.
DEST_JS = DATA_DIR / "europe-geo.js"

WANTED = {
    "France", "Italy", "Spain", "Portugal", "Switzerland", "Germany",
    "Belgium", "Netherlands", "Luxembourg", "Austria", "Slovenia",
    "Croatia", "United Kingdom", "Ireland", "Andorra", "Monaco",
    "San Marino", "Vatican", "Morocco", "Algeria", "Tunisia",
    "Czechia", "Bosnia and Herz.", "Montenegro", "Albania", "Serbia",
    "Hungary", "Slovakia", "Poland", "Denmark",
}

# Only keep geometry inside this window; keeps the file small and the map tight.
BBOX = (-11.0, 34.0, 22.0, 56.0)  # lon_min, lat_min, lon_max, lat_max
PRECISION = 2


def decode_arcs(topo: dict) -> list[list[list[float]]]:
    scale = topo["transform"]["scale"]
    translate = topo["transform"]["translate"]
    out = []
    for arc in topo["arcs"]:
        x = y = 0
        points = []
        for dx, dy in arc:
            x += dx
            y += dy
            points.append([x * scale[0] + translate[0], y * scale[1] + translate[1]])
        out.append(points)
    return out


def ring(arcs: list[list[list[float]]], indexes: list[int]) -> list[list[float]]:
    points: list[list[float]] = []
    for idx in indexes:
        if idx < 0:
            seg = arcs[~idx][::-1]
        else:
            seg = arcs[idx]
        points.extend(seg if not points else seg[1:])
    return points


def intersects(coords: list[list[float]]) -> bool:
    lon_min, lat_min, lon_max, lat_max = BBOX
    return any(lon_min <= p[0] <= lon_max and lat_min <= p[1] <= lat_max for p in coords)


def round_ring(coords: list[list[float]]) -> list[list[float]]:
    out: list[list[float]] = []
    for lon, lat in coords:
        p = [round(lon, PRECISION), round(lat, PRECISION)]
        if not out or p != out[-1]:
            out.append(p)
    if len(out) >= 3 and out[0] != out[-1]:
        out.append(out[0])
    return out


def main() -> None:
    req = urllib.request.Request(SRC, headers={"User-Agent": "TripItineraryBuilder/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        topo = json.load(resp)

    arcs = decode_arcs(topo)
    features = []

    for geom in topo["objects"]["countries"]["geometries"]:
        name = geom.get("properties", {}).get("name")
        if name not in WANTED:
            continue

        if geom["type"] == "Polygon":
            polygons = [geom["arcs"]]
        elif geom["type"] == "MultiPolygon":
            polygons = geom["arcs"]
        else:
            continue

        kept = []
        for poly in polygons:
            rings = [ring(arcs, part) for part in poly]
            if not intersects(rings[0]):
                continue
            rounded = [round_ring(r) for r in rings]
            rounded = [r for r in rounded if len(r) >= 4]
            if rounded:
                kept.append(rounded)

        if kept:
            features.append(
                {
                    "type": "Feature",
                    "properties": {"name": name},
                    "geometry": {"type": "MultiPolygon", "coordinates": kept},
                }
            )

    fc = {"type": "FeatureCollection", "features": features}
    DEST.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(fc, separators=(",", ":"))
    DEST.write_text(payload, encoding="utf-8")
    DEST_JS.write_text(f"window.EUROPE_GEO = {payload};\n", encoding="utf-8")
    size_kb = DEST.stat().st_size // 1024
    print(f"{len(features)} countries -> {DEST} + {DEST_JS.name} ({size_kb} KB)")
    print("kept: " + ", ".join(sorted(f["properties"]["name"] for f in features)))


if __name__ == "__main__":
    main()
