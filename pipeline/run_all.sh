#!/usr/bin/env bash
# Hämtar all rådata på nytt och bygger web/public/data. Tar ca 5–10 minuter.
set -euo pipefail
cd "$(dirname "$0")"
PY=${PY:-python}
mkdir -p raw/uso
# Områdesgränser (SCB DeSO/RegSO 2025, Stockholms län)
for L in RegSO_2025 DeSO_2025; do
  curl -sf "https://geodata.scb.se/geoserver/stat/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=stat:$L&outputFormat=application/json&srsName=EPSG:4326&CQL_FILTER=lanskod='01'" -o raw/$L.json
done
# Polisens utsatta områden (länken finns på polisen.se/om-polisen/polisens-arbete/utsatta-omraden/)
curl -sfL -A "Mozilla/5.0" "https://polisen.se/33a4eb398c9ca7879ac47049931a252f/contentassets/1f86e17354294629b5b66559eef35972/uso_2025_geojson.zip" -o raw/uso/uso.zip
(cd raw/uso && unzip -o -q uso.zip)
# Prisområden från Svensk Mäklarstatistik
curl -sf -A "Mozilla/5.0" https://www.maklarstatistik.se/lkf-sitemap.xml | grep -o '<loc>[^<]*' | sed 's/<loc>//' | grep 'stockholms-lan' > raw/ms_urls.txt
$PY fetch_scb.py
$PY fetch_prices.py
$PY fetch_schools.py
$PY fetch_osm.py
$PY build_data.py
