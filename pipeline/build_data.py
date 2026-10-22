"""Bygger webbappens datafiler (web/public/data) från rådata i pipeline/raw.

Kör: .venv/Scripts/python build_data.py
"""
import heapq
import json
import math
from collections import defaultdict
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import LineString, Point, mapping, shape
from shapely.ops import transform, unary_union
from shapely.strtree import STRtree

ROOT = Path(__file__).parent
RAW = ROOT / "raw"
OUT = ROOT.parent / "web" / "public" / "data"
OUT.mkdir(parents=True, exist_ok=True)

to_sweref = Transformer.from_crs("EPSG:4326", "EPSG:3006", always_xy=True).transform
to_wgs = Transformer.from_crs("EPSG:3006", "EPSG:4326", always_xy=True).transform


def load(name):
    return json.load(open(RAW / name, encoding="utf8"))


def rnd(geom, nd=5):
    """GeoJSON-geometri med avrundade koordinater."""
    def r(c):
        if isinstance(c[0], (int, float)):
            return [round(c[0], nd), round(c[1], nd)]
        return [r(x) for x in c]
    m = mapping(geom)
    return {"type": m["type"], "coordinates": r(m["coordinates"])}


def dist_m(lon1, lat1, lon2, lat2):
    k = 111320.0
    return math.hypot((lon2 - lon1) * k * math.cos(math.radians((lat1 + lat2) / 2)), (lat2 - lat1) * 110540.0)


# --------------------------------------------------------------------------------------
# Kommuner och prisområden
# --------------------------------------------------------------------------------------
KOMMUN = {
    "0114": ("Upplands Väsby", "upplands-vasby"), "0115": ("Vallentuna", "vallentuna"), "0117": ("Österåker", "osteraker"),
    "0120": ("Värmdö", "varmdo"), "0123": ("Järfälla", "jarfalla"), "0125": ("Ekerö", "ekero"), "0126": ("Huddinge", "huddinge"),
    "0127": ("Botkyrka", "botkyrka"), "0128": ("Salem", "salem"), "0136": ("Haninge", "haninge"), "0138": ("Tyresö", "tyreso"),
    "0139": ("Upplands-Bro", "upplands-bro"), "0140": ("Nykvarn", "nykvarn"), "0160": ("Täby", "taby"),
    "0162": ("Danderyd", "danderyd"), "0163": ("Sollentuna", "sollentuna"), "0180": ("Stockholm", "stockholm"),
    "0181": ("Södertälje", "sodertalje"), "0182": ("Nacka", "nacka"), "0183": ("Sundbyberg", "sundbyberg"),
    "0184": ("Solna", "solna"), "0186": ("Lidingö", "lidingo"), "0187": ("Vaxholm", "vaxholm"),
    "0188": ("Norrtälje", "norrtalje"), "0191": ("Sigtuna", "sigtuna"), "0192": ("Nynäshamn", "nynashamn"),
}

