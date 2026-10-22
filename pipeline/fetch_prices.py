"""Hämtar slutprisstatistik från Svensk Mäklarstatistik (maklarstatistik.se) för alla
kommuner i Stockholms län och Stockholms stadsdelar.

Svensk Mäklarstatistik bygger på faktiska slutpriser rapporterade av mäklare och uppdateras
månadsvis. Utdata: raw/prices.json
"""
import html
import json
import re
import time
import urllib.request
from pathlib import Path

RAW = Path(__file__).parent / "raw"
UA = {"User-Agent": "Mozilla/5.0 (stockholm-bostad personal research)"}


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf8")


def num(s):
    s = s.replace("\xa0", " ").replace(" ", "").replace(",", ".").replace("%", "")
    try:
        return float(s)
    except ValueError:
        return None


def text_of(h):
    t = re.sub(r"<script.*?</script>|<style.*?</style>", " ", h, flags=re.S)
    t = re.sub(r"<[^>]+>", " ", t)
    return re.sub(r"\s+", " ", html.unescape(t))


def parse(h):
    t = text_of(h)
    out = {}
    m = re.search(r"Uppdaterat: (\d+ \w+ \d{4})", t)
    out["updated"] = m.group(1) if m else None
    # Sammanfattningsrutorna: "3 månader 91 997 kr/kvm 5 443 000 medelpris 5 835 antal sålda -0.2% prisutveckling"
    pat = re.compile(
        r"(3|12) månader ([\d ]+) kr/kvm ([\d ]+) medelpris ([\d ]+) antal sålda ([+\-−]?[\d.,]+)% prisutveckling"
    )
    i = t.find("Bostadsrätter Villor")
    if i < 0:  # stadsdelssidor saknar villaflik
        i = t.find("Uppdaterat:")
    boxes = pat.findall(t[i : i + 1500])
    keys = ["br3", "br12", "villa3", "villa12"]
    for k, b in zip(keys, boxes):
        out[k] = {
            "sqm": num(b[1]),
            "avgPrice": num(b[2]),
            "sold": num(b[3]),
            "change": num(b[4].replace("−", "-")),
        }
    # 48 månaders kr/kvm-historik + pris per rum
    for canvas in re.findall(r"<canvas[^>]*>", h):
        a = dict(re.findall(r'data-([a-z-]+)="([^"]*)"', canvas))
        chart = a.get("chart", "")
        if chart in ("br-48m-prisutveckling", "villa-48m-prisutveckling", "br-48m-pris-rum", "villa-48m-pris-tkr", "br-48m-pris-tkr"):
            try:
                labels = json.loads(html.unescape(a.get("labels", "[]")))
                series = [[num(v) if v not in (None, "") else None for v in s] for s in json.loads(html.unescape(a.get("series", "[]")))]
                out.setdefault("charts", {})[chart] = {"labels": labels, "series": series, "name": a.get("chart-name")}
            except Exception:
                pass
    # Pris per antal rum (tabell eller diagram), lagras rått om det finns
    rooms = re.findall(r'data-chart="(br-[^"]*rum[^"]*)"', h)
    out["roomCharts"] = sorted(set(rooms))
    return out


def main():
    urls = [u.strip() for u in open(RAW / "ms_urls.txt", encoding="utf8") if u.strip()]
    res = {}
    for u in urls:
        slug = u.rstrip("/").split("/")[-1]
        parent = u.rstrip("/").split("/")[-2]
        key = slug if parent == "stockholms-lan" else f"{parent}/{slug}"
        try:
            res[key] = {"url": u, **parse(get(u))}
            r = res[key]
            print(key, r.get("updated"), (r.get("br3") or {}).get("sqm"), (r.get("villa3") or {}).get("avgPrice"), list((r.get("charts") or {}).keys()))
        except Exception as e:
            print("FEL", key, e)
        time.sleep(1.0)
    (RAW / "prices.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf8")


if __name__ == "__main__":
    main()
