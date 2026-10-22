# Boplats Stockholm

Beslutsstöd för bostadsköp i Stockholms län. En 3D-karta (MapLibre GL + three.js) där varje område, ner till SCB:s
DeSO-nivå och enskilda gator, bedöms utifrån trygghet, pris, restid och service. Allt bygger på officiella källor.

## Vad sajten gör

- **Trygghet:** Polisens utsatta och särskilt utsatta områden (exakta gränser, lägesbild 2025) kombinerat med SCB:s
  socioekonomiska områdestyp (1–5) per område.
- **Priser:** Svensk Mäklarstatistik (kr/m², snittpris och 48 månaders historik) per kommun och för Stockholms 13
  prisområden, plus länkar till Booli och Hemnet för varje gata och område.
- **Restider:** Eget spårnät (tunnelbana, pendeltåg, lokalbanor, Mälartåg) till T-Centralen, Uppsala C och era egna
  arbetsplatser. Restiderna räknas i webbläsaren.
- **Service:** Matbutiker, förskolor, parker och badplatser (OpenStreetMap) samt grundskolor med meritvärde
  (Skolverket).
- **Matchning:** Egna vikter per faktor, budget och boyta, topplista och jämförelse av sparade områden.

## Struktur

```
pipeline/   Python-skript som hämtar och bearbetar rådata -> web/public/data
web/        Vite + React + TypeScript-appen
```

## Köra lokalt

```bash
cd web && npm install && npm run dev
```

## Uppdatera data

Svensk Mäklarstatistik uppdateras månadsvis och SCB/Polisen årligen.

```bash
cd pipeline && python -m venv .venv && .venv/Scripts/pip install -r requirements.txt
PY=.venv/Scripts/python ./run_all.sh
```

## Publicering

`.github/workflows/deploy.yml` bygger och publicerar `web/` till GitHub Pages vid varje push till `main`.
Aktivera Pages under *Settings → Pages → Source: GitHub Actions*.

## Källor

SCB (Statistikdatabasen, DeSO/RegSO 2025), Polismyndigheten (utsatta områden 2025), Svensk Mäklarstatistik,
Skolverket (Planerade utbildningar API), OpenStreetMap-bidragsgivare (ODbL), OpenFreeMap (baskarta), Nominatim
(adressökning).
