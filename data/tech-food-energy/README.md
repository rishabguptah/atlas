# Technology, food and energy

How inventions, crops and energy sources spread, and how fast news travelled. Shown in the one-page
Atlas as the lens "Technology, food & energy" (Wealth family): `views/atlas/lenses/tech.py` and `tech.js`.

| File | What |
| --- | --- |
| `ideas.jsonl` | 19 technologies and 8 crops as `idea` records (subtype `technology`, `category` tech / war / comms / energy / food), plus `event:columbian_exchange`. |
| `relations.jsonl` | 222 `spread_to` steps (one place and year each, with a note; 13 railway steps come from HCCTA), cause links into other workstreams (potato and the Irish famine, printing and the Reformation, gunpowder and 1453, sugar and Haiti, coal-fired steam and warming, the Bronze Age collapse and iron) and `influenced` links between technologies. |
| `news.jsonl` | 11 news journeys (`event` subtype `news`: origin, destination, days, km), Calcutta-London letter times (Kaukiainen) and the speed of the fastest message relays, 500 BCE to 1805. |
| `energy.jsonl` | World primary energy by source, 1800-2025, TWh (Our World in Data: Smil before 1965, Energy Institute after). `sourced`. |
| `yields.jsonl` | Wheat yields, t/ha: England/UK from 1275 (Broadberry et al.), 14 European countries from 1850 or 1911, FAO from 1961. `sourced`. |
| `adoption.jsonl` | Comin and Hobijn's HCCTA for 23 countries: railway km, telegrams, telephones, private cars, steam and sail tonnage, electricity output. `sourced`. |
| `places.jsonl` | Stubs for every place a step or journey uses (owner records win on merge). |

Climate shocks, famines and eruptions live in `data/disease-climate/`; this workstream links to them and does not copy them.

## Build

```sh
sh ingest/tech-food-energy/fetch.sh          # OWID energy and wheat CSVs, HCCTA .xls into raw/ (ignored by git)
pip install xlrd                              # reads the .xls
python3 ingest/tech-food-energy/build.py      # curated.py + raw files -> data/tech-food-energy/*.jsonl
python3 tools/build.py
```

Edit `ingest/tech-food-energy/curated.py`, not the JSONL.

## How to read the steps

A step says "in use (or grown) here by this year": the first attestation historians cite, not an
invention date. `start_approx` marks rough years. Curated records are `draft` (written by a model from the
cited works; Wikipedia articles were checked for most dates on 2026-10-24) until the judge promotes them.
Railway steps from HCCTA are kept only when the series starts with under 150 km of track, so they mark a
real first line rather than where Mitchell's statistics begin. Car series start when statistics start, so
they are measures only.

## Schema notes for the kernel

- New event subtypes: `news` (with `origin` place id, `days`, `days_range`, `km`) and `exchange` (Columbian Exchange).
- `spread_to` relations carry `step` (order within the item) and, for HCCTA steps, `at` ([lat, lon] of the capital).
- Measures may carry `notes` ({year: text}) and `to` (for a route measure such as Calcutta-London).
- Ideas carry `category`. A `technology` kernel lens would fit better than the current `ideas` + `economy`; the
  Atlas page adds `technology` as a guide lens name.

## Gaps

- Kaukiainen's full route table (London to New York, Bombay, Sydney, Rio, 1820-1870) is paywalled; only the Calcutta figures are in.
- Pre-1800 energy (Warde's England and Wales series from 1560) and more crops (sorghum, millet, banana, cattle, camel).
- Comin and Mestieri's CHAT dataset (161 countries, 104 technologies) would replace HCCTA's 23 rich countries.
