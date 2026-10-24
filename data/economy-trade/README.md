# economy-trade

Workstream 4: economy, trade and migration. Records follow `schema/SCHEMA.md`.

| File | What | Status |
| --- | --- | --- |
| `maddison.jsonl` | GDP, GDP per capita and population for 171 territories, 6 regions and the world, years 1 to 2018. One stub `place:country_*` / `place:region_*` per territory and one measure per (territory, metric). | `sourced` |
| `routes.jsonl` | Two trade-hub relays (Dilmun to New York, Lothal to Shanghai), 13 trade routes, 21 migrations. | `draft` |
| `relations.jsonl` | `succeeded` links between relay hubs and `migrated_to` links for each migration. | `draft` |
| `groups.jsonl` | The peoples that migrate (Bantu speakers, Norse, enslaved Africans...). | `draft` |
| `places.jsonl` | Stub places for hubs, route stops and migration regions. Ids match the Living Atlas where they exist. | `draft` |
| `geo/routes.geojson` | One LineString per route, straight lines between stops. `properties.ref` is the route id. | `draft` |

Rebuild with `python3 ingest/economy-trade/maddison.py` and `python3 ingest/economy-trade/curated.py`.

## Sources and licences

- **Maddison Project Database 2020** (Bolt and van Zanden 2020), CC BY 4.0. Downloaded from Our World in Data's
  GitHub mirror (`owid/owid-datasets`) because rug.nl and dataverse.nl are blocked from the build container.
  Values are for territory inside today's borders, so "India" is modern India (not British India) and "United Kingdom" is today's UK. GDP is in 2011 international dollars. Coverage before 1820 is patchy, and several early
  points (India in year 1 and 1000, for example) are population only.
- **HYDE 3.2** (gridded population back to 10,000 BCE) is not ingested yet: its host (geo.public.data.uu.nl) is
  blocked here. Next step if it is needed for pre-1500 population.
- **Curated records** are model-written from the works cited on each record (Braudel, Arrighi, Abu-Lughod, Beaujard,
  Casson, McKeown, SlaveVoyages and others). They are `draft` until the judge checks them. The relay order is a
  judgement call and is labelled with a `view`.

## Fields added beyond the schema

- `route.legs`: for the relays, `[{place, start, end, approx, why, lost, cause, sources}]`, one per hub in turn.
  `cause` uses the schema's cause list.
- `route.group`: the `group:` id that made a migration.
- `route.people`: `[low, high]` number of people who moved.
- `route.forced`: `true` for forced migrations (also tagged `forced`).