# Stockholms RegSO -> Svensk Mäklarstatistiks stadsdelsområde (deras indelning följer de äldre
# stadsdelsområdena). Gamla stan/Storkyrkan saknar eget område och får "Centrala Stockholm".
STHLM_MS = {
    "vasastan-norrmalm": ["Gustav Vasa", "Klara-Jacob", "Norra Adolf Fredrik", "Södra Adolf Fredrik", "Östra Matteus",
                          "Västra Matteus", "Norra Johannes", "Södra Johannes"],
    "ostermalm": ["Engelbrekts kyrka", "Hedvig Eleonora", "Oscars kyrka", "Gärdet", "Hjorthagen-Värtahamnen",
                  "Tekniska Högskolan", "Universitetet", "Djurgården"],
    "kungsholmen": ["Kungsholm", "Kristineberg", "Marieberg", "Stadshagen", "Östra Sankt Göran", "Fredhäll"],
    "essingen": ["Lilla Essingen", "Stora Essingen"],
    "sodermalm": ["Mariatorget", "Mellersta Högalid", "Norra Högalid", "Södra Högalid", "Norra Sofia", "Södra Sofia",
                  "Västra Katarina", "Östra Katarina", "Södra Station", "Reimersholme-Långholmen", "Södra Hammarbyhamnen"],
    "centrala-stockholm": ["Storkyrkan"],
    "hagersten-liljeholmen": ["Aspudden", "Gröndal", "Hägersten", "Hägerstensåsen", "Liljeholmen", "Midsommarkransen",
                              "Västertorp", "Fruängen", "Mälarhöjden", "Västberga"],
    "brannkyrka-skarholmen": ["Skärholmen", "Sätra", "Bredäng", "Vårberg", "Älvsjö", "Solberga", "Långbro", "Herrängen",
                              "Liseberg", "Örby Slott", "Långsjö"],
    "enskede-skarpnack": ["Enskede Gård", "Enskededalen", "Enskedefältet", "Gamla Enskede", "Johanneshov", "Årsta",
                          "Östberga", "Stureby", "Svedmyra", "Bagarmossen", "Björkhagen", "Hammarbyhöjden", "Kärrtorp",
                          "Norra Skarpnäcks Gård", "Sydvästra Skarpnäcks gård-Orhem", "Östra Skarpnäcks gård-Flaten-Skrubba"],
    "farsta-vantor": ["Farsta", "Fagersjö", "Gubbängen", "Hökarängen", "Larsboda", "Sköndal", "Tallkrogen",
                      "Västra Farsta Strand-Farstanäset", "Östra Farsta Strand", "Bandhagen", "Högdalen", "Rågsved",
                      "Hagsätra", "Örby"],
    "bromma-vasterled": ["Abrahamsberg", "Alvik", "Beckomberga", "Bromma kyrka", "Eneby", "Höglandet", "Mariehäll",
                         "Nockeby", "Nockebyhov-Olovslund", "Riksby-Åkeshov", "Smedslätten", "Stora Mossen", "Traneberg",
                         "Ulvsunda", "Ulvsunda Industriområde", "Äppelviken", "Åkeslund", "Ålsten", "Norra Ängby",
                         "Södra Ängby", "Bällsta"],
    "hasselby-vallingby": ["Blackeberg", "Grimsta", "Hässelby Gård", "Hässelby Strand", "Hässelby Villastad", "Råcksta",
                           "Vinsta", "Vällingby", "Nälsta", "Kälvesta"],
    "spanga-kista": ["Akalla", "Husby", "Kista", "Rinkeby", "Tensta", "Bromsten", "Flysta", "Sundby", "Solhem-Lunda"],
}
STHLM_MS_NAME = {
    "vasastan-norrmalm": "Vasastan-Norrmalm", "ostermalm": "Östermalm", "kungsholmen": "Kungsholmen", "essingen": "Essingen",
    "sodermalm": "Södermalm", "centrala-stockholm": "Centrala Stockholm", "hagersten-liljeholmen": "Hägersten-Liljeholmen",
    "brannkyrka-skarholmen": "Brännkyrka-Skärholmen", "enskede-skarpnack": "Enskede-Skarpnäck", "farsta-vantor": "Farsta-Vantör",
    "bromma-vasterled": "Bromma-Västerled", "hasselby-vallingby": "Hässelby-Vällingby", "spanga-kista": "Spånga-Kista",
}
REGSO_TO_MS = {n: k for k, names in STHLM_MS.items() for n in names}


def price_summary(p):
    if not p:
        return None
    out = {"updated": p.get("updated"), "url": p.get("url")}
    for k in ("br3", "br12", "villa3", "villa12"):
        if p.get(k):
            out[k] = p[k]
    hist = {}
    for c, key in (("br-48m-prisutveckling", "br"), ("villa-48m-prisutveckling", "villa")):
        ch = (p.get("charts") or {}).get(c)
        if ch and ch["series"]:
            hist[key] = {"labels": ch["labels"], "values": ch["series"][0]}
    out["history"] = hist
    return out


