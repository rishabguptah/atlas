#!/usr/bin/env python3
"""How much the kernel knows, by region and century, and a density grid for the world index.

Usage: python3 ingest/coverage/coverage.py [--tag NAME]     (run python3 tools/build.py first)
Reads dist/kernel.json and data/coverage/geo/regions.json. Writes
  data/coverage/geo/density.json   cells of 5 degrees x 100 years: located records per kind (for ATLAS.world.density)
  data/coverage/report/coverage-<tag>.json and .svg   region x century table and heatmap (default tag: now)
A record counts once, in the century it starts (people: birth year; undated places: first attested), at its own point or its place's point.
Standard library only.
"""
import json, os, sys, math
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
COUNTED = ('person', 'place', 'event', 'polity', 'work', 'idea', 'group', 'route', 'sample')
C0, C1 = -3000, 2000  # century bins: [-3000,-2900) ... [1900,2000); later years go in the last bin
DCELL = 5


class Regions:
    def __init__(self, path=os.path.join(ROOT, 'data/coverage/geo/regions.json')):
        d = json.load(open(path))
        self.cell, self.codes, self.names = d['cell'], d['codes'], d['names']
        self.rows = []
        for runs in d['rows']:
            row = []
            for i in range(0, len(runs), 2):
                row += [runs[i]] * runs[i + 1]
            self.rows.append(row)

    def at(self, lon, lat):
        y = min(len(self.rows) - 1, max(0, int((90 - lat) / self.cell)))
        x = int(((lon + 180) % 360) / self.cell) % len(self.rows[0])
        v = self.rows[y][x]
        return self.codes[v] if v >= 0 else None


def when(r):
    for v in (r.get('start'), (r.get('born') or {}).get('year'), (r.get('attested') or [None])[0]):
        if isinstance(v, int):
            return v
    return None


def where(r, places):
    if isinstance(r.get('lat'), (int, float)) and isinstance(r.get('lon'), (int, float)):
        return r['lon'], r['lat']
    for p in (r.get('place'), (r.get('born') or {}).get('place'), r.get('capital')):
        if isinstance(p, str) and p in places:
            return places[p]
    return None


