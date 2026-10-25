// Precise historical borders for the pixel map, loaded on demand from files published next to the page:
//   borders/l0|l1|l2/world_<year>.json  (TopoJSON from ingest/geography/precise_borders.py; l0 5 km, l1 1.5 km, l2 400 m)
// const B = PixelBorders({ base: "borders/", onLoad })
// B.realms(year, k) -> realms for the snapshot at or before year, at the level for zoom k: the finest one loaded,
//                      requesting the right one if it is missing (onLoad fires when it arrives). null if none loaded yet.
(function (global) {
  const SNAPS = [-4000, -3000, -2000, -1500, -1000, -700, -500, -400, -323, -300, -200, -100, -1, 100, 200, 300, 400, 500, 600, 700, 800, 900,
    1000, 1100, 1200, 1279, 1300, 1400, 1492, 1500, 1530, 1600, 1650, 1700, 1715, 1783, 1800, 1815, 1878, 1880, 1900, 1914, 1920, 1930, 1938,
    1945, 1960, 1994, 2000, 2010];
  const label = y => y < 0 ? "bc" + -y : String(y);
  const REALM = () => global.PIXEL_PALETTE.REALM;
  // Stable colour per realm id, so a realm keeps its colour across centuries.
  const colorOf = id => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0; const R = REALM(); return R[Math.abs(h) % R.length]; };

  function PixelBorders(opts = {}) {
    const base = opts.base || "borders/", cache = {}, failed = {};
    const snapFor = y => { let s = SNAPS[0]; for (const v of SNAPS) if (v <= y) s = v; return s; };
    const levelFor = k => k >= 9 ? 2 : k >= 3 ? 1 : 0;
    function load(s, l) {
      const key = l + ":" + s;
      if (cache[key] || failed[key]) return;
      cache[key] = "loading";
      fetch(`${base}l${l}/world_${label(s)}.json`).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(t => {
        const feats = [];
        for (const o of Object.values(t.objects)) for (const f of topojson.feature(t, o).features) feats.push(f);
        cache[key] = feats.filter(f => f.properties && f.properties.id).map(f => {
          const p = f.properties;
          return { id: p.id, n: p.n, name: p.name, subject: p.subject_of, precision: p.precision, color: colorOf(p.part_of || p.id), feature: f };
        });
        if (opts.onLoad) opts.onLoad(s, l);
      }).catch(() => { delete cache[key]; failed[key] = 1; });
    }
    return {
      snapFor, levelFor,
      realms(year, k) {
        const s = snapFor(year), want = levelFor(k);
        load(s, want);
        for (let l = want; l >= 0; l--) { const c = cache[l + ":" + s]; if (Array.isArray(c)) return c; if (l < want) load(s, l); }
        for (let l = want + 1; l <= 2; l++) { const c = cache[l + ":" + s]; if (Array.isArray(c)) return c; }
        return null;
      },
      failed: (year, k) => !!failed[levelFor(k) + ":" + snapFor(year)] && !!failed["0:" + snapFor(year)],
    };
  }
  global.PixelBorders = PixelBorders;
})(typeof window !== "undefined" ? window : globalThis);
