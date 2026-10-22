"""Hämtar statistik från SCB (PxWebApi v2) för alla DeSO/RegSO 2025 i Stockholms län.

Utdata: raw/scb_stats.json  { "deso": {kod: {...}}, "regso": {kod: {...}} }
"""
import json
import time
import urllib.request
from pathlib import Path

RAW = Path(__file__).parent / "raw"
API = "https://statistikdatabasen.scb.se/api/v2/tables/{}/data?lang=sv&outputFormat=json-stat2"


def post(table, selection):
    body = json.dumps({"selection": selection}).encode()
    for attempt in range(5):
        try:
            req = urllib.request.Request(API.format(table), data=body, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)
        except Exception as e:  # SCB begränsar till ~30 anrop / 10 s
            print("  retry", table, e)
            time.sleep(3 + attempt * 3)
    raise RuntimeError(table)


def rows(js):
    """Plattar ut json-stat2 till en lista dicts {dim: kod, ..., value}."""
    dims = js["id"]
    sizes = js["size"]
    cats = [list(js["dimension"][d]["category"]["index"].keys()) for d in dims]
    out = []
    for flat, v in enumerate(js["value"]):
        idx, rest = [], flat
        for s in reversed(sizes):
            idx.append(rest % s)
            rest //= s
        idx.reverse()
        rec = {d: cats[i][idx[i]] for i, d in enumerate(dims)}
        rec["value"] = v
        out.append(rec)
    return out


def chunks(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i : i + n]


def fetch(table, regions, other, key):
    res = {}
    for part in chunks(regions, 400):
        sel = [{"variableCode": "Region", "valueCodes": part}] + [
            {"variableCode": k, "valueCodes": v} for k, v in other.items()
        ]
        for r in rows(post(table, sel)):
            code = r["Region"].split("_")[0]
            res.setdefault(code, {})[key(r)] = r["value"]
        time.sleep(0.5)
    return res


def main():
    deso = [f["properties"]["desokod"] for f in json.load(open(RAW / "DeSO_2025.json", encoding="utf8"))["features"]]
    regso = [f["properties"]["regsokod"] for f in json.load(open(RAW / "RegSO_2025.json", encoding="utf8"))["features"]]
    both = [c + "_DeSO2025" for c in deso] + [c + "_RegSO2025" for c in regso]
    out = {"deso": {c: {} for c in deso}, "regso": {c: {} for c in regso}}

    def merge(res, fn):
        for code, vals in res.items():
            lvl = "deso" if code in out["deso"] else "regso" if code in out["regso"] else None
            if lvl:
                fn(out[lvl][code], vals)

    # Folkmängd 2025
    res = fetch("TAB6574", both, {"Alder": ["totalt"], "Kon": ["1+2"], "ContentsCode": ["000007Y7"], "Tid": ["2025"]}, lambda r: "pop")
    merge(res, lambda o, v: o.update(v))

    # Medelnettoinkomst (tkr, 20+), 2024
    res = fetch("TAB6683", both, {"Inkomstkomponenter": ["240"], "Kon": ["1+2"], "ContentsCode": ["000008A4"], "Tid": ["2024"]}, lambda r: "netIncome")
    merge(res, lambda o, v: o.update(v))

    # Låg/hög ekonomisk standard 2024
    res = fetch("TAB6685", both, {"Alder": ["tot"], "ContentsCode": ["000008AC", "000008AD"], "Tid": ["2024"]},
                lambda r: {"000008AC": "lowEconPct", "000008AD": "highEconPct"}[r["ContentsCode"]])
    merge(res, lambda o, v: o.update(v))

    # Utbildning 25–65 år 2025 -> andel eftergymnasial 3+ år
    res = fetch("TAB6534", both, {"UtbildningsNiva": ["21", "3+4", "5", "6", "US"], "ContentsCode": ["000007Z6"], "Tid": ["2025"]},
                lambda r: r["UtbildningsNiva"])

    def edu(o, v):
        tot = sum(x or 0 for x in v.values())
        if tot:
            o["eduHighPct"] = round(100 * (v.get("6") or 0) / tot, 1)
            o["eduPostSecPct"] = round(100 * ((v.get("6") or 0) + (v.get("5") or 0)) / tot, 1)
            o["eduLowPct"] = round(100 * (v.get("21") or 0) / tot, 1)
    merge(res, edu)

    # Sysselsättning 20–64 år 2024
    res = fetch("TAB6680", both, {"Kon": ["1+2"], "Alder": ["20-64"], "ContentsCode": ["0000089X", "0000089W", "0000089V", "0000089Z"], "Tid": ["2024"]},
                lambda r: r["ContentsCode"])

    def emp(o, v):
        tot = (v.get("0000089V") or 0) + (v.get("0000089Z") or 0)
        if tot:
            o["employedPct"] = round(100 * (v.get("0000089X") or 0) / tot, 1)
        if v.get("0000089V"):
            o["unemployedPct"] = round(100 * (v.get("0000089W") or 0) / v["0000089V"], 1)
    merge(res, emp)

    # Upplåtelseform 2025
    res = fetch("TAB6253", both, {"Upplatelseform": ["ÄG/ANDEL", "BOSTADSRÄTT", "HYRESRÄTT", "TOTALT"], "ContentsCode": ["000007DQ"], "Tid": ["2025"]},
                lambda r: r["Upplatelseform"])

    def tenure(o, v):
        tot = v.get("TOTALT") or 0
        if tot:
            o["ownedPct"] = round(100 * (v.get("ÄG/ANDEL") or 0) / tot, 1)
            o["condoPct"] = round(100 * (v.get("BOSTADSRÄTT") or 0) / tot, 1)
            o["rentalPct"] = round(100 * (v.get("HYRESRÄTT") or 0) / tot, 1)
    merge(res, tenure)

    # Socioekonomiskt index + områdestyp (RegSO), 2024
    rs = [c + "_RegSO2025" for c in regso]
    res = fetch("TAB6586", rs, {"ContentsCode": ["000008IT", "000008IU", "000008IX"], "Tid": ["2024"]},
                lambda r: {"000008IT": "socioIndex", "000008IU": "areaType", "000008IX": "welfareUnempPct"}[r["ContentsCode"]])
    merge(res, lambda o, v: o.update(v))

    (RAW / "scb_stats.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf8")
    for lvl in out:
        n = sum(1 for v in out[lvl].values() if v.get("pop"))
        print(lvl, len(out[lvl]), "med folkmängd:", n, "exempel:", next(iter(out[lvl].items())))


if __name__ == "__main__":
    main()
