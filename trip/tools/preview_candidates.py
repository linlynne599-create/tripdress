"""Print + preview several Commons candidates per key so a human can pick.

The automatic scoring in fetch_pov_images.py gets most photos right, but for a
dozen spots it picked something technically correct and visually useless (a
close-up of one statue, a street with nothing in it). This dumps a contact
sheet of candidates plus a numbered list, so the good one can be pinned as an
override.

Usage: python3 tools/preview_candidates.py            # uses CHECK below
Output: /tmp/cand-sheet.jpg and a printed index.
"""

from __future__ import annotations

import json
import math
import pathlib
import urllib.parse
import urllib.request
import time

from PIL import Image, ImageDraw, ImageFont

import fetch_pov_images as F

CHECK = {
    "monti": ["Rione Monti Rome street", "via Panisperna Rome", "Monti district Rome"],
    "seine": ["Bateaux Mouches Paris", "sightseeing boat Seine Paris", "Seine river boat Paris"],
    "paris": ["Paris cafe terrace people", "rue Montorgueil Paris", "Paris boulevard shops people"],
    "marais": ["Place des Vosges Paris arcade", "rue des Francs-Bourgeois Paris", "Marais Paris shops"],
    "sant-angelo": ["Castel Sant'Angelo Rome bridge", "Ponte Sant'Angelo Rome", "Castel Sant'Angelo Tiber"],
    "orange-garden": ["Giardino degli Aranci view of Rome", "Parco Savello terrace Rome", "Aventine orange garden"],
    "casa-batllo": ["Casa Batllo facade Barcelona", "Casa Batllo balcony", "Casa Batllo interior stairs"],
    "formentor": ["Mirador del Mal Pas Formentor", "Cap de Formentor road", "Formentor viewpoint Mallorca"],
    "el-corte-ingles": ["Placa de Catalunya Barcelona", "Plaça de Catalunya fountain people"],
    "doha": ["Hamad International Airport lamp bear", "Hamad airport interior", "Doha airport concourse"],
    "montmartre": ["Sacre-Coeur Montmartre steps", "Montmartre street cafe", "rue Lepic Montmartre"],
    "barcelona": ["La Rambla Barcelona people", "Barri Gotic Barcelona alley", "Gothic Quarter Barcelona street"],
}

PER_KEY = 6
CW, CH, LAB = 200, 133, 16
OUT = pathlib.Path("/tmp/cand-sheet.jpg")


def main() -> None:
    picked = {}
    for key, queries in CHECK.items():
        found, seen = [], set()
        for rank, q in enumerate(queries):
            for t in F.search(q, limit=10):
                if t not in seen:
                    seen.add(t)
                    found.append((t, rank))
            time.sleep(0.4)
        info = F.info_batch([t for t, _ in found])
        ranked = sorted(
            ((F.score(key, t, info[t], r), t) for t, r in found if t in info),
            key=lambda x: -x[0],
        )
        picked[key] = [(s, t, info[t]) for s, t in ranked if s > -99][:PER_KEY]
        print(f"\n== {key}")
        for i, (s, t, _) in enumerate(picked[key]):
            print(f"  {i}  ({s:4.1f})  {t}")

    rows = len(picked)
    sheet = Image.new("RGB", (PER_KEY * CW, rows * (CH + LAB)), (250, 246, 238))
    dr = ImageDraw.Draw(sheet)
    try:
        f = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 11)
    except Exception:
        f = ImageFont.load_default()

    for r, (key, cands) in enumerate(picked.items()):
        for c, (s, t, ii) in enumerate(cands):
            url = ii.get("thumburl") or ii["url"]
            try:
                req = urllib.request.Request(url, headers={"User-Agent": F.UA})
                with urllib.request.urlopen(req, timeout=60) as resp:
                    raw = resp.read()
                tmp = pathlib.Path(f"/tmp/_c{r}{c}.jpg")
                tmp.write_bytes(raw)
                im = Image.open(tmp).convert("RGB")
            except Exception as e:
                print("thumb failed", key, c, e)
                continue
            tr = CW / CH
            w, h = im.size
            if w / h > tr:
                nw = int(h * tr)
                im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
            else:
                nh = int(w / tr)
                im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
            x, y = c * CW, r * (CH + LAB)
            sheet.paste(im.resize((CW, CH), Image.LANCZOS), (x, y))
            dr.rectangle([x, y + CH, x + CW, y + CH + LAB], fill=(30, 26, 22))
            dr.text((x + 3, y + CH + 2), f"{key} #{c}", font=f, fill=(255, 250, 240))
            time.sleep(0.2)

    sheet.save(OUT, quality=78)
    (pathlib.Path("/tmp/cand-index.json")).write_text(
        json.dumps({k: [t for _, t, _ in v] for k, v in picked.items()}, ensure_ascii=False, indent=1),
        encoding="utf-8",
    )
    print("\nwrote", OUT, sheet.size)


if __name__ == "__main__":
    main()
