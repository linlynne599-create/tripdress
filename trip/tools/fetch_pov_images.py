"""Re-pick every itinerary photo for a tourist's-eye view instead of a postcard.

The old set came from Wikipedia lead images, which are almost all wide
establishing shots. Here we search Commons with queries aimed at what you
actually see while visiting (interiors, streets, the view from the queue) and
score candidates so ground-level shots win and aerials/panoramas lose.

Writes trip/data/images.json + trip/data/credits.json and downloads into
trip/assets/img/.
"""

from __future__ import annotations

import json
import pathlib
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = "https://commons.wikimedia.org/w/api.php"
UA = "TripItineraryBuilder/1.0 (https://github.com/tripdress; trip-builder@example.org)"
IMG_DIR = pathlib.Path(__file__).resolve().parents[1] / "assets" / "img"
DATA_DIR = pathlib.Path(__file__).resolve().parents[1] / "data"
TARGET_WIDTH = 1400

# What you'd actually be looking at, standing there.
QUERIES = {
    # ---- 出发 / 中转
    "xiamen": ["Xiamen Gaoqi International Airport terminal", "Xiamen street"],
    "singapore": ["Gardens by the Bay Supertree Grove visitors", "Marina Bay Sands waterfront promenade people"],
    "singapore-food": ["hawker centre Singapore food stall", "bak kut teh"],
    "doha": ["Hamad International Airport interior", "Doha airport terminal"],
    # ---- 巴黎
    "paris": ["Paris street cafe terrace", "Paris street view pedestrians"],
    "eiffel": ["Eiffel Tower from below", "Eiffel Tower Champ de Mars visitors"],
    "louvre": ["Louvre Pyramid courtyard visitors", "Louvre museum interior visitors"],
    "notre-dame": ["Notre-Dame de Paris west facade visitors", "Notre-Dame de Paris from the square"],
    "luxembourg": ["Jardin du Luxembourg chairs pond people", "Luxembourg Garden Paris visitors"],
    "shakespeare": ["Shakespeare and Company bookshop Paris", "Shakespeare and Company interior"],
    "orsay": ["Musee d'Orsay main hall", "Gare d'Orsay interior museum", "Orsay museum visitors"],
    "marais": ["Le Marais Paris street", "rue des Rosiers Paris"],
    "jazz-bar": ["Caveau de la Huchette", "jazz club cellar interior Paris"],
    "orangerie": ["Musee de l'Orangerie Paris", "Orangerie Nympheas oval room", "Orangerie museum Tuileries"],
    "opera-garnier": ["Palais Garnier grand staircase", "Palais Garnier auditorium interior"],
    "lafayette": ["Galeries Lafayette Haussmann dome interior", "Galeries Lafayette interior balconies"],
    "montmartre": ["Montmartre stairs street", "rue Montmartre Paris steps"],
    "arc-de-triomphe": ["Arc de Triomphe from Champs Elysees", "Arc de Triomphe street level"],
    "champs-elysees": ["Champs Elysees sidewalk pedestrians", "avenue des Champs Elysees shops"],
    "seine": ["Seine quay Paris people", "Pont des Arts Seine Paris", "Seine riverbank Paris walk"],
    # ---- 米兰 / 科莫湖
    "milan": ["Milano Centrale railway station interior", "Milano Centrale concourse"],
    "varenna": ["Varenna lakefront promenade", "Varenna village waterfront path"],
    "bellagio": ["Bellagio Lake Como waterfront street", "Bellagio stairs alley"],
    "como": ["Lake Como ferry deck view", "Lake Como boat passengers"],
    # ---- 威尼斯
    "venice": ["Venice canal gondola", "Venice narrow canal boats"],
    "venice-walk": ["Libreria Acqua Alta Venice", "Venice bookshop interior boat"],
    # ---- 佛罗伦萨
    "florence": ["Florence Cathedral dome from the street", "Piazza del Duomo Florence visitors"],
    "signoria": ["Piazza della Signoria Loggia dei Lanzi statues visitors", "Piazza della Signoria tourists"],
    "ponte-vecchio": ["Ponte Vecchio shops on the bridge", "Ponte Vecchio walkway"],
    "piazzale-michelangelo": ["Piazzale Michelangelo view of Florence", "Piazzale Michelangelo terrace people"],
    # ---- 罗马
    "colosseum": ["Colosseum interior arena visitors", "Colosseum inside tiers"],
    "roman-forum": ["Forum Romanum via sacra", "Foro Romano Roma", "Palatine Hill Rome"],
    "pantheon": ["Pantheon Rome interior oculus", "Pantheon Rome inside dome"],
    "trevi": ["Trevi Fountain crowd", "Trevi Fountain tourists"],
    "st-peters": ["St Peter's Basilica interior nave", "Saint Peter's Basilica inside"],
    "st-peters-square": ["Saint Peter's Square colonnade visitors", "St Peter's Square Vatican people"],
    "sant-angelo": ["Ponte Sant'Angelo statues Rome", "Castel Sant'Angelo from the bridge"],
    "monti": ["Rione Monti Rome", "via dei Serpenti Rome", "Monti Rome"],
    "orange-garden": ["Giardino degli Aranci Rome terrace view", "Parco Savello Rome"],
    "bocca": ["Bocca della Verita", "Mouth of Truth Rome"],
    "malta-keyhole": ["Aventine keyhole Rome", "Villa del Priorato di Malta garden"],
    # ---- 马略卡
    "palma": ["Palma de Mallorca old town", "Passeig del Born Palma", "Palma de Mallorca cathedral street"],
    "mallorca": ["Serra de Tramuntana road", "Mallorca mountain road view"],
    "cala-llombards": ["Cala Llombards beach", "Cala Llombards Mallorca cove"],
    "formentor": ["Cap de Formentor", "Formentor Mallorca", "Mirador Es Colomer Mallorca"],
    "soller": ["Soller tram", "Port de Soller tram street"],
    "valldemossa": ["Valldemossa street", "Valldemossa Mallorca alley flowers"],
    "drach": ["Cuevas del Drach interior lake", "Coves del Drach cave"],
    # ---- 巴塞罗那
    "barcelona": ["Barcelona Gothic Quarter street", "Barcelona street cafe people"],
    "sagrada": ["Sagrada Familia interior columns", "Sagrada Familia nave inside"],
    "casa-batllo": ["Casa Batllo facade street", "Casa Batllo interior"],
    "casa-mila": ["Casa Mila roof terrace chimneys", "La Pedrera rooftop"],
    "passeig-de-gracia": ["Passeig de Gracia sidewalk", "Passeig de Gracia Barcelona street"],
    "picasso-museum": ["Museu Picasso Barcelona courtyard", "Museu Picasso Barcelona entrance"],
    "tibidabo": ["Tibidabo amusement park", "Tibidabo ferris wheel"],
    "el-corte-ingles": ["El Corte Ingles Placa de Catalunya", "Placa de Catalunya Barcelona people"],
}

