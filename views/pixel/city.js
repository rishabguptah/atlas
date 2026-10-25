// City plans on the pixel map: past about 3 degrees across, the story cities (data/cities/) show their walls, gates,
// towers, harbours, built-up area and landmark buildings for the year, drawn into the same art-pixel grid as the
// terrain (one world, one grid). Data: ingest/city/plan.py, bundled by views/atlas/world/build_index.py into
// atlas-files/world/cities.json and fetched the first time the map zooms that far.
//
//   const C = PixelCity({ url: "atlas-files/world/cities.json", onLoad })
//   C.draw(G, phase, year, proj)     the pixel map's detail hook (only the "over" pass draws)
//   C.names(view)                    landmark names for the label engine (ATLAS.labels)
//   C.at(lon, lat, year)             the feature under a point (for click cards), or null
//
// Art: every mark goes through ART[kind](put, i, j, f, year) (lines: ART["line:" + kind] per pixel, with its index n
// along the line); PixelCity.ART is the default set of plain stamps and
// another file (the pixel world's art pass) may replace any entry. put(i, j, colour) writes one art pixel; it skips
// water and off-globe pixels unless the kind is meant for water (chains, piers). Features dated estimated or worse
// are drawn with gaps (rule 5: every mark shows how sure we are); undated walls are drawn faint.
(function (global) {
  const K_WALLS = 110, K_ALL = 700;  // walls and the best-known buildings from K_WALLS; every building by K_ALL
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const P = s => { const [r, g, b] = hex(s); return (255 << 24 | b << 16 | g << 8 | r) >>> 0; };
  const C = {
    ink: P("#221f1a"), wall: P("#ece2cc"), wallS: P("#5a5044"), wallF: P("#cfc4ae"), tower: P("#f6f0e0"),
    stone: P("#b4aca0"), stoneD: P("#6e665c"), stoneL: P("#e2dace"), roof: P("#b8583a"), roofD: P("#7e3a26"),
    dome: P("#d8c890"), domeD: P("#8a7a4c"), lead: P("#8c96a0"), leadD: P("#525a64"), gold: P("#e8c050"),
    green: P("#4a7a46"), wood: P("#8a5a32"), woodD: P("#5e3a1e"), chain: P("#2a2420"), water: P("#5e9aa4"),
    street: P("#e8dcbc"), house: P("#d8b48c"), houseD: P("#9a7a5a"), red: P("#b8382a"), white: P("#f2eee4"),
  };
  // Stamps as text grids, bottom row on the anchor pixel, centred: k ink, s stone, d shade, l light, r roof, R roof
  // shade, o dome, O dome shade, g gold, w wood, x white, e lead, E lead shade.
  const KEY = { k: "ink", s: "stone", d: "stoneD", l: "stoneL", r: "roof", R: "roofD", o: "dome", O: "domeD", g: "gold", w: "wood", W: "woodD", x: "white", e: "lead", E: "leadD", t: "tower" };
  const S = {
    church: ["..g..", ".kok.", "kooOk", "kslsk", "ksdsk"],
    mosque: ["g......", "k..g...", "k.kok..", "k.kooOk", "kkssssk", "kksdssk"],
    temple: ["..k..", ".kRk.", "krrRk", "kslsk", "kldlk"],
    palace: [".kRk.kRk.", "krrRkrrRk", "ksslssssk", "ksdsdsdsk"],
    fort: ["k.k.k.k", "ksksksk", "ksssssk", "kslldsk", "ksldssk"],
    tower: [".k.", "ktk", "ksk", "ksk", "kdk"],
    gate: ["k.k.k", "kskts", "ks.sk", "kd.dk"],
    column: [".l.", ".s.", ".s.", ".s.", "kdk"],
    aqueduct: ["sssssss", "s.s.s.s", "s.s.s.s"],
    forum: ["kkkkkk", "k....k", "k....k", "kkkkkk"],
    market: [".kRRk.", "krrrRk", "kw.w.k"],
    tomb: ["..k..", ".kok.", "kooOk", "ksssk"],
    harbour: ["wwwww", "W...W"],
    school: [".kRk.", "krrRk", "ksldk"],
    house: [".R.", "rrR", "sds"],
    bridge: ["ssss", "s..s"],
  };
  const rgbOf = name => C[KEY[name]] ?? C[name];
  function stampArt(rows) {
    return (put, i, j) => {
      const hh = rows.length, ww = rows[0].length;
      for (let y = 0; y < hh; y++) for (let x = 0; x < ww; x++) {
        const ch = rows[y][x]; if (ch === ".") continue;
        put(i + x - (ww >> 1), j + y - hh + 1, rgbOf(ch));
      }
    };
  }
  const ART = {};
  for (const k in S) ART[k] = stampArt(S[k]);
  // Walls, per pixel along the line: o.faint for undated walls, towers every few pixels once close enough.
  ART["line:wall"] = (put, i, j, f, year, n, o) => {
    if (o.faint) { if (n & 1) put(i, j, C.wallF); return; }
    put(i, j, C.wall); put(i, j + 1, C.wallS);
    if (o.k >= 300 && n % 9 === 0) { put(i, j - 1, C.tower); put(i - 1, j, C.tower); put(i + 1, j, C.tower); }
  };

  function PixelCity(opts) {
    const url = (opts && opts.url) || "atlas-files/world/cities.json", onLoad = (opts && opts.onLoad) || (() => {});
    let cities = null, loading = false, over = null, overKey = "", shown = [];
    function load() {
      if (cities || loading) return;
      loading = true;
      fetch(url).then(r => (r.ok ? r.json() : { cities: [] })).then(d => {
        cities = d.cities || [];
        for (const c of cities) for (const f of c.features) {
          if (f.line) { let a = 180, b = 90, e = -180, n = -90; for (const [x, y] of f.line) { a = Math.min(a, x); b = Math.min(b, y); e = Math.max(e, x); n = Math.max(n, y); } f.bb = [a, b, e, n]; }
          if (f.area) { let a = 180, b = 90, e = -180, n = -90; for (const [x, y] of f.area) { a = Math.min(a, x); b = Math.min(b, y); e = Math.max(e, x); n = Math.max(n, y); } f.bb = [a, b, e, n]; }
        }
        onLoad();
      }).catch(() => { cities = []; });
    }
    const alive = (f, y) => f.t0 == null ? f.k === "wall" : f.t0 <= y && (f.t1 == null || y <= f.t1);
    function inView(G, proj) {
      // The lon/lat box the grid covers, from its corners (the map is equirectangular near a city).
      const inv = proj.invert, sc = G.PX / G.k;
      const a = inv([G.U0 * sc, G.V0 * sc]), b = inv([(G.U0 + G.w) * sc, (G.V0 + G.h) * sc]);
      return a && b ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])] : null;
    }
    const overlaps = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

    function draw(G, phase, year, proj) {
      if (phase !== "over" || year == null || G.k < K_WALLS || !proj) return;
      if (!cities) { load(); return; }
      const box = inView(G, proj); if (!box) return;
      const here = cities.filter(c => overlaps(c.bbox, box) && year >= c.t0 - 50);
      if (!here.length) { shown = []; return; }
      const B = G.base;
      // Redraw only when the view or the set of standing features changes, not on every year step.
      let sig = 0;
      for (const c of here) for (let i = 0; i < c.features.length; i++) if (alive(c.features[i], year)) sig = (sig * 31 + i + 1) | 0;
      const key = [G.k, G.U0, G.V0, G.w, G.h, here.length, sig].join();
      if (key === overKey && over) { for (let i = 0; i < over.length; i += 2) B[over[i]] = over[i + 1]; return; }
      const before = B.slice(), occ = new Uint8Array(G.w * G.h), { w, h, cls } = G;
      const toPx = (lon, lat) => { const p = proj([lon, lat]); return p && [Math.floor((p[0] * G.k) / G.PX) - G.U0, Math.floor((p[1] * G.k) / G.PX) - G.V0]; };
      const mkPut = wet => (i, j, c) => {
        if (i < 0 || j < 0 || i >= w || j >= h || c == null) return;
        const q = j * w + i, cl = cls[q];
        if (cl === 255 || (!wet && cl <= 3)) return;
        B[q] = c; occ[q] = 1;
      };
      const put = mkPut(false), putWet = mkPut(true);
      const line = (pts, fn) => {
        let pi = null, pj = null, n = 0;
        for (const [lon, lat] of pts) {
          const p = toPx(lon, lat); if (!p) { pi = null; continue; }
          const [i, j] = p;
          if (pi !== null) {
            let x0 = pi, y0 = pj; const dx = Math.abs(i - x0), dy = -Math.abs(j - y0), sx = x0 < i ? 1 : -1, sy = y0 < j ? 1 : -1;
            let e = dx + dy, guard = 0;
            for (;;) { fn(x0, y0, n++); if ((x0 === i && y0 === j) || ++guard > 8000) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
          }
          pi = i; pj = j;
        }
      };
      shown = []; shownYear = year;
      for (const c of here) {
        const F = c.features.filter(f => alive(f, year) && (!f.bb || overlaps(f.bb, box)) && (!f.at || (f.at[0] >= box[0] && f.at[0] <= box[2] && f.at[1] >= box[1] && f.at[1] <= box[3])));
        // Built-up areas first (roof texture), then streets and water lines, walls, then buildings on top.
        for (const f of F) if (f.area && f.k === "water") fillWater(G, f, toPx);
        for (const f of F) if (f.area && (f.k === "extent" || f.k === "district")) fillArea(G, f, toPx, put, occ, year);
        for (const f of F) if (f.line && f.k !== "wall") {
          const art = ART["line:" + f.k];  // a line kind's art, per pixel along it (put, i, j, f, year, n)
          if (art) { line(f.line, (i, j, n) => art(f.k === "chain" ? putWet : put, i, j, f, year, n)); continue; }
          if (f.k === "chain") line(f.line, (i, j, n) => { if (n % 2 === 0) putWet(i, j, C.chain); });
          else if (f.k === "canal") line(f.line, (i, j) => putWet(i, j, C.water));
          else line(f.line, (i, j, n) => { if (f.conf < 2 || n % 4 !== 3) put(i, j, C.street); });
        }
        for (const f of F) if (f.k === "wall" && f.line) {
          const faint = f.t0 == null, dashed = (f.conf || 0) >= 2 && !faint, art = ART["line:wall"];
          line(f.line, (i, j, n) => {
            if (dashed && n % 6 === 5) return;
            art(put, i, j, f, year, n, { faint, k: G.k });
          });
        }
        const pts = F.filter(f => f.at && f.k !== "wall").sort((a, b) => (b.sl || 0) - (a.sl || 0));
        const budget = G.k >= K_ALL ? 160 : Math.round(12 + (G.k - K_WALLS) / 5);
        let n = 0;
        for (const f of pts) {
          if (n >= budget) break;
          const p = toPx(f.at[0], f.at[1]); if (!p) continue;
          const [i, j] = p; if (i < 2 || j < 4 || i >= w - 2 || j >= h) continue;
          const kind = kindAt(f, year), art = ART[kind] || ART.house, rows = S[kind] || S.house, ww = rows[0].length, hh = rows.length;
          // Keep a pixel of space between buildings: a crowded centre shows the best known.
          let free = true;
          for (let y = j - hh; y <= j + 1 && free; y++) for (let x = i - (ww >> 1) - 1; x <= i + (ww >> 1) + 1; x++) if (x >= 0 && y >= 0 && x < w && y < h && occ[y * w + x] && !(f.k === "gate")) { free = false; break; }
          if (!free) continue;
          art(kind === "harbour" || kind === "bridge" ? putWet : put, i, j, f, year);
          shown.push(f); n++;
        }
      }
      const diff = [];
      for (let i = 0; i < B.length; i++) if (B[i] !== before[i]) diff.push(i, B[i]);
      over = new Uint32Array(diff); overKey = key;
    }

    // Water that is now land (a filled harbour, a drained lake, a shore before reclamation): flat water over the terrain.
    function fillWater(G, f, toPx) {
      scan(G, f, toPx, (i, j) => { const q = j * G.w + i; if (G.cls[q] !== 255) G.base[q] = ((i + j + G.U0 + G.V0) % 9 === 0) ? C.white : C.water; });
    }
    function scan(G, f, toPx, fn) {
      const pts = f.area.map(([lon, lat]) => toPx(lon, lat)).filter(Boolean);
      if (pts.length < 3) return;
      let y0 = Infinity, y1 = -Infinity; for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
      y0 = Math.max(0, y0); y1 = Math.min(G.h - 1, y1);
      for (let j = y0; j <= y1; j++) {
        const xs = [];
        for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) {
          const [xa, ya] = pts[a], [xb, yb] = pts[b];
          if ((ya > j) !== (yb > j)) xs.push(xa + ((j - ya) * (xb - xa)) / (yb - ya));
        }
        xs.sort((p, q) => p - q);
        for (let s = 0; s + 1 < xs.length; s += 2) for (let i = Math.max(0, Math.ceil(xs[s])); i <= Math.min(G.w - 1, Math.floor(xs[s + 1])); i++) fn(i, j);
      }
    }
    // A built-up area: a roof texture with lanes, on land only, under everything else.
    function fillArea(G, f, toPx, put) {
      const sparse = (f.conf || 0) >= 2;
      scan(G, f, toPx, (i, j) => {
        const u = i + G.U0, v = j + G.V0;
        if (v % 4 === 0 || u % 5 === 0) return put(i, j, C.street);              // lanes
        if (sparse && ((u * 7 + v * 13) % 5 === 0)) return;                       // an approximate edge thins out
        put(i, j, (v % 4 === 3) ? C.houseD : ((u * 3 + v) % 7 === 0 ? C.roof : C.house));
      });
    }

    // A feature's name and kind in a year, when the drafts give them by period ({names: [[t0, t1, name]], kinds}).
    const byYear = (list, y, dflt) => { if (list) for (const [a, b, v] of list) if ((a == null || a <= y) && (b == null || y <= b)) return v; return dflt; };
    const nameAt = (f, y) => byYear(f.names, y, f.name);
    const kindAt = (f, y) => byYear(f.kinds, y, f.k);
    let shownYear = null;
    function names(view) {
      if (!cities || !view || view.k < K_WALLS) return [];
      const out = [];
      for (const f of shown.slice(0, view.k >= K_ALL ? 40 : 14)) {
        const nm = nameAt(f, shownYear); if (!nm) continue;
        out.push({ text: nm, at: f.at, pri: 44 + Math.min(20, (f.sl || 0) / 5), style: "place", size: 10, minK: K_WALLS });
      }
      return out;
    }
    function at(lon, lat, year) {
      if (!cities) return null;
      let best = null, bd = 1e9;
      for (const c of cities) {
        if (lon < c.bbox[0] - 0.05 || lon > c.bbox[2] + 0.05 || lat < c.bbox[1] - 0.05 || lat > c.bbox[3] + 0.05) continue;
        for (const f of c.features) if (f.at && alive(f, year)) { const d = Math.hypot(f.at[0] - lon, f.at[1] - lat); if (d < bd) { bd = d; best = f; } }
      }
      return best && bd < 0.004 ? best : null;
    }
    return { draw, names, at, nameAt, kindAt, load, get cities() { return cities; }, get shown() { return shown; } };
  }
  PixelCity.ART = ART; PixelCity.STAMPS = S; PixelCity.COLORS = C;
  global.PixelCity = PixelCity;
})(typeof window !== "undefined" ? window : globalThis);
