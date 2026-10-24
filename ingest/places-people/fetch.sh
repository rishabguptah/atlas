#!/usr/bin/env bash
# Download the raw datasets for the places-people workstream into raw/places-people/ (git-ignored).
set -euo pipefail
cd "$(dirname "$0")/../.."
RAW=raw/places-people
mkdir -p "$RAW"

# Pantheon 2025 update: ~126k biographies with birth/death places (pantheon.world, CC BY 4.0).
if [ ! -f "$RAW/pantheon_person_2025.csv" ]; then
  curl -sSL -o "$RAW/pantheon_person_2025.csv.bz2" \
    https://storage.googleapis.com/pantheon-public-data/person_2025_update.csv.bz2
  bunzip2 -f "$RAW/pantheon_person_2025.csv.bz2"
fi

# GeoNames cities with population >= 1000, as packaged by the all-the-cities npm module (data CC BY 4.0).
if [ ! -f "$RAW/geonames_cities.json" ]; then
  (cd "$RAW" && npm init -y >/dev/null && npm install --ignore-scripts --no-audit --no-fund all-the-cities@3.1.0 >/dev/null)
  node -e "
    const c = require('./$RAW/node_modules/all-the-cities');
    const out = c.map(x => [x.cityId, x.name, x.country, x.featureCode, x.population, x.loc.coordinates[1], x.loc.coordinates[0]]);
    require('fs').writeFileSync('$RAW/geonames_cities.json', JSON.stringify(out));
    console.log('geonames cities:', out.length);
  "
fi
