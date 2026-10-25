// Precise historical borders for the pixel map, loaded on demand from files published next to the page.
//   borders-time/index.json + borders-time/l0|l1|l2/<chunk>.json  (ingest/geography/timeline_borders.py: Cliopatria, every
//       year a border changed, about 500 frames from 3400 BCE to 2024; each feature carries its first and last year s, e)
//   borders/l0|l1|l2/world_<year>.json  (ingest/geography/precise_borders.py: the 49 historical-basemaps snapshots),
//       used when the timeline is not published
// const B = PixelBorders({ base: "borders/", timeBase: "borders-time/", onLoad })
// B.realms(year, k) -> realms drawn in that year, at the level for zoom k: the finest one loaded, requesting the right
//                      one if it is missing (onLoad fires when it arrives). null if none loaded yet.
// B.snapFor(year)   -> the frame year in force (the last change at or before year); B.timeline() -> index once loaded.
// B.chunkRealms(year, k) -> every realm of the loaded chunk around year (for warming caches), or null.
(function (global) {
  const SNAPS = [-4000, -3000, -2000, -1500, -1000, -700, -500, -400, -323, -300, -200, -100, -1, 100, 200, 300, 400, 500, 600, 700, 800, 900,
    1000, 1100, 1200, 1279, 1300, 1400, 1492, 1500, 1530, 1600, 1650, 1700, 1715, 1783, 1800, 1815, 1878, 1880, 1900, 1914, 1920, 1930, 1938,
    1945, 1960, 1994, 2000, 2010];
  const label = y => y < 0 ? "bc" + -y : String(y);
  const REALM = () => global.PIXEL_PALETTE.REALM;
  // Stable colour per realm id, so a realm keeps its colour across centuries.
  const colorOf = id => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0; const R = REALM(); return R[Math.abs(h) % R.length]; };
  const lastAtOrBefore = (arr, y) => { let lo = 0, hi = arr.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m] <= y) { r = m; lo = m + 1; } else hi = m - 1; } return r; };
  const readTopo = t => { const out = []; for (const o of Object.values(t.objects)) for (const f of topojson.feature(t, o).features) out.push(f); return out; };

  function PixelBorders(opts = {}) {
    const base = opts.base || "borders/", tbase = opts.timeBase === undefined ? "borders-time/" : opts.timeBase;
    const cache = {}, failed = {}, frames = {};
    const levelFor = k => k >= 9 ? 2 : k >= 3 ? 1 : 0;
    // The timeline index: null while loading, false if it is not published (then the snapshots stand in).
    let index = tbase ? null : false;
    if (tbase) fetch(tbase + "index.json").then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(ix => { index = ix; if (opts.onLoad) opts.onLoad(); }).catch(() => { index = false; if (opts.onLoad) opts.onLoad(); });
    const snapFor = y => {
      if (index) { const i = lastAtOrBefore(index.years, y); return i < 0 ? index.years[0] : index.years[i]; }
      let s = SNAPS[0]; for (const v of SNAPS) if (v <= y) s = v; return s;
    };
    const chunkFor = y => { if (!index) return null; const c = index.chunks; for (let i = c.length - 1; i >= 0; i--) if (c[i][0] <= y) return c[i]; return c[0]; };
    const toRealm = (p, f) => ({ id: p.id, n: p.n, name: p.name, subject: p.subject_of, precision: p.precision, s: p.s, e: p.e, wiki: p.wiki, la: p.la,
      color: colorOf(p.la || p.part_of || p.id), feature: f });
    function get(url, key, parse) {
      if (cache[key] || failed[key]) return;
      cache[key] = "loading";
      fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(t => {
        cache[key] = parse(readTopo(t));
        if (opts.onLoad) opts.onLoad();
      }).catch(() => { delete cache[key]; failed[key] = 1; });
    }
    const loadSnap = (s, l) => get(`${base}l${l}/world_${label(s)}.json`, l + ":" + s,
      feats => feats.filter(f => f.properties && f.properties.id).map(f => toRealm(f.properties, f)));
    const loadChunk = (c, l) => get(`${tbase}l${l}/${c[2]}.json`, "t" + l + ":" + c[2],
      feats => feats.filter(f => f.properties && f.properties.id).map(f => toRealm(f.properties, f)));
    // Realms of one frame: the chunk's rows alive in that year, biggest first as stored (vassals on top).
    function frame(c, l, y) {
      const all = cache["t" + l + ":" + c[2]];
      if (!Array.isArray(all)) return null;
      const fr = snapFor(y), key = l + ":" + fr;
      if (frames[key] && frames[key].all === all) return frames[key].list;
      const list = all.filter(r => r.s <= fr && fr <= r.e);
      frames[key] = { all, list };
      return list;
    }
    function timeRealms(y, k) {
      const c = chunkFor(y), want = levelFor(k);
      if (!c || y < index.years[0]) return [];
      loadChunk(c, want);
      // Fetch the neighbouring chunks too, so playing or scrubbing across a chunk edge does not wait on the network.
      const ci = index.chunks.indexOf(c);
      if (Array.isArray(cache["t" + want + ":" + c[2]])) for (const n of [index.chunks[ci + 1], index.chunks[ci - 1]]) if (n) loadChunk(n, want);
      for (let l = want; l >= 0; l--) { const r = frame(c, l, y); if (r) return r; if (l < want) loadChunk(c, l); }
      for (let l = want + 1; l <= 2; l++) { const r = frame(c, l, y); if (r) return r; }
      return null;
    }
    return {
      snapFor, levelFor, timeline: () => index || null,
      realms(year, k) {
        if (index === null) return null;
        if (index) { const r = timeRealms(year, k); if (r || !failed["t0:" + chunkFor(year)[2]]) return r; }
        const s = snapFor(year), want = levelFor(k);
        loadSnap(s, want);
        for (let l = want; l >= 0; l--) { const c = cache[l + ":" + s]; if (Array.isArray(c)) return c; if (l < want) loadSnap(s, l); }
        for (let l = want + 1; l <= 2; l++) { const c = cache[l + ":" + s]; if (Array.isArray(c)) return c; }
        return null;
      },
      // Every realm of the loaded chunk around year (all its frames) at the level for zoom k, for warming caches.
      chunkRealms(year, k) { const c = index && chunkFor(year), all = c && cache["t" + levelFor(k) + ":" + c[2]]; return Array.isArray(all) ? all : null; },
      failed: (year, k) => index === false && !!failed[levelFor(k) + ":" + snapFor(year)] && !!failed["0:" + snapFor(year)],
    };
  }
  global.PixelBorders = PixelBorders;
})(typeof window !== "undefined" ? window : globalThis);
