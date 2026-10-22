"""Hämtar spårtrafik, matbutiker, parker och badplatser från OpenStreetMap (Overpass API)."""
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

RAW = Path(__file__).parent / "raw"
BBOX = "58.70,17.20,60.00,19.40"  # Stockholms län + pendeltåg till Uppsala
ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]

QUERIES = {
    # Linjerelationer för tunnelbana, pendeltåg, lokalbanor, spårvagn
    "rail_routes": f"""
[out:json][timeout:300];
(
  relation["type"="route"]["route"~"^(subway|light_rail|tram|train)$"]["network"~"SL|Storstockholms Lokaltrafik|UL|Upptåget|SJ|Mälartåg",i]({BBOX});
);
out body;
>;
out skel qt;
""",
    "stations": f"""
[out:json][timeout:300];
(
  node["railway"~"^(station|halt|tram_stop)$"]({BBOX});
  node["public_transport"="station"]({BBOX});
);
out body;
""",
    "groceries": f"""
[out:json][timeout:300];
(
  node["shop"~"^(supermarket|convenience)$"]({BBOX});
  way["shop"~"^(supermarket|convenience)$"]({BBOX});
);
out center tags;
""",
    "kindergartens": f"""
[out:json][timeout:300];
(
  node["amenity"="kindergarten"]({BBOX});
  way["amenity"="kindergarten"]({BBOX});
);
out center tags;
""",
    "nature": f"""
[out:json][timeout:600];
(
  way["leisure"~"^(park|nature_reserve)$"]({BBOX});
  relation["leisure"~"^(park|nature_reserve)$"]({BBOX});
  relation["boundary"="protected_area"]({BBOX});
  node["leisure"="bathing_place"]({BBOX});
  way["leisure"="bathing_place"]({BBOX});
  node["natural"="beach"]({BBOX});
  way["natural"="beach"]({BBOX});
);
out center tags;
""",
}


def run(name, q):
    for attempt in range(6):
        url = ENDPOINTS[attempt % len(ENDPOINTS)]
        try:
            data = urllib.parse.urlencode({"data": q}).encode()
            req = urllib.request.Request(url, data=data, headers={"User-Agent": "stockholm-bostad/0.1 (personal research)"})
            with urllib.request.urlopen(req, timeout=900) as r:
                js = json.load(r)
            (RAW / f"osm_{name}.json").write_text(json.dumps(js), encoding="utf8")
            print(name, len(js["elements"]), "element")
            return
        except Exception as e:
            print("  retry", name, url, e)
            time.sleep(15)
    raise RuntimeError(name)


if __name__ == "__main__":
    import sys
    for n in sys.argv[1:] or QUERIES:
        run(n, QUERIES[n])
