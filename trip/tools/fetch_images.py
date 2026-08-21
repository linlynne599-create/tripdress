"""Resolve Wikipedia lead images for every place in the itinerary.

Writes trip/data/images.json mapping our internal place key -> hotlinkable image URL.
Titles are batched per language (the API allows 50 per call) because per-title
requests get rate limited hard.

Run again whenever places are added to PLACES; already-resolved keys are reused
from the existing images.json unless --refresh is passed.
"""

from __future__ import annotations

import argparse
import collections
import json
import pathlib
import time
import urllib.error
import urllib.parse
import urllib.request

# key -> (wiki language, article title)
PLACES = {
    "xiamen": ("en", "Xiamen"),
    "singapore": ("en", "Marina Bay Sands"),
    "singapore-food": ("en", "Hainanese chicken rice"),
    "doha": ("en", "Hamad International Airport"),
    "paris": ("en", "Paris"),
    "louvre": ("en", "Louvre"),
    "champs-elysees": ("en", "Champs-Élysées"),
    "arc-de-triomphe": ("en", "Arc de Triomphe"),
    "seine": ("en", "Seine"),
    "eiffel": ("en", "Eiffel Tower"),
    "luxembourg": ("en", "Jardin du Luxembourg"),
    "shakespeare": ("en", "Shakespeare and Company (bookstore)"),
    "notre-dame": ("en", "Notre-Dame de Paris"),
    "orsay": ("en", "Musée d'Orsay"),  # no lead photo on any wiki -> COMMONS_OVERRIDES
    "marais": ("en", "Le Marais"),
    "jazz-bar": ("en", "Le Caveau de la Huchette"),
    "orangerie": ("en", "Musée de l'Orangerie"),
    "opera-garnier": ("en", "Palais Garnier"),
    "lafayette": ("en", "Galeries Lafayette"),
    "montmartre": ("en", "Sacré-Cœur, Paris"),
    "milan": ("en", "Milan Cathedral"),
    "varenna": ("en", "Varenna"),
    "bellagio": ("it", "Bellagio"),
    "como": ("en", "Lake Como"),
    "venice": ("en", "Venice"),
    "venice-walk": ("en", "Grand Canal (Venice)"),
    "florence": ("en", "Florence Cathedral"),
    "signoria": ("en", "Piazza della Signoria"),
    "ponte-vecchio": ("en", "Ponte Vecchio"),
    "piazzale-michelangelo": ("it", "Piazzale Michelangelo"),
    "colosseum": ("en", "Colosseum"),
    "roman-forum": ("en", "Roman Forum"),
    "monti": ("it", "Monti (rione di Roma)"),
    "pantheon": ("en", "Pantheon, Rome"),
    "trevi": ("en", "Trevi Fountain"),
    "st-peters-square": ("en", "St. Peter's Square"),
    "st-peters": ("en", "St. Peter's Basilica"),
    "sant-angelo": ("en", "Ponte Sant'Angelo"),
    "bocca": ("en", "Bocca della Verità"),
    "orange-garden": ("it", "Giardino degli Aranci"),
    "malta-keyhole": ("en", "Villa del Priorato di Malta"),
    "palma": ("en", "Palma Cathedral"),
    "mallorca": ("en", "Mallorca"),
    "soller": ("en", "Sóller"),
    "valldemossa": ("en", "Valldemossa"),
    "formentor": ("en", "Cap de Formentor"),
    "drach": ("en", "Cuevas del Drach"),
    "cala-llombards": ("en", "Santanyí"),
    "barcelona": ("en", "Barcelona"),
    "casa-batllo": ("en", "Casa Batlló"),
    "casa-mila": ("en", "Casa Milà"),
    "sagrada": ("en", "Sagrada Família"),
    "tibidabo": ("en", "Tibidabo"),
    "picasso-museum": ("en", "Museu Picasso"),
    "el-corte-ingles": ("en", "El Corte Inglés"),
    "passeig-de-gracia": ("en", "Passeig de Gràcia"),
}

# Places whose Wikipedia article lead image is unusable (missing, or a flag /
# coat of arms / logo instead of a photo). key -> Commons file name.
COMMONS_OVERRIDES = {
    "orsay": "Musée d'Orsay - 2016.jpg",
    "mallorca": "Serra de Tramuntana Mallorca 2008 26.JPG",
    "monti": "Rione I Monti, Roma, Italy - panoramio (20).jpg",
    "el-corte-ingles": "El Corte Inglés Barcelona Plaça de Catalunya 2013.jpg",
}

