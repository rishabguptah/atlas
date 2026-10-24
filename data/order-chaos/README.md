# Order and Chaos lab (workstream 8)

Which states looked fragile before they broke, and how often would we have been right?

## Records

| File | What | Status |
| --- | --- | --- |
| `polities.jsonl` | 682 polity stubs (peak area ≥ 50,000 km², lifespan ≥ 50 years). states-war owns polity records; these merge into theirs. | sourced |
| `area.jsonl` | `m:area:<polity>:cliopatria`, territory in million km² at every Cliopatria change point | sourced |
| `fragility.jsonl` | `m:fragility:<polity>:atlas_lab`, out-of-sample probability of breaking within 50 years, every 10 years. New metric `fragility`, unit `probability_break_within_50y`. | sourced (model output; see `note`) |
| `endings.jsonl` | `event:end_<polity>` for every polity that ended: subtype `collapse` (tags `withered` or `snapped`) or `succession` (a handoff) | sourced |
| `secular-cycles.jsonl` | 8 secular cycles with phases, from Turchin & Nefedov (2009). New event subtype `secular_cycle` with a `phases` field. | draft |
| `shocks.jsonl` | 10 plagues, eruptions and cold spells | draft |
| `backtest.json` | Scorecards (cross-fit, age-and-era baseline, pre-1500 → post-1500), calibration, per-break warnings | derived |
| `lab.json` | Compact bundle the lab page reads | derived |

## Method

- A **break** is a polity ending without a handoff. A **handoff** is a new polity starting within 2 years,
  within 800 km (centroid to centroid), with 60–170% of the old territory. Cliopatria cannot tell a
  revolution from a renaming, so Russia 1917 and Qing 1912 count as handoffs.
- **Withered** = ended holding under half its peak territory. **Snapped** = ended with half or more.
- Features at each sampled year: log area, share of peak so far, log change over 25 and 100 years, log age, era.
  Logistic regression (L2). Polities are split in two by name hash; each half is scored by the model fit on the
  other half, so every published score is out of sample.

## Results (edition 1)

- Flagged state-decades (top 20% of scores) broke within 50 years 24% of the time, vs a 14% base rate (1.7× lift). AUC 0.63 vs 0.60 for age and era alone.
- 42% of breaks were flagged 5–40 years ahead: 76% of withered states, 18% of snapped ones.
- Trained before 1500 and tested after: AUC 0.57. Borders say less about the modern world.

## Sources and licences

- Seshat Global History Databank, **Cliopatria** v0.2.1 (Bennett et al. 2025, *Scientific Data* 12:247), CC BY 4.0.
  https://github.com/Seshat-Global-History-Databank/cliopatria. Download `cliopatria.geojson.zip`, unzip into `raw/order-chaos/`.
- Turchin & Nefedov, *Secular Cycles* (Princeton UP, 2009): cycle phases, entered by hand, draft.
- Wikipedia pages for shocks, entered by hand, draft.
- Not yet reachable from the build container: Seshat Equinox/CrisisDB (seshat-db.com) and Maddison (rug.nl). Those would add
  Turchin's structural-demographic variables (population pressure, elite overproduction, state finances).

## Rebuild

```
python3 ingest/order-chaos/fragility.py
python3 ingest/order-chaos/curated.py
python3 ingest/order-chaos/build_page.py <land-50m topojson> dist/order-chaos/lab.html
python3 tools/build.py
```