# --------------------------------------------------------------------------------------
# Kollektivtrafiknät (spår) från OSM
# --------------------------------------------------------------------------------------
MODE = {  # medelfart mellan stationer (km/h), uppehåll (min), snittväntetid vid påstigning (min)
    "subway": (58, 0.35, 3.5), "light_rail": (32, 0.5, 4.5), "tram": (18, 0.4, 5),
    "commuter": (85, 1.0, 5), "local_train": (45, 0.6, 5), "regional": (115, 1.0, 7),
}
LINE_COLORS = {
    "10": "#0f7ec8", "11": "#0f7ec8", "13": "#e2312b", "14": "#e2312b",
    "17": "#3fa648", "18": "#3fa648", "19": "#3fa648",
    "40": "#ec5fa1", "41": "#ec5fa1", "43": "#ec5fa1", "43X": "#ec5fa1", "48": "#ec5fa1",
    "30": "#e07d10", "31": "#e07d10", "21": "#8a6d3b", "25": "#16a3a3", "26": "#16a3a3",
    "27": "#9b59b6", "28": "#9b59b6", "29": "#9b59b6", "7": "#8b8b8b", "12": "#8b8b8b", "8XX": "#9aa4b1",
}


def build_transit():
    rr = load("osm_rail_routes.json")
    nodes = {e["id"]: (e["lon"], e["lat"]) for e in rr["elements"] if e["type"] == "node"}
    st = load("osm_stations.json")
    stations = []
    for e in st["elements"]:
        t = e.get("tags", {})
        if t.get("name") and (t.get("public_transport") == "station" or t.get("railway") in ("station", "halt", "tram_stop")):
            name = {"Stockholm Cityterminalen": "Stockholm C", "Uppsala östra": "Uppsala C"}.get(t["name"], t["name"])
            stations.append((e["lon"], e["lat"], name))
    rels = [e for e in rr["elements"] if e["type"] == "relation"]

    # Välj en variant per linje: den med flest hållplatser
    best = {}
    for r in rels:
        t = r["tags"]
        net = t.get("network", "")
        ref = t.get("ref") or ""
        route = t.get("route")
        name = t.get("name", "")
        if route == "train" and net == "Mälartåg" and "Uppsala" in name and "Stockholm" in name:
            ref, mode, label = "8XX", "regional", "Mälartåg Stockholm–Uppsala"
        elif route == "subway" and ref in ("10", "11", "13", "14", "17", "18", "19"):
            mode, label = "subway", f"Tunnelbana {ref}"
        elif route == "light_rail" and ref in ("21", "30", "31"):
            mode, label = "light_rail", name.split(":")[0]
        elif route == "tram" and ref in ("7", "12"):
            mode, label = "tram", name.split(":")[0]
        elif route == "train" and net == "SL" and ref in ("40", "41", "43", "43X", "48"):
            mode, label = "commuter", f"Pendeltåg {ref}"
        elif route == "train" and net == "SL" and ref in ("25", "26", "27", "28", "29"):
            mode, label = "local_train", name.split(" ")[0] + " " + ref if not name.startswith("Roslagsbanan") else f"Roslagsbanan {ref}"
        else:
            continue
        stops = [m["ref"] for m in r["members"] if m["type"] == "node" and m["role"].startswith("stop") and m["ref"] in nodes]
        if not stops:  # vissa relationer har bara plattformar
            stops = [m["ref"] for m in r["members"] if m["type"] == "node" and m["role"].startswith("platform") and m["ref"] in nodes]
        if len(stops) < 2:
            continue
        if ref not in best or len(stops) > len(best[ref]["stops"]):
            best[ref] = {"ref": ref, "mode": mode, "label": label, "stops": stops}

    # Knyt varje hållplats till närmaste namngivna station (=bytespunkt)
    st_pts = [Point(to_sweref(lon, lat)) for lon, lat, _ in stations]
    st_tree = STRtree(st_pts)
    hubs = {}  # namn -> hub
    hub_list = []

    def hub_for(lon, lat):
        p = Point(to_sweref(lon, lat))
        i = st_tree.nearest(p)
        d = p.distance(st_pts[i])
        name = stations[i][2] if d < 450 else None
        if name is None:
            name = f"Hållplats {lat:.4f},{lon:.4f}"
        # samma namn inom 800 m räknas som samma bytespunkt
        key = name
        if key in hubs:
            h = hub_list[hubs[key]]
            if dist_m(h["lon"], h["lat"], lon, lat) < 800:
                return hubs[key]
            key = f"{name}#{len(hub_list)}"
        hubs[key] = len(hub_list)
        hub_list.append({"name": name, "lon": round(lon, 6), "lat": round(lat, 6), "lines": []})
        return hubs[key]

    lines = []
    edges = []  # (line_index, hubA, hubB, minuter)
    for ref, ln in sorted(best.items()):
        speed, dwell, wait = MODE[ln["mode"]]
        seq = []
        for nid in ln["stops"]:
            lon, lat = nodes[nid]
            h = hub_for(lon, lat)
            if not seq or seq[-1] != h:
                seq.append(h)
        li = len(lines)
        for h in seq:
            if ln["ref"] not in hub_list[h]["lines"]:
                hub_list[h]["lines"].append(ln["ref"])
        for a, b in zip(seq, seq[1:]):
            d = dist_m(hub_list[a]["lon"], hub_list[a]["lat"], hub_list[b]["lon"], hub_list[b]["lat"]) * 1.12
            minutes = d / 1000 / speed * 60 + dwell
            edges.append([li, a, b, round(minutes, 2)])
        lines.append({"ref": ln["ref"], "mode": ln["mode"], "label": ln["label"], "color": LINE_COLORS.get(ln["ref"], "#888"),
                      "wait": wait, "hubs": seq})
    # Gångbyten mellan närliggande stationer med olika namn (t.ex. T-Centralen–Stockholm City–Stockholm C)
    transfers = []
    for a in range(len(hub_list)):
        for b in range(a + 1, len(hub_list)):
            d = dist_m(hub_list[a]["lon"], hub_list[a]["lat"], hub_list[b]["lon"], hub_list[b]["lat"])
            if d < 450:
                transfers.append([a, b, round(d * 1.3 / 80 + 1, 1)])
    print("linjer", len(lines), "bytespunkter", len(hub_list), "sträckor", len(edges), "gångbyten", len(transfers))
    return {"hubs": hub_list, "lines": lines, "edges": edges, "transfers": transfers}