# Commons search matches loosely, so every candidate must also prove it is the
# right place (Kyoto came back for "Paris street", Chartres for Notre-Dame).
MUST = {
    "xiamen": r"xiamen",
    "singapore": r"singapore|gardens by the bay|marina bay",
    "singapore-food": r"singapore|hawker|satay|laksa|bak kut|lagoon food",
    "doha": r"doha|hamad",
    "paris": r"paris",
    "eiffel": r"eiffel",
    "louvre": r"louvre",
    "notre-dame": r"notre.?dame",
    "luxembourg": r"luxembourg",
    "shakespeare": r"shakespeare",
    "orsay": r"orsay",
    "marais": r"marais|rosiers",
    "jazz-bar": r"huchette|jazz",
    "orangerie": r"orangerie",
    "opera-garnier": r"garnier|op[eé]ra",
    "lafayette": r"lafayette",
    "montmartre": r"montmartre|75018|sacr[eé].?c",
    "arc-de-triomphe": r"arc de triomphe",
    "champs-elysees": r"champs.?[eé]lys[eé]es",
    "seine": r"seine",
    "milan": r"milano|milan",
    "varenna": r"varenna",
    "bellagio": r"bellagio",
    "como": r"como",
    "venice": r"venice|venezia|venise",
    "venice-walk": r"acqua alta|venice|venezia",
    "florence": r"florence|firenze",
    "signoria": r"signoria|lanzi",
    "ponte-vecchio": r"ponte vecchio",
    "piazzale-michelangelo": r"michelangelo",
    "colosseum": r"colosse|colise|coliseum|flavian amphi",
    "roman-forum": r"roman forum|forum romanum|foro romano|palatine|palatino",
    "pantheon": r"pantheon|panth[eé]on",
    "trevi": r"trevi",
    "st-peters": r"peter.?s basilica|san pietro",
    "st-peters-square": r"peter.?s square|piazza san pietro",
    "sant-angelo": r"sant.?.?angelo",
    "monti": r"monti",
    "orange-garden": r"aranci|savello",
    "bocca": r"bocca della verit|mouth of truth",
    "malta-keyhole": r"keyhole|priorato di malta|aventine",
    "palma": r"palma",
    "mallorca": r"mallorca|majorca|tramuntana",
    "cala-llombards": r"llombards",
    "formentor": r"formentor",
    "soller": r"s[oó]ller",
    "valldemossa": r"valldemossa",
    "drach": r"drach|drac\b",
    "barcelona": r"barcelona",
    "sagrada": r"sagrada",
    "casa-batllo": r"batll[oó]",
    "casa-mila": r"pedrera|casa mil[aà]",
    "passeig-de-gracia": r"passeig de gr[aà]cia",
    "picasso-museum": r"picasso",
    "tibidabo": r"tibidabo",
    "el-corte-ingles": r"corte ingl[eé]s|pla[cçz]a de catalu",
}

