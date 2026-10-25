# World (travellers, meetings, news)

Owner: the living-world simulation (`views/atlas/lenses/world.*`). Not kernel records (`.json`, not `.jsonl`), so
`tools/build.py` does not validate them; `ingest/world/check.py` does.

| File | What |
| --- | --- |
| `journeys/<id>.json` | One documented journey or travelling life: dated stops with coordinates, how each leg was travelled, confidence, sources. |
| `meetings.json` | Documented meetings between two named people: date, place, what happened, confidence (`documented`, `disputed`, `legend`). |
| `news.json` | How fast news travelled: an event, and the dates its news reached other places, each with a source. Used to backtest the travel network. |
| `speeds.json` | Documented journey times between two places in a given period, to backtest the travel network. |

## Journey format

```json
{"id": "faxian", "name": "Faxian", "person": "person:faxian", "kind": "pilgrim",
 "summary": "One sentence.", "start": 399, "end": 412,
 "stops": [{"place": "Chang'an", "lon": 108.94, "lat": 34.26, "date": "399", "until": "399", "mode": "start",
            "note": "Sets out with four monks to find complete Vinaya texts.", "conf": "documented"}],
 "sources": [{"cite": "...", "url": "..."}], "status": "draft"}
```

`date` and `until` are ISO-like (`1325`, `1325-06`, `1325-06-14`, negative years for BCE: `-334-05`); `mode` is how the
traveller reached this stop (`start`, `land`, `sea`, `river`, `rail`, `air`); `conf` is `documented` (the source gives
the stop and date), `likely` (the source gives the stop, the date is inferred) or `guess`.
