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
  // Features decode their geometry on first use: a chunk holds hundreds of realms across many frames, and decoding them
  // all at once when it arrives (about 100 ms for an l1 chunk) would land on a year step.
  const lazyFeature = (t, g) => { let geo; return { type: "Feature", id: g.id, properties: g.properties || {}, get geometry() { return geo || (geo = topojson.feature(t, g).geometry); } }; };
  const readTopo = t => { const out = []; for (const o of Object.values(t.objects)) for (const g of o.type === "GeometryCollection" ? o.geometries : [o]) out.push(lazyFeature(t, g)); return out; };

  // Chunks are fetched, parsed and decoded in a worker, which also projects every outline (Natural Earth, before scale
  // and translate) into flat arrays. A year step then only fills ready paths: no JSON parse, topology decode or
  // projection on the main thread. Each feature keeps a GeoJSON geometry (built on first use) for anything else.
  // Without workers (or if one fails) chunks decode on the main thread as before.
  function workerSource() {
    const R = Math.PI / 180;
    const raw = (l, p) => { const p2 = p * p, p4 = p2 * p2; return [l * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4))),
      p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)))]; };
    onmessage = async ev => {
      const { url, key } = ev.data;
      try {
        const res = await fetch(url); if (!res.ok) throw new Error(res.status);
        const t = await res.json(), T = t.transform;
        const arcs = t.arcs.map(a => { const o = new Float64Array(a.length * 2); let x = 0, y = 0;
          for (let i = 0; i < a.length; i++) { if (T) { x += a[i][0]; y += a[i][1]; o[2 * i] = x * T.scale[0] + T.translate[0]; o[2 * i + 1] = y * T.scale[1] + T.translate[1]; } else { o[2 * i] = a[i][0]; o[2 * i + 1] = a[i][1]; } }
          return o; });
        const ring = idx => { const pts = [];
          for (const i of idx) { const a = arcs[i < 0 ? ~i : i], n = a.length / 2; if (pts.length) pts.length -= 2;
            if (i < 0) for (let j = n - 1; j >= 0; j--) pts.push(a[2 * j], a[2 * j + 1]); else for (let j = 0; j < n; j++) pts.push(a[2 * j], a[2 * j + 1]); }
          return pts; };
        const out = [], bufs = [];
        for (const o of Object.values(t.objects)) for (const g of o.type === "GeometryCollection" ? o.geometries : [o]) {
          const polys = g.type === "Polygon" ? [g.arcs] : g.type === "MultiPolygon" ? g.arcs : [];
          const rings = [], first = [];
          for (const poly of polys) poly.forEach((r, i) => { rings.push(ring(r)); first.push(i === 0 ? 1 : 0); });
          let n = 0; for (const r of rings) n += r.length;
          const ll = new Float32Array(n), xy = new Float32Array(n), lens = new Int32Array(rings.length), news = Uint8Array.from(first);
          let o2 = 0, cross = false, x0 = 180, y0 = 90, x1 = -180, y1 = -90;
          rings.forEach((r, ri) => { lens[ri] = r.length / 2;
            for (let i = 0; i < r.length; i += 2) { const lo = r[i], la = r[i + 1];
              if (la > 89 || la < -89 || lo >= 180 || lo <= -180 || (i && Math.abs(lo - r[i - 2]) > 90)) cross = true;
              if (lo < x0) x0 = lo; if (lo > x1) x1 = lo; if (la < y0) y0 = la; if (la > y1) y1 = la;
              const q = raw(lo * R, la * R); ll[o2] = lo; ll[o2 + 1] = la; xy[o2] = q[0]; xy[o2 + 1] = q[1]; o2 += 2; } });
          out.push({ id: g.id, properties: g.properties || {}, type: g.type, ll, xy, lens, news, cross, bbox: rings.length ? [x0, y0, x1, y1] : null });
          bufs.push(ll.buffer, xy.buffer, lens.buffer, news.buffer);
        }
        postMessage({ key, feats: out }, bufs);
      } catch (err) { postMessage({ key, error: String(err) }); }
    };
  }
  let sharedWorker;
  function borderWorker() {
    if (sharedWorker !== undefined) return sharedWorker;
    try {
      const src = "(" + workerSource.toString() + ")()";
      sharedWorker = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
      sharedWorker.jobs = {};
      // A page that may not start workers (a strict sandbox) falls back to the main thread, pending chunks included.
      sharedWorker.onerror = () => { const jobs = sharedWorker.jobs; sharedWorker = null; for (const k in jobs) jobs[k]({ error: "worker" }); };
      sharedWorker.onmessage = ev => { const j = sharedWorker.jobs[ev.data.key]; delete sharedWorker.jobs[ev.data.key]; if (j) j(ev.data); };
    } catch (err) { sharedWorker = null; }
    return sharedWorker;
  }
  // A worker feature as GeoJSON-shaped: geometry is rebuilt from the decoded rings only when something asks for it.
  function workerFeature(d) {
    let geo;
    return { type: "Feature", id: d.id, properties: d.properties, raw: d, get geometry() {
      if (geo) return geo;
      const polys = []; let o = 0;
      for (let r = 0; r < d.lens.length; r++) { const ring = []; for (let i = 0; i < d.lens[r]; i++, o += 2) ring.push([d.ll[o], d.ll[o + 1]]); if (d.news[r] || !polys.length) polys.push([]); polys[polys.length - 1].push(ring); }
      return geo = d.type === "Polygon" ? { type: "Polygon", coordinates: polys[0] || [] } : { type: "MultiPolygon", coordinates: polys };
    } };
  }

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
      const W = opts.worker === false ? null : borderWorker();
      const main = () => fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(t => {
        cache[key] = parse(readTopo(t));
        if (opts.onLoad) opts.onLoad();
      }).catch(() => { delete cache[key]; failed[key] = 1; });
      if (!W) return main();
      const job = Math.random().toString(36).slice(2) + ":" + key;
      W.jobs[job] = d => {
        if (d.error) { if (/^Error: \d+$/.test(d.error)) { delete cache[key]; failed[key] = 1; } else main(); return; }
        cache[key] = parse(d.feats.map(workerFeature));
        if (opts.onLoad) opts.onLoad();
      };
      W.postMessage({ url: new URL(url, location.href).href, key: job });
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