# Right name, wrong city.
FORBID = {
    "notre-dame": r"chartres|reims|amiens|strasbourg|rouen|montr[eé]al|saigon|bayeux|laon|senlis|dijon|luxembourg",
    "luxembourg": r"duchy|ville de luxembourg|gare de luxembourg",
    "bellagio": r"las vegas|nevada",
    "pantheon": r"paris|london|nashville|panth[eé]on de",
    "colosseum": r"las vegas|replica|lego|model|el jem|pula|verona",
    "palma": r"las palmas|gran canaria|scarabeo",
    "picasso-museum": r"paris|m[aá]laga|antibes",
    "opera-garnier": r"vienna|wien|sydney|milano|scala",
    "eiffel": r"replica|las vegas|tianducheng",
}

# Words that say "I was standing there" vs "this was shot from a helicopter".
GOOD = re.compile(
    r"interior|inside|street|alley|stair|steps|path|visitor|tourist|people|crowd|"
    r"terrace|cafe|market|entrance|hall|nave|room|walkway|promenade|sidewalk|"
    r"pedestrian|queue|deck|passenger|courtyard|from below|view from|shop",
    re.I,
)
BAD = re.compile(
    r"aerial|drone|from the air|bird.?s.?eye|satellite|panoram|skyline|"
    r"map|plan\b|diagram|logo|coat of arms|flag|poster|engraving|etching|"
    r"painting|drawing|lithograph|postcard|1[6-9]\d\d|model of|miniature",
    re.I,
)


# Hand-picked after eyeballing the candidates with preview_candidates.py: for
# these the scoring found the right place but a dull or abstract frame.
OVERRIDES = {
    "monti": "File:Monti - via Panisperna 1040339.JPG",
    "seine": "File:Sightseeing boat, Seine, Paris 26 October 2016.jpg",
    "paris": "File:Terrace cafe, Rue de Buci, Paris July 2010.jpg",
    "marais": "File:Paris 3e Place des Vosges Arcades 896.jpg",
    "sant-angelo": "File:0 Pont et château Sant'Angelo - Rome (1).JPG",
    "orange-garden": "File:Rom, Blick vom Giardino degli Aranci zum Kapitol.JPG",
    "casa-batllo": "File:Casa Batlló, Barcelona.jpg",
    "formentor": "File:Pollença - Ma-10 - (Mirador de Mal Pas) 04 ies.jpg",
    "el-corte-ingles": "File:El Corte Inglés Barcelona Plaça de Catalunya 2013.jpg",
    "doha": "File:Central Shopping area Hamad International Airport Doha (14314576525).jpg",
    "montmartre": "File:Approaching Sacre Coeur.jpg",
    "barcelona": "File:People walking along La Rambla.jpg",
}


def api(params: dict, tries: int = 4) -> dict:
    params = {**params, "format": "json", "formatversion": "2"}
    url = API + "?" + urllib.parse.urlencode(params)
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as e:
            if attempt == tries - 1:
                raise
            print(f"    retry {attempt + 1}: {e}")
            time.sleep(3 * (attempt + 1))
    raise RuntimeError("unreachable")


def search(query: str, limit: int = 12) -> list:
    res = api({
        "action": "query",
        "list": "search",
        "srsearch": f"filetype:bitmap {query}",
        "srnamespace": "6",
        "srlimit": str(limit),
    })
    return [s["title"] for s in res.get("query", {}).get("search", [])]


def info_batch(titles: list) -> dict:
    """imageinfo for up to 50 File: titles at a time."""
    out = {}
    for i in range(0, len(titles), 50):
        chunk = titles[i : i + 50]
        res = api({
            "action": "query",
            "titles": "|".join(chunk),
            "prop": "imageinfo",
            "iiprop": "url|size|extmetadata",
            "iiurlwidth": str(TARGET_WIDTH),
        })
        for page in res.get("query", {}).get("pages", []):
            ii = (page.get("imageinfo") or [None])[0]
            if ii:
                out[page["title"]] = ii
        time.sleep(0.8)
    return out