def access_minutes(d):
    """Tid från bostad till station: gång (≤1,3 km) annars buss/cykel som anslutning."""
    if d <= 1300:
        return d * 1.25 / 80.0  # 4,8 km/h med omvägsfaktor
    return 8 + d * 1.3 / 300.0  # väntan + anslutningsbuss ~18 km/h


def dijkstra_from(transit, hub_index):
    """Minsta restid (min) från en bytespunkt till alla andra, med väntetid vid byten."""
    lines = transit["lines"]
    adj = defaultdict(list)
    for li, a, b, m in transit["edges"]:
        adj[(a, li)].append(((b, li), m))
        adj[(b, li)].append(((a, li), m))
    hub_lines = defaultdict(set)
    for li, a, b, _ in transit["edges"]:
        hub_lines[a].add(li)
        hub_lines[b].add(li)
    walks = defaultdict(list)
    for a, b, m in transit.get("transfers", []):
        walks[a].append((b, m))
        walks[b].append((a, m))
    dist = {}
    pq = []
    for li in hub_lines[hub_index]:
        pq.append((lines[li]["wait"], (hub_index, li)))
    heapq.heapify(pq)
    best_hub = {hub_index: 0.0}
    while pq:
        d, s = heapq.heappop(pq)
        if s in dist:
            continue
        dist[s] = d
        h, li = s
        if d < best_hub.get(h, 1e9):
            best_hub[h] = d
        for t, m in adj[s]:
            if t not in dist:
                heapq.heappush(pq, (d + m, t))
        for lj in hub_lines[h]:
            if lj != li and (h, lj) not in dist:
                heapq.heappush(pq, (d + 2 + lines[lj]["wait"], (h, lj)))
        for h2, walk in walks[h]:
            for lj in hub_lines[h2]:
                if (h2, lj) not in dist:
                    heapq.heappush(pq, (d + walk + lines[lj]["wait"], (h2, lj)))
    return best_hub


