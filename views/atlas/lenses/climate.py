# Eruptions, famine & cold: data for the one-page Atlas, read straight from data/disease-climate/.
# Smithsonian GVP eruptions of VEI 4 and up, Wikidata and World Peace Foundation famines, and the PAGES 2k global
# temperature (yearly median and 31-year smoothed). Curated shocks stay in the page's built-in disease layer.
import json, os


def build(repo):
    d = os.path.join(repo, 'data', 'disease-climate')
    rows = lambda f: [json.loads(l) for l in open(os.path.join(d, f), encoding='utf-8') if l.strip()] if os.path.exists(os.path.join(d, f)) else []
    src = []  # shared source list; records point at indexes
    def S(lst):
        out = []
        for s in lst or []:
            k = [s.get('cite'), s.get('url')]
            if k not in src:
                src.append(k)
            out.append(src.index(k))
        return out
    r2 = lambda x: round(x, 2)

    # Eruptions: [volcano, year, lat, lon, VEI, +- years (0 if dated exactly), GVP eruption number]; source index in esrc.
    er, esrc = [], None
    for r in rows('bulk_eruptions.jsonl'):
        rng = r.get('start_range')
        pm = (rng[1] - rng[0]) // 2 if rng else 0
        er.append([r['name'].rsplit(' eruption', 1)[0], r['start'], r2(r['lat']), r2(r['lon']), r['vei'], pm, r['ext']['gvp_eruption']])
        esrc = S(r['sources'])[0]
    er.sort(key=lambda r: r[1])

    # Famines: [name, start, end, lat, lon, deaths low, deaths high, wikidata id, source, country centre?].
    fam = []
    for f in ('bulk_wikidata.jsonl', 'bulk_famines.jsonl'):
        for r in rows(f):
            if r['subtype'] != 'famine' or r.get('lat') is None:
                continue
            dl, dh = (r.get('deaths') or [None, None])
            fam.append([r['name'], r['start'], r.get('end') or r['start'], r2(r['lat']), r2(r['lon']), dl, dh, r.get('wikidata') or '',
                        S(r['sources'])[0], 1 if 'location: country centroid' in (r.get('tags') or []) else 0])
    fam.sort(key=lambda r: r[1])

    # Temperature: [year, median] and [year, 31-year median, low, high], degrees C against 1961-1990.
    ms = {r['id']: r for r in rows('bulk_measures.jsonl')}
    t1 = ms.get('m:temperature_anomaly:earth:pages2k_2019')
    t31 = ms.get('m:temperature_anomaly_31yr:earth:pages2k_2019')
    temp = [[p[0], r2(p[1])] for p in t1['points']] if t1 else []
    temp31 = [[p[0], r2(p[1]), r2(p[2]), r2(p[3])] for p in t31['points']] if t31 else []
    tsrc = S(t1['sources'])[0] if t1 else None
    fd = ms.get('m:deaths:famines_world:wpf')
    return {'er': er, 'esrc': esrc, 'fam': fam, 'temp': temp, 'temp31': temp31, 'tsrc': tsrc,
            'famdec': [[int(y), int(v)] for y, v in fd['points']] if fd else [], 'famsrc': S(fd['sources'])[0] if fd else None, 'src': src}


if __name__ == '__main__':
    import sys
    out = build(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))
    print({k: len(v) if isinstance(v, list) else v for k, v in out.items()}, len(json.dumps(out, separators=(',', ':'), ensure_ascii=False)), file=sys.stderr)
