"""Hämtar grundskolor i Stockholms län med meritvärde och nyckeltal från Skolverkets öppna API
(planned-educations v3). Utdata: raw/schools.json
"""
import json
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

RAW = Path(__file__).parent / "raw"
BASE = "https://api.skolverket.se/planned-educations/v3"
H = {"Accept": "application/vnd.skolverket.plannededucations.api.v3.hal+json", "User-Agent": "stockholm-bostad/0.1"}
KOMMUNER = ["0114", "0115", "0117", "0120", "0123", "0125", "0126", "0127", "0128", "0136", "0138", "0139", "0140",
            "0160", "0162", "0163", "0180", "0181", "0182", "0183", "0184", "0186", "0187", "0188", "0191", "0192"]


def get(url):
    for attempt in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=H), timeout=60) as r:
                return json.load(r)["body"]
        except Exception as e:
            time.sleep(2 + attempt * 2)
            err = e
    print("FEL", url, err)
    return None


def latest(series):
    """Senaste värde som faktiskt finns, som (float, period)."""
    for p in series or []:
        if p.get("valueType") == "EXISTS" and p.get("value"):
            v = p["value"].replace(",", ".").replace("cirka ", "")
            try:
                return float(v), p["timePeriod"]
            except ValueError:
                continue
    return None, None


def detail(su):
    code = su["code"]
    d = get(f"{BASE}/school-units/{code}") or {}
    s = get(f"{BASE}/school-units/{code}/statistics/gr") or {}
    info = d.get("schoolUnit", d)
    lat = lon = None
    for key in ("wgs84_Lat", "wgs84Latitude"):
        if info.get(key):
            lat = float(info[key])
    for key in ("wgs84_Long", "wgs84Longitude"):
        if info.get(key):
            lon = float(info[key])
    if lat is None:
        addr = (info.get("contactInfo") or {}).get("addresses") or info.get("addresses") or []
        for a in addr:
            g = a.get("geoCoordinates") or {}
            if g.get("latitude"):
                lat, lon = float(g["latitude"]), float(g["longitude"])
                break
    merit, meritPeriod = latest(s.get("averageGradesMeritRating9thGrade"))
    passed9, _ = latest(s.get("ratioOfPupilsIn9thGradeWithAllSubjectsPassed"))
    passed6, _ = latest(s.get("ratioOfPupilsIn6thGradeWithAllSubjectsPassed"))
    cert, _ = latest(s.get("certifiedTeachersQuota"))
    pupils, _ = latest(s.get("totalNumberOfPupils"))
    years = sorted({y for t in su.get("typeOfSchooling", []) if t["code"] == "gr" for y in t.get("schoolYears", [])}, key=int)
    return {
        "code": code, "name": su["name"], "kommun": su.get("geographicalAreaCode"), "org": su.get("principalOrganizerType"),
        "lat": lat, "lon": lon, "years": f"{years[0]}-{years[-1]}" if years else None,
        "merit": merit, "meritPeriod": meritPeriod, "passed9": passed9, "passed6": passed6,
        "certifiedTeachers": cert, "pupils": pupils,
    }


def main():
    units = []
    for k in KOMMUNER:
        page = 0
        while True:
            b = get(f"{BASE}/school-units?geographicalAreaCode={k}&typeOfSchooling=gr&size=100&page={page}")
            if not b:
                break
            units += b.get("_embedded", {}).get("listedSchoolUnits", [])
            if page + 1 >= b["page"]["totalPages"]:
                break
            page += 1
    print("skolenheter", len(units))
    with ThreadPoolExecutor(8) as ex:
        out = list(ex.map(detail, units))
    out = [o for o in out if o["lat"]]
    print("med koordinater", len(out), "med meritvärde", sum(1 for o in out if o["merit"]))
    (RAW / "schools.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf8")


if __name__ == "__main__":
    main()