def score(key: str, title: str, ii: dict, query_rank: int) -> float:
    w, h = ii.get("width", 0), ii.get("height", 0)
    if not w or not h:
        return -99
    if not re.search(r"\.jpe?g$", title, re.I):
        return -99
    if w < 900:
        return -99

    ratio = w / h
    # cards are 3:2, so anything near that crops cleanly; very wide = panorama
    if ratio < 1.05 or ratio > 2.3:
        return -99

    meta = ii.get("extmetadata", {})
    desc = meta.get("ImageDescription", {}).get("value", "") or ""
    text = f"{title} {desc}"

    must = MUST.get(key)
    if must and not re.search(must, text, re.I):
        return -99
    forbid = FORBID.get(key)
    if forbid and re.search(forbid, text, re.I):
        return -99
    if BAD.search(text):
        return -99

    s = 0.0
    s -= abs(ratio - 1.5) * 2          # prefer 3:2-ish
    if GOOD.search(text):
        s += 4
    if query_rank == 0:
        s += 1.5                       # the first query is the framing I wanted
    if w >= 1600:
        s += 0.5
    return s


def shrink(path: pathlib.Path) -> None:
    if shutil.which("sips") is None or path.suffix.lower() not in (".jpg", ".jpeg"):
        return
    subprocess.run(
        ["sips", "-s", "format", "jpeg", "-s", "formatOptions", "72",
         "--resampleWidth", str(TARGET_WIDTH), str(path), "--out", str(path)],
        check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


def plain(html: str) -> str:
    return re.sub(r"<[^>]+>", "", html or "").strip()


def main() -> None:
    IMG_DIR.mkdir(parents=True, exist_ok=True)

    only = set(sys.argv[1:])
    todo = {k: v for k, v in QUERIES.items() if not only or k in only}

    # 1. gather candidates for every key, remembering which query found them
    candidates: dict[str, list] = {}
    for key, queries in todo.items():
        if key in OVERRIDES:
            candidates[key] = [(OVERRIDES[key], -1)]
            print(f"{key}: pinned")
            continue
        found: list = []
        seen = set()
        for rank, q in enumerate(queries):
            for t in search(q):
                if t not in seen:
                    seen.add(t)
                    found.append((t, rank))
            time.sleep(0.5)
        candidates[key] = found
        print(f"{key}: {len(found)} candidates")

    # 2. one imageinfo pass over every candidate
    every = sorted({t for ts in candidates.values() for t, _ in ts})
    print(f"\nfetching imageinfo for {len(every)} files ...")
    info = info_batch(every)

    # 3. pick the best per key, download it
    images, credits, missed = {}, {}, []
    for key, found in candidates.items():
        if key in OVERRIDES:
            ranked = [(99.0, t) for t, _ in found if t in info]
        else:
            ranked = sorted(
                ((score(key, t, info[t], rank), t) for t, rank in found if t in info),
                key=lambda x: -x[0],
            )
            ranked = [r for r in ranked if r[0] > -99]
        if not ranked:
            print(f"!! {key}: nothing passed the filters, keeping the old photo")
            missed.append(key)
            continue

        best_score, title = ranked[0]
        ii = info[title]
        url = ii.get("thumburl") or ii["url"]

        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=90) as r:
                blob = r.read()
        except Exception as e:
            print(f"!! {key}: download failed {e}")
            missed.append(key)
            continue

        dest = IMG_DIR / f"{key}.jpg"
        dest.write_bytes(blob)
        shrink(dest)

        meta = ii.get("extmetadata", {})
        images[key] = url
        credits[key] = {
            "file": title.replace("File:", ""),
            "source": ii.get("descriptionurl", ""),
            "license": plain(meta.get("LicenseShortName", {}).get("value", "")),
            "author": plain(meta.get("Artist", {}).get("value", ""))[:120],
        }
        print(f"{key}: {title}  (score {best_score:.1f}, {dest.stat().st_size // 1024} KB)")
        time.sleep(0.4)

    # merge rather than overwrite, so a partial run keeps the earlier entries
    for name, fresh in (("images.json", images), ("credits.json", credits)):
        path = DATA_DIR / name
        old = {}
        if path.exists():
            old = json.loads(path.read_text(encoding="utf-8"))
        old.update(fresh)
        path.write_text(json.dumps(old, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"\ndone: {len(images)}/{len(todo)} replaced")
    if missed:
        print("still on the old photo:", ", ".join(missed))


if __name__ == "__main__":
    main()