# --------------------------------------------------------------------------------------
def main():
    deso_fc = load("DeSO_2025.json")["features"]
    regso_fc = load("RegSO_2025.json")["features"]
    scb = load("scb_stats.json")
    prices_raw = load("prices.json")
    regso_name = {f["properties"]["regsokod"]: f["properties"]["regsonamn"] for f in regso_fc}

    # ---------- Polisens utsatta områden (2025-12-01) ----------
    uso = json.load(open(RAW / "uso" / "uso_2025.geojson", encoding="utf8"))
    police = []
    for f in uso["features"]:
        p = f["properties"]
        if p["REGION"] != "Stockholm":
            continue
        g = shape(f["geometry"]).buffer(0)
        police.append({"name": p["NAMN"], "cat": "sarskilt" if p["KATEGORI"].startswith("Särskilt") else "utsatt",
                       "ort": p["ORT"], "lpo": p["LOKALPOLISOMRADE"], "since": p["AKTUALITET_START"], "geom": g})
    print("polisområden i region Stockholm", len(police))
    police_fc = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {k: v for k, v in pa.items() if k != "geom"},
         "geometry": rnd(transform(to_wgs, pa["geom"].simplify(5)), 5)} for pa in police]}
    (OUT / "police.geojson").write_text(json.dumps(police_fc, ensure_ascii=False), encoding="utf8")

    # ---------- Transit ----------
    transit = build_transit()
    hubs = transit["hubs"]
    hub_pts = [Point(to_sweref(h["lon"], h["lat"])) for h in hubs]
    hub_tree = STRtree(hub_pts)

    def hub_by_name(prefix):
        c = [i for i, h in enumerate(hubs) if h["name"].startswith(prefix)]
        return max(c, key=lambda i: len(hubs[i]["lines"])) if c else None

    t_central = hub_by_name("T-Centralen")
    sthlm_c = hub_by_name("Stockholm City") or hub_by_name("Stockholm Central")
    uppsala = hub_by_name("Uppsala C")
    tc = dijkstra_from(transit, t_central)
    for k in ("Vällingby", "Farsta strand", "Norsborg", "Akalla", "Rinkeby", "Mörby centrum", "Södertälje centrum", "Täby centrum", "Solna station", "Sickla"):
        i = hub_by_name(k)
        print(f"  T-C -> {k:18s} {round(tc.get(i, -1))} min (inkl. väntan)")
    for k in ("T-Centralen", "Stockholm C", "Odenplan", "Sollentuna", "Märsta", "Knivsta"):
        i = hub_by_name(k)
        if i is not None and uppsala is not None:
            print(f"  {k:14s} -> Uppsala {round(dijkstra_from(transit, i).get(uppsala, -1))} min")
    print("T-Centralen", t_central, "Stockholm C", sthlm_c, "Uppsala", uppsala, hubs[uppsala]["name"] if uppsala is not None else None)
    from_tc = dijkstra_from(transit, t_central)
    from_up = dijkstra_from(transit, uppsala) if uppsala is not None else {}

    # ---------- POI ----------
    gro = []
    for e in load("osm_groceries.json")["elements"]:
        t = e.get("tags", {})
        lon, lat = (e["lon"], e["lat"]) if e["type"] == "node" else (e["center"]["lon"], e["center"]["lat"])
        gro.append({"lon": round(lon, 6), "lat": round(lat, 6), "name": t.get("name") or t.get("brand") or "Butik",
                    "brand": t.get("brand"), "kind": t.get("shop")})
    nat_parks, nat_bath = [], []
    for e in load("osm_nature.json")["elements"]:
        t = e.get("tags", {})
        c = (e["lon"], e["lat"]) if e["type"] == "node" else ((e.get("center") or {}).get("lon"), (e.get("center") or {}).get("lat"))
        if c[0] is None:
            continue
        item = {"lon": round(c[0], 6), "lat": round(c[1], 6), "name": t.get("name")}
        if t.get("leisure") == "bathing_place" or t.get("natural") == "beach":
            nat_bath.append(item)
        elif t.get("name"):
            item["kind"] = "reserve" if t.get("leisure") == "nature_reserve" or t.get("boundary") == "protected_area" else "park"
            nat_parks.append(item)
    kinder = []
    for e in load("osm_kindergartens.json")["elements"]:
        t = e.get("tags", {})
        lon, lat = (e["lon"], e["lat"]) if e["type"] == "node" else (e["center"]["lon"], e["center"]["lat"])
        kinder.append({"lon": round(lon, 6), "lat": round(lat, 6), "name": t.get("name") or "Förskola"})
    schools = load("schools.json")

    def tree_of(items):
        pts = [Point(to_sweref(i["lon"], i["lat"])) for i in items]
        return pts, STRtree(pts)

    gro_super = [g for g in gro if g["kind"] == "supermarket"]
    gs_pts, gs_tree = tree_of(gro_super)
    ga_pts, ga_tree = tree_of(gro)
    pk_pts, pk_tree = tree_of(nat_parks)
    bt_pts, bt_tree = tree_of(nat_bath)
    kg_pts, kg_tree = tree_of(kinder)
    sc_items = [s for s in schools if s["lat"]]
    sc_pts, sc_tree = tree_of([{"lon": s["lon"], "lat": s["lat"]} for s in sc_items])

    def nearest_d(tree, pts, p):
        i = tree.nearest(p)
        return p.distance(pts[i]), i

    def count_within(tree, p, r):
        return len(tree.query(p.buffer(r)))

    # ---------- Per DeSO ----------
    police_tree = STRtree([pa["geom"] for pa in police])
    deso_out = []
    for f in deso_fc:
        pr = f["properties"]
        code, rcode, kk = pr["desokod"], pr["regsokod"], pr["kommunkod"]
        g = shape(f["geometry"])
        gs = transform(to_sweref, g)
        area = gs.area
        rep = gs.representative_point()
        # Använd ett bebyggelsenära ankare: för stora glesbygdsområden ger polygonens centrum missvisande avstånd,
        # så ta den punkt som ligger närmast en matbutik/station inom området om sådan finns.
        anchor = rep
        stats = dict(scb["deso"].get(code, {}))
        rstats = scb["regso"].get(rcode, {})
        # Polisens områden: andel av DeSO som överlappar
        pol = None
        near = None
        for i in police_tree.query(gs.buffer(400)):
            pa = police[i]
            inter = gs.intersection(pa["geom"]).area / area if area else 0
            if inter > 0.2:
                if pol is None or pa["cat"] == "sarskilt":
                    pol = {"name": pa["name"], "cat": pa["cat"], "share": round(inter, 2)}
            elif gs.distance(pa["geom"]) < 400:
                near = pa["name"]
        # Kollektivtrafik
        cands = hub_tree.query(anchor.buffer(6000))
        acc = sorted(((access_minutes(anchor.distance(hub_pts[i])), int(i)) for i in cands))[:6]
        if not acc:
            i = hub_tree.nearest(anchor)
            acc = [(access_minutes(anchor.distance(hub_pts[i])), int(i))]
        nearest_hub = min(acc)[1]
        d_hub = anchor.distance(hub_pts[nearest_hub])
        metro_hubs = [i for _, i in acc if any(l in ("10", "11", "13", "14", "17", "18", "19") for l in hubs[i]["lines"])]
        d_metro = min((anchor.distance(hub_pts[i]) for i in metro_hubs), default=None)
        if d_metro is None:
            mh = [i for i in hub_tree.query(anchor.buffer(25000)) if any(l in ("10", "11", "13", "14", "17", "18", "19") for l in hubs[i]["lines"])]
            d_metro = min((anchor.distance(hub_pts[i]) for i in mh), default=None)
        to_city = min((a + from_tc.get(i, 1e9) for a, i in acc), default=None)
        to_upp = min((a + from_up.get(i, 1e9) for a, i in acc), default=None)
        # Service
        dg, _ = nearest_d(gs_tree, gs_pts, anchor)
        dga, _ = nearest_d(ga_tree, ga_pts, anchor)
        dp, _ = nearest_d(pk_tree, pk_pts, anchor)
        db, _ = nearest_d(bt_tree, bt_pts, anchor)
        dk, _ = nearest_d(kg_tree, kg_pts, anchor)
        # Skolor: närmaste skolor med meritvärde inom 2,5 km
        near_sc = sorted(((anchor.distance(sc_pts[i]), int(i)) for i in sc_tree.query(anchor.buffer(2500))))
        merits = [(d, sc_items[i]["merit"]) for d, i in near_sc if sc_items[i]["merit"]]
        merit_avg = round(sum(m for _, m in merits[:4]) / len(merits[:4]), 1) if merits else None
        # Pris
        ms_key = REGSO_TO_MS.get(regso_name.get(rcode)) if kk == "0180" else None
        stats.update({
            "socioIndex": rstats.get("socioIndex"), "areaType": rstats.get("areaType"),
            "welfareUnempPct": rstats.get("welfareUnempPct"),
        })
        lon, lat = to_wgs(anchor.x, anchor.y)
        deso_out.append({
            "type": "Feature",
            "properties": {
                "id": code, "regso": rcode, "regsoName": regso_name.get(rcode), "kommun": kk, "kommunName": KOMMUN[kk][0],
                "areaKm2": round(area / 1e6, 2), "density": round(stats.get("pop", 0) / (area / 1e6)) if area else 0,
                **{k: v for k, v in stats.items() if v is not None},
                "police": pol["cat"] if pol else None, "policeName": pol["name"] if pol else None,
                "policeShare": pol["share"] if pol else None, "policeNear": near,
                "hubName": hubs[nearest_hub]["name"], "hubDist": round(d_hub), "hubLines": hubs[nearest_hub]["lines"],
                "metroDist": round(d_metro) if d_metro is not None else None,
                "toCity": round(to_city) if to_city and to_city < 1e8 else None,
                "toUppsala": round(to_upp) if to_upp and to_upp < 1e8 else None,
                "groceryDist": round(dg), "groceryAnyDist": round(dga),
                "groceries1km": count_within(ga_tree, anchor, 1000),
                "parkDist": round(dp), "bathDist": round(db), "preschoolDist": round(dk),
                "schoolMerit": merit_avg, "schools2km": len(near_sc),
                "priceArea": ms_key or KOMMUN[kk][1],
                "anchor": [round(lon, 5), round(lat, 5)],
                "access": [[i, round(a, 1)] for a, i in acc],
            },
            "geometry": rnd(g.simplify(0.00008, preserve_topology=True)),
        })

    # Klassning (alla trösklar bygger på officiella källor: Polisen + SCB:s områdestyp)
    for f in deso_out:
        p = f["properties"]
        at = p.get("areaType")
        if p["police"] == "sarskilt":
            cls = "sarskilt"
        elif p["police"] == "utsatt":
            cls = "utsatt"
        elif at in (1, 2) or p["policeNear"]:
            cls = "granslage"
        elif at == 3:
            cls = "blandat"
        elif at == 4:
            cls = "bra"
        elif at == 5:
            cls = "bast"
        else:
            cls = "okand"
        p["safetyClass"] = cls

    fc = {"type": "FeatureCollection", "features": deso_out}
    (OUT / "deso.geojson").write_text(json.dumps(fc, ensure_ascii=False, separators=(",", ":")), encoding="utf8")

    # ---------- RegSO (namnområden) + kommuner: sammanställda värden ----------
    def agg(features, keyfn):
        groups = defaultdict(list)
        for f in features:
            groups[keyfn(f["properties"])].append(f["properties"])
        res = {}
        for k, ps in groups.items():
            pop = sum(p.get("pop", 0) for p in ps) or 1
            def w(field):
                vals = [(p.get(field), p.get("pop", 0)) for p in ps if p.get(field) is not None]
                tw = sum(x[1] for x in vals)
                return round(sum(v * wt for v, wt in vals) / tw, 1) if tw else None
            res[k] = {
                "pop": pop,
                **{fld: w(fld) for fld in ("netIncome", "lowEconPct", "highEconPct", "eduHighPct", "eduPostSecPct", "employedPct",
                                           "unemployedPct", "condoPct", "ownedPct", "rentalPct", "toCity", "toUppsala", "metroDist",
                                           "groceryDist", "parkDist", "bathDist", "schoolMerit")},
                "safety": {c: sum(p.get("pop", 0) for p in ps if p["safetyClass"] == c) for c in
                           ("sarskilt", "utsatt", "granslage", "blandat", "bra", "bast", "okand")},
            }
        return res

    reg_agg = agg(deso_out, lambda p: p["regso"])
    reg_out = []
    for f in regso_fc:
        pr = f["properties"]
        rc = pr["regsokod"]
        g = shape(f["geometry"])
        st = scb["regso"].get(rc, {})
        a = reg_agg.get(rc, {})
        kk = pr["kommunkod"]
        reg_out.append({"type": "Feature", "properties": {
            "id": rc, "name": pr["regsonamn"], "kommun": kk, "kommunName": KOMMUN[kk][0],
            "areaType": st.get("areaType"), "socioIndex": st.get("socioIndex"),
            "priceArea": (REGSO_TO_MS.get(pr["regsonamn"]) if kk == "0180" else None) or KOMMUN[kk][1],
            **{k: v for k, v in a.items() if k != "pop"}, "pop": st.get("pop"),
        }, "geometry": rnd(g.simplify(0.00012, preserve_topology=True))})
    (OUT / "regso.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": reg_out}, ensure_ascii=False,
                                                  separators=(",", ":")), encoding="utf8")

    kom_agg = agg(deso_out, lambda p: p["kommun"])
    kom_out = []
    for kk, (name, slug) in KOMMUN.items():
        geoms = [shape(f["geometry"]) for f in regso_fc if f["properties"]["kommunkod"] == kk]
        g = unary_union(geoms).simplify(0.0003, preserve_topology=True)
        kom_out.append({"type": "Feature", "properties": {"id": kk, "name": name, "priceArea": slug, **kom_agg.get(kk, {})},
                        "geometry": rnd(g, 5)})
    (OUT / "kommuner.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": kom_out}, ensure_ascii=False,
                                                     separators=(",", ":")), encoding="utf8")

    # ---------- Priser ----------
    prices = {}
    for key, p in prices_raw.items():
        slug = key.split("/")[-1]
        if key == "riket/stockholms-lan":
            slug = "stockholms-lan"
        prices[slug] = {**price_summary(p), "name": STHLM_MS_NAME.get(slug) or next((n for n, s in KOMMUN.values() if s == slug), "Stockholms län")}
    (OUT / "prices.json").write_text(json.dumps(prices, ensure_ascii=False), encoding="utf8")

    # ---------- POI-filer ----------
    (OUT / "poi.json").write_text(json.dumps({
        "groceries": [[g["lon"], g["lat"], g["name"], 1 if g["kind"] == "supermarket" else 0] for g in gro],
        "parks": [[p["lon"], p["lat"], p["name"], p["kind"]] for p in nat_parks],
        "baths": [[b["lon"], b["lat"], b["name"]] for b in nat_bath],
        "preschools": [[k["lon"], k["lat"], k["name"]] for k in kinder],
        "schools": [{k: s[k] for k in ("code", "name", "lon", "lat", "org", "years", "merit", "meritPeriod", "passed9", "passed6",
                                         "certifiedTeachers", "pupils")} for s in sc_items],
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf8")
    (OUT / "transit.json").write_text(json.dumps(transit, ensure_ascii=False, separators=(",", ":")), encoding="utf8")

    meta = {
        "built": __import__("datetime").date.today().isoformat(),
        "sources": {
            "scb": "SCB Statistikdatabasen (PxWebApi v2): folkmängd 2025, nettoinkomst 2024, ekonomisk standard 2024, utbildning 2025, sysselsättning 2024, upplåtelseform 2025, socioekonomiskt index/områdestyp 2024",
            "police": "Polismyndigheten, Lägesbild över utsatta områden 2025 (områdesgränser 2025-12-01)",
            "prices": f"Svensk Mäklarstatistik, uppdaterad {prices_raw['stockholm']['updated']}",
            "osm": "OpenStreetMap-bidragsgivare (ODbL): spårtrafik, matbutiker, parker, badplatser, förskolor",
            "schools": "Skolverket, Planerade utbildningar API v3 (meritvärde åk 9)",
            "boundaries": "SCB DeSO 2025 och RegSO 2025",
        },
    }
    (OUT / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf8")
    for p in sorted(OUT.iterdir()):
        print(f"{p.name:20s} {p.stat().st_size/1e6:6.2f} MB")
    from collections import Counter
    print(Counter(f["properties"]["safetyClass"] for f in deso_out))
    missing = [r for r in regso_name.values() if r not in REGSO_TO_MS] if False else None


if __name__ == "__main__":
    main()