DEST = pathlib.Path(__file__).resolve().parents[1] / "data" / "images.json"
BATCH = 40
THUMB_WIDTH = 1600


def api_get(wiki: str, params: dict[str, str], attempts: int = 5) -> dict:
    host = "commons.wikimedia.org" if wiki == "commons" else f"{wiki}.wikipedia.org"
    url = f"https://{host}/w/api.php?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "trip-itinerary-builder/1.0 (personal itinerary page)"})
    delay = 2.0
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as exc:
            if exc.code != 429 or attempt == attempts - 1:
                raise
            print(f"    429, retrying in {delay:.0f}s")
            time.sleep(delay)
            delay *= 2
    raise RuntimeError("unreachable")


def resolve_batch(lang: str, titles: list[str]) -> dict[str, str]:
    """Map requested title -> image URL for one batch."""
    data = api_get(
        lang,
        {
            "action": "query",
            "format": "json",
            "formatversion": "2",
            "prop": "pageimages",
            "piprop": "thumbnail",
            "pithumbsize": str(THUMB_WIDTH),
            "redirects": "1",
            "titles": "|".join(titles),
        },
    )
    query = data.get("query", {})

    # Follow normalization + redirect hops back to the title we asked for.
    alias_to_requested: dict[str, str] = {}
    for hop in query.get("normalized", []) + query.get("redirects", []):
        alias_to_requested[hop["to"]] = alias_to_requested.get(hop["from"], hop["from"])

    out: dict[str, str] = {}
    for page in query.get("pages", []):
        thumb = page.get("thumbnail")
        if not thumb:
            continue
        title = page.get("title", "")
        requested = alias_to_requested.get(title, title)
        out[requested] = thumb["source"].split("?")[0]
    return out


def commons_thumb(filename: str) -> str | None:
    data = api_get(
        "commons",
        {
            "action": "query",
            "format": "json",
            "formatversion": "2",
            "prop": "imageinfo",
            "iiprop": "url",
            "iiurlwidth": str(THUMB_WIDTH),
            "titles": "File:" + filename,
        },
    )
    pages = data.get("query", {}).get("pages", [])
    if not pages or "imageinfo" not in pages[0]:
        return None
    return pages[0]["imageinfo"][0]["thumburl"].split("?")[0]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true", help="ignore cached images.json")
    args = parser.parse_args()

    cached: dict[str, str] = {}
    if DEST.exists() and not args.refresh:
        cached = json.loads(DEST.read_text(encoding="utf-8"))

    todo = {k: v for k, v in PLACES.items() if k not in cached and k not in COMMONS_OVERRIDES}
    print(f"{len(cached)} cached, {len(todo)} to fetch")

    by_lang: dict[str, list[str]] = collections.defaultdict(list)
    for key, (lang, title) in todo.items():
        by_lang[lang].append(title)

    resolved: dict[tuple[str, str], str] = {}
    for lang, titles in by_lang.items():
        for i in range(0, len(titles), BATCH):
            chunk = titles[i : i + BATCH]
            print(f"  {lang}: batch of {len(chunk)}")
            for title, src in resolve_batch(lang, chunk).items():
                resolved[(lang, title)] = src
            time.sleep(1.5)

    out = dict(cached)
    missing: list[str] = []
    for key, (lang, title) in PLACES.items():
        if key in out:
            continue
        if key in COMMONS_OVERRIDES:
            src = commons_thumb(COMMONS_OVERRIDES[key])
            label = "commons:" + COMMONS_OVERRIDES[key]
        else:
            src = resolved.get((lang, title))
            label = f"{lang}:{title}"
        if src:
            out[key] = src
        else:
            missing.append(f"{key} ({label})")

    # Keep the file ordered like PLACES so diffs stay readable.
    ordered = {k: out[k] for k in PLACES if k in out}
    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text(json.dumps(ordered, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"\n{len(ordered)}/{len(PLACES)} resolved -> {DEST}")
    if missing:
        print("missing:\n  " + "\n  ".join(missing))


if __name__ == "__main__":
    main()
