# Deep time (300,000 years ago to the first cities)

Two scripts feed the Atlas's Deep time lens (`views/atlas/lenses/deeptime.*`) and the ice-age pixel map (`views/pixel/paleo.js`).

| Script | Writes | From |
| --- | --- | --- |
| `curated.py` | `data/deep-time/{sites,groups,fauna,dispersals,hearths,landscape,events}.jsonl` | the papers cited on every record (DOIs), all `status: draft` with a `conf` class |
| `paleo.py RAW OUT` | `paleo-sea.png`, `paleo-ice.png`, `sealevel.json` (copy them into `data/deep-time/`) | NOAA ETOPO2v2c, Batchelor et al. 2019 ice-sheet shapefiles (OSF `7jen3`), Spratt & Lisiecki 2016 sea-level stack, Lambeck et al. 2014 |

Raw inputs: `/mnt/project-files/atlas/raw/deep-time/` (Batchelor shapefiles, `spratt2016.txt`). ETOPO2 is 233 MB, so fetch it:

```sh
curl -sSO https://www.ngdc.noaa.gov/mgg/global/relief/ETOPO2/ETOPO2v2-2006/ETOPO2v2c/netCDF/ETOPO2v2c_f4_netCDF.zip && unzip ETOPO2v2c_f4_netCDF.zip
# RAW = a folder with ETOPO2v2c_f4.nc, spratt2016.txt and batchelor/<slice>/
python3 ingest/deep-time/paleo.py RAW /tmp/paleo && cp /tmp/paleo/* data/deep-time/
python3 ingest/deep-time/curated.py
```

## How the ice-age map is drawn

- **Coasts.** `paleo-sea.png` holds sea depth in metres (6 arc-minute cells). For a year, the sea level comes from
  Lambeck et al. 2014 (last 29,000 years) or the Spratt & Lisiecki stack (before); a sea cell shallower than the drop is
  dry land, drawn as tundra near the ice, mammoth steppe in the mid-latitudes, grass and forest in the tropics.
  Isostasy (land pushed down by the ice) is ignored, so coasts near the old ice sheets are rough.
- **Ice.** Batchelor et al. 2019 best estimates for 12 dated time slices (MIS 8 at about 260 ka to the LGM). The map
  shows the slice nearest in time while the sea is below -40 m, and no extra ice in warm spells. After 19,000 years
  ago each LGM ice sheet shrinks toward its centre on its own timetable (`RETREAT` in `paleo.py`, read coarsely from
  Dyke 2004, Hughes et al. 2016 and Clark et al. 2012). The Patagonian ice is a coarse hand trace after PATICE.
- **Climate.** Glacial years push the tundra line and the steppe south and break up rainforest; Green Sahara periods
  (Larrasoaña et al. 2013; the African Humid Period after deMenocal et al. 2000) turn the desert to grass and fill
  Lake Mega-Chad below about 330 m.

All of it is approximate: good for seeing Beringia, Doggerland, Sundaland and the ice, not for placing a shoreline.
