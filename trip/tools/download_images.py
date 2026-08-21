"""Download the images listed in trip/data/images.json into trip/assets/img/.

Hotlinking upload.wikimedia.org gets rate limited (and their robot policy asks us
not to), so the page ships its own copies. Downloads are sequential and throttled.

Also writes trip/data/credits.json with the Commons file name + license for each
image so the page can attribute them.
"""

from __future__ import annotations

import json
import pathlib
import shutil
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
IMAGES = ROOT / "data" / "images.json"
CREDITS = ROOT / "data" / "credits.json"
OUT_DIR = ROOT / "assets" / "img"

# Wikimedia's robot policy 429s generic browser UAs; it wants a tool name + contact.
UA = "TripItineraryBuilder/1.0 (https://github.com/tripdress; trip-builder@example.org)"
DELAY = 0.4
MAX_WIDTH = 1600


def commons_filename(url: str) -> str:
    """Recover the original Commons file name from a thumb URL."""
    path = urllib.parse.urlparse(url).path
    parts = path.split("/")
    if "thumb" in parts:
        # .../commons/thumb/a/ab/Name.jpg/1920px-Name.jpg -> Name.jpg
        return urllib.parse.unquote(parts[-2])
    return urllib.parse.unquote(parts[-1])


def fetch(url: str, attempts: int = 6) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "image/*"})
    delay = 2.0
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.read()
        except urllib.error.HTTPError as exc:
            if exc.code not in (429, 503) or attempt == attempts - 1:
                raise
            print(f"      {exc.code}, waiting {delay:.0f}s")
            time.sleep(delay)
            delay *= 2
    raise RuntimeError("unreachable")


def shrink(path: pathlib.Path) -> None:
    """Cap width at MAX_WIDTH so the page stays light. Uses macOS sips; no-op elsewhere."""
    if shutil.which("sips") is None:
        return
    subprocess.run(
        ["sips", "--resampleWidth", str(MAX_WIDTH), str(path)],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def license_info(filename: str) -> dict[str, str]:
    params = {
        "action": "query",
        "format": "json",
        "formatversion": "2",
        "prop": "imageinfo",
        "iiprop": "extmetadata",
        "iiextmetadatafilter": "LicenseShortName|Artist|LicenseUrl",
        "titles": "File:" + filename,
    }
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.load(resp)
        meta = data["query"]["pages"][0]["imageinfo"][0]["extmetadata"]
    except Exception:  # noqa: BLE001
        return {}
    def plain(key: str) -> str:
        raw = meta.get(key, {}).get("value", "")
        # extmetadata values can contain HTML; strip tags crudely.
        out, depth = [], 0
        for ch in raw:
            if ch == "<":
                depth += 1
            elif ch == ">":
                depth -= 1
            elif depth == 0:
                out.append(ch)
        return "".join(out).strip()

    return {
        "file": filename,
        "author": plain("Artist"),
        "license": plain("LicenseShortName"),
        "source": "https://commons.wikimedia.org/wiki/File:" + urllib.parse.quote(filename.replace(" ", "_")),
    }


def main() -> None:
    urls: dict[str, str] = json.loads(IMAGES.read_text(encoding="utf-8"))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    credits: dict[str, dict[str, str]] = {}
    if CREDITS.exists():
        credits = json.loads(CREDITS.read_text(encoding="utf-8"))

    failed: list[str] = []
    for i, (key, url) in enumerate(urls.items(), 1):
        ext = pathlib.Path(urllib.parse.urlparse(url).path).suffix.lower() or ".jpg"
        if ext not in (".jpg", ".jpeg", ".png", ".webp"):
            ext = ".jpg"
        dest = OUT_DIR / f"{key}{ext}"

        if dest.exists() and dest.stat().st_size > 10_000:
            print(f"[{i:2d}/{len(urls)}] skip {key} (already {dest.stat().st_size // 1024} KB)")
        else:
            try:
                blob = fetch(url)
            except Exception as exc:  # noqa: BLE001
                print(f"[{i:2d}/{len(urls)}] FAIL {key}: {exc}")
                failed.append(key)
                continue
            dest.write_bytes(blob)
            shrink(dest)
            print(f"[{i:2d}/{len(urls)}] ok   {key} -> {dest.name} ({dest.stat().st_size // 1024} KB)")
            time.sleep(DELAY)

        if key not in credits:
            info = license_info(commons_filename(url))
            if info:
                credits[key] = info
            time.sleep(DELAY)

    CREDITS.write_text(json.dumps(credits, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\ndone. {len(urls) - len(failed)}/{len(urls)} images in {OUT_DIR}")
    if failed:
        print("failed: " + ", ".join(failed))


if __name__ == "__main__":
    main()