def century(y):
    return max(C0, min(C1 - 100, (y // 100) * 100))


def main():
    tag = sys.argv[sys.argv.index('--tag') + 1] if '--tag' in sys.argv else 'now'
    K = json.load(open(os.path.join(ROOT, 'dist/kernel.json')))['records']
    R = Regions()
    places = {r['id']: (r['lon'], r['lat']) for r in K.get('place', []) if isinstance(r.get('lat'), (int, float)) and isinstance(r.get('lon'), (int, float))}
    table = defaultdict(Counter)          # region -> century -> n
    people = defaultdict(Counter)
    kinds_by_region = defaultdict(Counter)
    dens = defaultdict(Counter)           # (cx, cy, century) -> kind -> n
    located = undated = 0
    for kind in COUNTED:
        for r in K.get(kind, []):
            if r.get('stub'):
                continue
            pt = where(r, places)
            if not pt:
                continue
            located += 1
            reg = R.at(*pt) or 'sea'
            kinds_by_region[reg][kind] += 1
            y = when(r)
            if y is None:
                undated += 1
                continue
            c = century(y)
            table[reg][c] += 1
            if kind == 'person':
                people[reg][c] += 1
            cx, cy = int((pt[0] + 180) // DCELL), int((pt[1] + 90) // DCELL)
            dens[(cx, cy, c)][kind] += 1
    cents = list(range(C0, C1, 100))
    regions = R.codes + ['sea']
    total = {g: sum(table[g].values()) for g in regions}
    allloc = sum(sum(v.values()) for v in kinds_by_region.values())
    rep = {'tag': tag, 'located': located, 'undated': undated, 'centuries': cents,
           'regions': [{'code': g, 'name': R.names.get(g, 'At sea'), 'records': [table[g][c] for c in cents],
                        'people': [people[g][c] for c in cents], 'kinds': dict(kinds_by_region[g]),
                        'share': round(sum(kinds_by_region[g].values()) / max(1, allloc), 4)} for g in regions]}
    # the target: every region at least 10% of Europe in each century from 500 BCE
    eu = table['europe']
    gaps = []
    for g in R.codes:
        if g == 'europe':
            continue
        for c in cents:
            if c >= -500 and table[g][c] < 0.1 * eu[c]:
                gaps.append([g, c, table[g][c], eu[c]])
    rep['below_10pct_of_europe'] = gaps
    os.makedirs(os.path.join(ROOT, 'data/coverage/report'), exist_ok=True)
    json.dump(rep, open(os.path.join(ROOT, f'data/coverage/report/coverage-{tag}.json'), 'w'), separators=(',', ':'))
    svg(rep, os.path.join(ROOT, f'data/coverage/report/coverage-{tag}.svg'))
    # density grid for the world index (shape agreed with ATLAS.world.density's owner)
    bins = [[c, c + 100] for c in cents]
    cells = defaultdict(list)
    for (cx, cy, c), k in sorted(dens.items()):
        cells[f'{cx},{cy}'].append([cents.index(c), [k.get(x, 0) for x in COUNTED]])
    json.dump({'cell_deg': DCELL, 't_bins': bins, 'kinds': list(COUNTED), 'cells': cells,
               'note': 'col = floor((lon+180)/cell_deg), row = floor((lat+90)/cell_deg); each cell lists [t_bin index, counts per kind]. '
                       'A record counts once, in the century it starts (people: birth); the first bin also holds anything older, the last anything newer.'},
              open(os.path.join(ROOT, 'data/coverage/geo/density.json'), 'w'), separators=(',', ':'))
    print(f'{tag}: located {located}, undated {undated}, cells {len(cells)}, gaps after -500: {len(gaps)}')
    for g in rep['regions']:
        print(f"  {g['name']:28s} share {g['share']*100:5.1f}%  people {sum(g['people']):6d}  records {sum(g['records']):6d}")


def svg(rep, path):
    cents = [c for c in rep['centuries'] if c >= -1500]
    regs = [g for g in rep['regions'] if g['code'] != 'sea']
    cw, ch, lx, ty = 22, 22, 190, 40
    W, H = lx + cw * len(cents) + 20, ty + ch * len(regs) + 60
    eu = dict(zip(rep['centuries'], regs[0]['records']))
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" font-family="system-ui,sans-serif" font-size="11">',
           f'<rect width="{W}" height="{H}" fill="#fbf8f1"/>',
           f'<text x="10" y="20" font-size="14" font-weight="600">Records per region and century ({rep["tag"]}): colour = log count, red outline = below 10% of Europe</text>']
    for j, c in enumerate(cents):
        if c % 500 == 0:
            lab = f'{-c} BCE' if c < 0 else f'{c}'
            out.append(f'<text x="{lx + j * cw}" y="{ty + ch * len(regs) + 16}">{lab}</text>')
    for i, g in enumerate(regs):
        out.append(f'<text x="10" y="{ty + i * ch + 15}">{g["name"]}</text>')
        vals = dict(zip(rep['centuries'], g['records']))
        for j, c in enumerate(cents):
            n = vals[c]
            t = min(1, math.log10(n + 1) / 4)
            col = '#eee8dc' if n == 0 else f'hsl({200 - 160 * t:.0f},{45 + 25 * t:.0f}%,{88 - 50 * t:.0f}%)'
            bad = g['code'] != 'europe' and c >= -500 and n < 0.1 * eu[c]
            stroke = ' stroke="#c0392b" stroke-width="1.5"' if bad else ''
            out.append(f'<rect x="{lx + j * cw}" y="{ty + i * ch}" width="{cw - 2}" height="{ch - 2}" fill="{col}"{stroke}><title>{g["name"]} {c}: {n}</title></rect>')
    out.append(f'<text x="10" y="{H - 14}" fill="#555">located {rep["located"]} records; {len(rep["below_10pct_of_europe"])} region-centuries after 500 BCE below 10% of Europe</text></svg>')
    open(path, 'w').write('\n'.join(out))


if __name__ == '__main__':
    main()
