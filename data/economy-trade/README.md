# economy-trade

Workstream 4: economy, trade and migration. Records follow `schema/SCHEMA.md`.

| File | What | Status |
| --- | --- | --- |
| `maddison.jsonl` | GDP, GDP per capita and population for 171 territories, 6 regions and the world, years 1 to 2018. One stub `place:country_*` / `place:region_*` per territory and one measure per (territory, metric). | `sourced` |
| `owid.jsonl` | About 2,000 more series from Our World in Data's mirror: HYDE 3.2 population by continent since 10,000 BCE, HYDE 3.1 and Bairoch urbanisation, Gapminder (1800 on) and Clio-Infra (1500 on) population by country, TRADHIST trade share of GDP by country since 1827, world trade (TRADHIST, Penn World Table), intercontinental trade 1500-1800 (Costa, Palma and Reis), Mitchell's European trade, 12 metals mined by country (Clio-Infra and USGS), 24 real commodity prices since 1850 (Jacks), the gold price (MeasuringWorth), the English skill premium (Clark), and London vs Delhi income. | `sourced` |
| `routes.jsonl` | Two trade-hub relays (Dilmun to New York, Lothal to Shanghai), 28 trade routes, 45 migrations. | `draft` |
| `relations.jsonl` | `succeeded` links between relay hubs and `migrated_to` links for each migration. | `draft` |
| `groups.jsonl` | The peoples that migrate (Bantu speakers, Norse, enslaved Africans...). | `draft` |
| `places.jsonl` | Stub places for hubs, route stops and migration regions. Ids match the Living Atlas where they exist. | `draft` |
| `geo/routes.geojson` | One LineString per route, straight lines between stops. `properties.ref` is the route id. | `draft` |

Rebuild with `python3 ingest/economy-trade/maddison.py`, `python3 ingest/economy-trade/owid.py` and `python3 ingest/economy-trade/curated.py`.
The page: `python3 views/economy-trade/build_page.py OUT.html`.

## Sources and licences

- **Maddison Project Database 2020** (Bolt and van Zanden 2020), CC BY 4.0. Downloaded from Our World in Data's
  GitHub mirror (`owid/owid-datasets`) because rug.nl and dataverse.nl are blocked from the build container.
  Values are for territory inside today's borders, so "India" is modern India (not British India) and "United Kingdom" is today's UK. GDP is in 2011 international dollars. Coverage before 1820 is patchy, and several early
  points (India in year 1 and 1000, for example) are population only.
- **HYDE**: continent totals (3.2) and regional urban shares (3.1) come via OWID. Country-level HYDE 3.3 needs the
  blocked host geo.public.data.uu.nl; the open-network fetch thread has been asked for it.
- **OWID mirror datasets** carry their original licences (mostly CC BY; Penn World Table and Clio-Infra are free for
  research use with citation). OWID's note says all metals are in thousand tonnes, but silver and gold are clearly in
  tonnes and iron ore in million tonnes, so those units are corrected.
- Country ids are spelled the Maddison way across sources (`ALIASES` in `owid.py`); aggregates like income groups become
  `place:region_<source>_*`.
- **Curated records** are model-written from the works cited on each record (Braudel, Arrighi, Abu-Lughod, Beaujard,
  Casson, McKeown, SlaveVoyages and others). They are `draft` until the judge checks them. The relay order is a
  judgement call and is labelled with a `view`.

## Fields added beyond the schema

- `route.legs`: for the relays, `[{place, start, end, approx, why, lost, cause, sources}]`, one per hub in turn.
  `cause` uses the schema's cause list.
- `route.group`: the `group:` id that made a migration.
- `route.people`: `[low, high]` number of people who moved.
- `route.forced`: `true` for forced migrations (also tagged `forced`).
