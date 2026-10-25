// Pixel map renderer: a top-down 16-bit world map that is re-drawn from data at every zoom. See SPEC.md.
//
//   const pm = PixelMap(container, projection, { px: 3, rasters, land, rivers, palette })
//   pm.render(transform, { realms, year })   on zoom end, resize and year change (transform = d3 zoom transform)
//   pm.move(transform)                       on every zoom frame: shifts the last frame with CSS until render
//   pm.sprites(list, {max, pad}?)           [{lon, lat, sprite, frame?, team?, flip?, pri?, grp?}] drawn into the pixel grid; with pri, decluttered
//   pm.tick()                                advance sprite and water animation by one frame (call ~4 fps)
//   pm.overlay(fn) / pm.repaint()            fn(g) paints last, into the same grid (lens marks, see marks.js); repaint redraws
//   pm.setDetail(fn)                         fn(G, phase) draws zoom detail into the grid: "under" before realm tints, "over" after; "key" names the under pass (see detail.js)
//
// levels: [{cell, tdeg, url(col, row)}] equirectangular terrain tiles (R class, G hillshade, B elevation band), coarse to fine.
// land: GeoJSON land (coasts come from it, so they stay sharp at any zoom). rivers: [{rank, line: [[lon,lat],...]}].
// realms: [{id, name, color, feature}] political polygons for the year; drawn as flat tints with crisp 1-px borders.
(function (global) {
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => v / 16 - 0.47);
  const hash = (u, v) => { let h = (u * 374761393 + v * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const pack = ([r, g, b]) => (255 << 24 | b << 16 | g << 8 | r) >>> 0;
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const WATER = c => c <= 3, FOREST = c => c >= 7 && c <= 9;
  // Moods: colour grades applied to the finished frame (RGBA bytes in place).
  const NIGHT_RGB = ([r, g, b]) => [r * 0.3 + 4, g * 0.36 + 8, b * 0.5 + 26].map(Math.round);
  const MOODS = {
    dusk: (v, o) => { v[o] = Math.min(255, v[o] * 1.04 + 18); v[o + 1] = v[o + 1] * 0.86 + 6; v[o + 2] = v[o + 2] * 0.72 + 10; },
    night: (v, o) => { const [r, g, b] = NIGHT_RGB([v[o], v[o + 1], v[o + 2]]); v[o] = r; v[o + 1] = g; v[o + 2] = b; },
    chronicle: (v, o) => { const l = (v[o] * 0.3 + v[o + 1] * 0.55 + v[o + 2] * 0.15) / 255; v[o] = 58 + l * 186; v[o + 1] = 42 + l * 178; v[o + 2] = 28 + l * 150; },
  };
  const GLOW = { city_metropolis: 22, city_city: 16, city_town: 11, city_village: 7 };
  // Library settlements (sprites-library.js) glow by their size meta; landmarks like a small town.
  const GLOW_SIZE = [0, 7, 11, 16, 22, 26];
  const glowOf = name => { if (GLOW[name]) return GLOW[name]; const S = (global.PIXEL_SPRITES || {})[name]; return S && S.kind === "city" ? GLOW_SIZE[S.size || 2] : 0; };

  function decode(r) {
    if (r.data) return r;
    const c = document.createElement("canvas"); c.width = r.w = r.img.naturalWidth || r.img.width; c.height = r.h = r.img.naturalHeight || r.img.height;
    const x = c.getContext("2d"); x.drawImage(r.img, 0, 0);
    r.data = x.getImageData(0, 0, r.w, r.h).data;
    return r;
  }

  function PixelMap(container, projection, opts) {
    const PX = opts.px || 3, PAL = opts.palette || global.PIXEL_PALETTE;
    const T = PAL.TERRAIN.map(tones => tones.map(rgb));
    const TP = T.map(tones => tones.map(pack));
    const C = Object.fromEntries(Object.entries(PAL.KEYS).map(([k, v]) => [k, rgb(v)]));
    const OUT = rgb(opts.outside || "#efe6cc"), OUTP = pack(OUT), RIM = pack(rgb("#2a2420"));
    const FOAM = pack(rgb("#b8e0d4")), FOAM2 = pack(rgb("#7cb8b4")), BEACH = rgb("#e6d49a");
    const RIVER = [pack(rgb("#3e7c9c")), pack(rgb("#5a9cb8"))];
    const canvas = document.createElement("canvas");
    canvas.className = "pixelmap";
    Object.assign(canvas.style, { position: "absolute", left: 0, top: 0, imageRendering: "pixelated", transformOrigin: "0 0", pointerEvents: "none" });
    container.prepend(canvas);
    const ctx = canvas.getContext("2d");
    const off = document.createElement("canvas"), octx = off.getContext("2d", { willReadFrequently: true });
    let lastW = 0, lastH = 0, terrain = null, last = null, base = null, cls = null, hs = null, band = null, lowNoise = null, latA = null, lonA = null, detailFn = null, ids = null, w = 0, h = 0, U0 = 0, V0 = 0, frame = 0, allSprites = [], realmsNow = [];

    // Terrain tiles: levels coarse to fine, each {cell (degrees), tdeg (tile size in degrees), url(col, row)}.
    // Tiles load on demand; until a finer tile arrives the coarser level shows, then the map re-renders.
    const levels = opts.levels || [], tiles = {};
    let pending = 0, onTile = null;
    function tile(L, li, col, row) {
      const key = li * 100000 + col * 100 + row, t = tiles[key];
      if (t) return t.data ? t : null;
      const rec = tiles[key] = { x0: -180 + col * L.tdeg, y0: 90 - row * L.tdeg, cell: L.cell };
      const img = new Image(); pending++;
      img.onload = () => { rec.img = img; decode(rec); pending--; clearTimeout(onTile); onTile = setTimeout(() => last && render(last), 60); };
      img.onerror = () => { pending--; rec.data = null; rec.failed = true; };
      img.src = L.url(col, row);
      return null;
    }
    const OUT3 = [0, 0, 0];
    function sample(lon, lat, need, u, v, exact) {
      let r = null; lon = Math.min(179.9999, lon); lat = Math.max(-89.9999, lat);
      for (let li = 0; li < levels.length; li++) {
        const L = levels[li];
        if (li > 0 && L.cell * 1.6 < need && r) break;
        const col = Math.floor((lon + 180) / L.tdeg), row = Math.floor((90 - lat) / L.tdeg);
        const t = tile(L, li, col, row);
        if (t) r = t;
        if (L.cell <= need) break;
      }
      if (!r) return null;
      // Jitter by up to half a cell so cell edges read as organic shapes, not blocks, when zoomed past the data.
      const j = exact ? 0 : r.cell > need ? 0.9 : 0.5;
      const x = Math.min(r.w - 1, Math.max(0, Math.floor((lon - r.x0) / r.cell + (hash(u, v) - 0.5) * j)));
      const y = Math.min(r.h - 1, Math.max(0, Math.floor((r.y0 - lat) / r.cell + (hash(v, u) - 0.5) * j)));
      const i = (y * r.w + x) * 4;
      OUT3[0] = r.data[i]; OUT3[1] = r.data[i + 1]; OUT3[2] = r.data[i + 2];
      return OUT3;
    }

    const pathCache = new WeakMap(), ctxPath = d3.geoPath(projection);
    function maskFor(feats, fill) {
      octx.setTransform(1, 0, 0, 1, 0, 0); octx.clearRect(0, 0, w, h);
      const t = last;
      octx.setTransform(t.k / PX, 0, 0, t.k / PX, -U0, -V0);
      // Projected outlines are cached as Path2D per feature (and per projection), then filled through the zoom transform.
      const pk = projection.scale() + "," + projection.translate().join(",");
      feats.forEach((f, i) => { octx.fillStyle = fill(f, i); octx.fill(pathOf(f, pk)); });
      octx.setTransform(1, 0, 0, 1, 0, 0);
      return octx.getImageData(0, 0, w, h).data;
    }

    // Build the projected outlines of features ahead of time, in idle slices, so the first visit to a border frame
    // only fills paths. warm(features) queues them; already-built ones are skipped.
    let warmQ = [], warmOn = false;
    const idle = global.requestIdleCallback || (fn => setTimeout(() => fn({ timeRemaining: () => 8 }), 30));
    function pathOf(f, pk) {
      let c = pathCache.get(f);
      // Projected straight into a Path2D (no SVG string to build and parse).
      if (!c || c.pk !== pk) { const p2 = new Path2D(); ctxPath.context(p2)(f); pathCache.set(f, c = { pk, p: p2 }); }
      return c.p;
    }
    function warm(feats) {
      warmQ = feats.slice();
      if (warmOn) return; warmOn = true;
      const step = dl => {
        const pk = projection.scale() + "," + projection.translate().join(",");
        while (warmQ.length && dl.timeRemaining() > 2) { const f = warmQ.pop(), c = pathCache.get(f); if (!c || c.pk !== pk) pathOf(f, pk); }
        if (warmQ.length) idle(step); else warmOn = false;
      };
      idle(step);
    }

    function render(t, o = {}) {
      const W = container.clientWidth, H = container.clientHeight; lastW = W; lastH = H;
      last = t; realmsNow = o.realms || realmsNow; if (o.mood) mood = o.mood;
      // Art pixel (i, j) covers screen x in [ox + i*PX, ox + (i+1)*PX); U0 + i is its column in the zoomed world grid.
      const ox = ((t.x % PX) + PX) % PX - PX, oy = ((t.y % PX) + PX) % PX - PX;
      U0 = Math.round((ox - t.x) / PX); V0 = Math.round((oy - t.y) / PX);
      w = Math.ceil((W - ox) / PX) + 1; h = Math.ceil((H - oy) / PX) + 1;
      canvas.width = off.width = w; canvas.height = off.height = h;
      Object.assign(canvas.style, { left: ox + "px", top: oy + "px", width: w * PX + "px", height: h * PX + "px", transform: "" });
      const sw = Math.abs(projection([180, 0])[0] - projection([-180, 0])[0]);
      const need = 360 / (sw * t.k / PX);
      const landM = maskFor([opts.land], () => "#fff");
      base = new Uint32Array(w * h); cls = new Uint8Array(w * h).fill(255);
      hs = new Uint8Array(w * h); band = new Uint8Array(w * h); NEED = need; lowNoise = new Float32Array(w * h); latA = new Float32Array(w * h); lonA = new Float32Array(w * h);
      // Inverse projection on a coarse grid, interpolated inside cells whose corners are all on the globe and do not
      // straddle the antimeridian; exact per pixel elsewhere (near the rim). Much cheaper than inverting every pixel.
      const G = 4, gw = Math.ceil(w / G) + 1, gh = Math.ceil(h / G) + 1, gl = new Float64Array(gw * gh * 2), gok = new Uint8Array(gw * gh);
      const inv = (i, j, outA, o) => {
        const px = ((U0 + i + 0.5) * PX) / t.k, py = ((V0 + j + 0.5) * PX) / t.k;
        const ll = projection.invert([px, py]);
        if (!ll || !isFinite(ll[0]) || Math.abs(ll[0]) > 180 || Math.abs(ll[1]) > 90) return 0;
        const back = projection(ll);
        if (!back || Math.abs(back[0] - px) > 0.5 || Math.abs(back[1] - py) > 0.5) return 0;
        outA[o] = ll[0]; outA[o + 1] = ll[1]; return 1;
      };
      for (let gj = 0; gj < gh; gj++) for (let gi = 0; gi < gw; gi++) gok[gj * gw + gi] = inv(gi * G, gj * G, gl, (gj * gw + gi) * 2);
      const ll = [0, 0];
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const k = j * w + i, u = U0 + i, v = V0 + j;
        const gi = (i / G) | 0, gj = (j / G) | 0, a = gj * gw + gi, b = a + 1, c2 = a + gw, d2 = c2 + 1;
        if (gok[a] && gok[b] && gok[c2] && gok[d2] && Math.abs(gl[a * 2] - gl[b * 2]) < 90 && Math.abs(gl[a * 2] - gl[d2 * 2]) < 90) {
          const fx = (i - gi * G) / G, fy = (j - gj * G) / G;
          for (let q = 0; q < 2; q++) {
            const top = gl[a * 2 + q] + (gl[b * 2 + q] - gl[a * 2 + q]) * fx, bot = gl[c2 * 2 + q] + (gl[d2 * 2 + q] - gl[c2 * 2 + q]) * fx;
            ll[q] = top + (bot - top) * fy;
          }
        } else if (!inv(i, j, ll, 0)) { base[k] = OUTP; continue; }
        const s = sample(ll[0], ll[1], need, u, v) || [10, 128, 0];
        let c = s[0]; const s1 = s[1], s2 = s[2];
        // Rivers stay thin lines when zoomed past the data: only the unjittered cell counts.
        if (c === 4 && sample(ll[0], ll[1], need, u, v, true)[0] !== 4) c = 10;
        const isLand = landM[k * 4 + 3] > 127;
        // Rasterised rivers only once zoomed in far enough that a cell is about a pixel; vector lines cover the rest.
        if (c === 4 && (need > 0.1 || !isLand)) c = 10;
        if (isLand && WATER(c) && c !== 3) c = 10;
        if (!isLand && !WATER(c)) c = 2;
        cls[k] = c; hs[k] = s1; band[k] = s2;
        latA[k] = ll[1]; lonA[k] = ll[0];
        lowNoise[k] = Math.sin(ll[0] * 1.7 + Math.sin(ll[1] * 2.3)) * Math.sin(ll[1] * 2.1 + ll[0] * 0.6);
      }
      // Base colours: three tones per class, picked by hillshade (land) or depth (sea), with a world-anchored Bayer dither.
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const k = j * w + i, c = cls[k]; if (c === 255) continue;
        if (c === 4) { base[k] = RIVER[0]; continue; }
        const d = BAYER[((V0 + j) & 3) * 4 + ((U0 + i) & 3)];
        let tone;
        if (c <= 2) tone = c === 2 ? (band[k] < 1 ? 2 : 1) : 1 + Math.round(d * 0.8 - (band[k] - 60) / 120);
        else tone = 1 + Math.round((hs[k] - 128) / 34 + d * 0.9 + (c >= 6 && c <= 14 ? lowNoise[k] * 0.55 : 0));
        const tt = Math.max(0, Math.min(2, tone));
        // Winter: snow down to a wavering snowline (lower inland and in the north), lakes freeze.
        if (mood === "winter" && c >= 3 && c !== 4 && Math.abs(latA[k]) > snowLine(k) + d * 2.5) base[k] = TP[5][c >= 15 ? tt : Math.min(2, tt + 1)];
        else base[k] = TP[c][tt];
      }
      // Shorelines: a ring of foam in the water and a lighter rim in the shallows; beach pixels on low coasts.
      const isW = k => cls[k] <= 2, isL = k => cls[k] >= 4 && cls[k] !== 255;
      const near = (k, f) => f(k - 1) || f(k + 1) || f(k - w) || f(k + w);
      const ring = new Uint8Array(w * h);
      for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
        const k = j * w + i;
        if (isW(k) && near(k, isL)) { base[k] = FOAM; ring[k] = 1; }
        else if (isL(k) && near(k, isW) && cls[k] >= 10 && cls[k] <= 12) base[k] = pack(mix(BEACH, T[cls[k]][2], 0.25));
      }
      for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
        const k = j * w + i;
        if (isW(k) && !ring[k] && near(k, q => ring[q] === 1) && ((U0 + i + V0 + j) & 1)) base[k] = FOAM2;
      }
      // Rim of the world: one ink pixel where the sphere meets the paper.
      for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
        const k = j * w + i; if (cls[k] !== 255) continue;
        if (cls[k - 1] !== 255 || cls[k + 1] !== 255 || cls[k - w] !== 255 || cls[k + w] !== 255) base[k] = RIM;
      }
      drawRivers(t, need);
      stamps();
      terrain = base.slice();
      realmRaster.clear();
      applyRealms();
      realmsDone();
    }

    function snowLine(k) { return 47 + lowNoise[k] * 4 - Math.max(0, band[k] - 20) * 0.06; }
    function setPx(i, j, col) { if (i >= 0 && j >= 0 && i < w && j < h) base[j * w + i] = col; }
    function line(x0, y0, x1, y1, col, k) {
      x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let e = dx + dy, n = 0;
      for (;;) {
        const q = y0 * w + x0;
        if (x0 >= 0 && y0 >= 0 && x0 < w && y0 < h && cls[q] >= 4 && cls[q] !== 255) { base[q] = col; if (k) cls[q] = 4; }
        if (x0 === x1 && y0 === y1 || ++n > 4000) break;
        const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; }
      }
    }
    // Rivers as 1-pixel lines (2 for the great rivers when zoomed in), more of them as you zoom.
    function drawRivers(t, need) {
      const maxRank = need > 0.35 ? 3 : need > 0.15 ? 5 : need > 0.06 ? 7 : 9;
      for (const r of opts.rivers || []) {
        if (r.rank > maxRank) continue;
        let prev = null;
        for (const ll of r.line) {
          const p = projection(ll); if (!p) { prev = null; continue; }
          const q = [Math.floor((p[0] * t.k) / PX) - U0, Math.floor((p[1] * t.k) / PX) - V0];
          if (prev) {
            line(prev[0], prev[1], q[0], q[1], RIVER[0], true);
            if (r.rank <= 2 && need < 0.05) line(prev[0] + 1, prev[1], q[0] + 1, q[1], RIVER[1], true);
          }
          prev = q;
        }
      }
    }

    // Little bits of art anchored to the world grid: trees, peaks, hills, dunes, grass tufts and waves.
    const TREE = {
      7: ["..a..", ".aab.", ".aab.", "aaabb", "..t.."],
      8: [".aab.", "aaabb", "aabbb", ".abb.", "..t.."],
      9: [".ab.ab.", "aaabbbb", "aabbbbb", ".abbbb.", "...t..."],
    };
    const PEAK_S = ["..o..", ".lad.", "laadd"];
    const SNOW_S = ["..o..", ".wsd.", "laadd"];
    const PEAK = ["......o......", ".....olo.....", "....ollao....", "...ollaado...", "..ollaaaddo..", ".ollaaaadddo.", "ollaaaaaddddo"];
    const SNOW = ["......o......", ".....owo.....", "....owwso....", "...owwssdo...", "..ollwaaddo..", ".ollaaaadddo.", "ollaaaaaddddo"];
    const PEAK_M = ["....o....", "...olao..", "..ollado.", ".ollaaddo", "ollaaaddo"];
    const SNOW_M = ["....o....", "...owso..", "..owwsdo.", ".ollaaddo", "ollaaaddo"];
    const HILL_S = [".lab.", "llaab"];
    const HILL = ["..lla..", ".llaab.", "llaaabb"];
    function stamp(i, j, rows, col) {
      const hgt = rows.length, wid = rows[0].length;
      for (let y = 0; y < hgt; y++) for (let x = 0; x < wid; x++) {
        const ch = rows[y][x]; if (ch === ".") continue;
        const c = col[ch]; if (c == null) continue;
        const ii = i + x - (wid >> 1), jj = j + y - hgt + 1, q = jj * w + ii;
        if (ii < 0 || jj < 0 || ii >= w || jj >= h || cls[q] === 255 || cls[q] <= 3) continue;
        base[q] = c;
      }
    }
    let NEED = 1, mood = opts.mood || "day";
    function stamps() {
      const ink = pack(rgb("#3a3028")), trunk = pack(rgb("#3e2a1a")), snow = pack(rgb("#fbfaf4")), snow2 = pack(rgb("#c8d0d8"));
      const big = NEED < 0.09;
      const mu = big ? 10 : 5, mv = big ? 5 : 3;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const u = U0 + i, v = V0 + j, k = j * w + i;
        const c = cls[k], r = hash(u, v);
        const row = Math.floor(v / mv), stag = (row & 1) * (mu >> 1);
        if (FOREST(c) && (u % 3 === 0) && ((v + (u % 6 ? 2 : 0)) % 4 === 0) && r < 0.85) {
          const tn = TP[c];
          stamp(i + (r < 0.4 ? 1 : 0), j, TREE[c], { a: tn[2], b: tn[0], t: trunk });
        } else if (c === 12 && u % 7 === 0 && v % 3 === 0 && r < 0.6) {
          const tn = TP[12]; stamp(i, j, ["..ll.", "aa..a"], { l: tn[2], a: tn[0] });
        } else if ((c === 10 || c === 11 || c === 6) && r < 0.05) {
          stamp(i, j, ["a.a"], { a: TP[c][0] });
        } else if (c === 14 && r < 0.12) {
          stamp(i, j, ["a.a.a"], { a: pack(rgb("#4a8a9a")) });
        }
      }
      // Peaks and hills: one jittered candidate per world-anchored cell, drawn back to front, sized by height.
      const c0 = Math.floor(U0 / mu) - 2, c1 = Math.ceil((U0 + w) / mu) + 2, r0 = Math.floor(V0 / mv) - 1, r1 = Math.ceil((V0 + h) / mv) + 8;
      for (let cv = r0; cv < r1; cv++) for (let cu = c0; cu < c1; cu++) {
        const r = hash(cu * 7 + 3, cv * 13 + 5), r2 = hash(cv * 5 + 1, cu * 11 + 7);
        const u = cu * mu + Math.floor(r * mu), v = cv * mv + Math.floor(r2 * mv), i = u - U0, j = v - V0;
        if (i < 0 || j < 0 || i >= w || j >= h) continue;
        const k = j * w + i, c = cls[k];
        if (c === 16 || c === 17) {
          // High flat plateaus (Tibet, the Altiplano) read as uplands, not a sea of peaks.
          if (hash(u, v) > (Math.abs(hs[k] - 128) < 7 && c === 16 ? 0.3 : 0.88)) continue;
          const tn = TP[16], snowy = c === 17 || (big && band[k] > 110);
          const shape = !big ? (snowy ? SNOW_S : PEAK_S) : (band[k] > 90 || c === 17) ? (snowy ? SNOW : PEAK) : (snowy ? SNOW_M : PEAK_M);
          stamp(i, j, shape, { o: ink, l: tn[2], a: tn[1], d: tn[0], w: snow, s: snow2 });
        } else if (c === 15 && hash(u, v) < 0.7) {
          const tn = TP[15]; stamp(i, j, big ? HILL : HILL_S, { l: tn[2], a: tn[1], b: tn[0] });
        }
      }
    }

    // Realm rasters are kept per border frame (the realms array) for the current view, so scrubbing back and forth
    // through years that share a frame, or revisiting one, only copies a buffer. Cleared by render() (new view).
    const realmRaster = new Map(), RASTER_MAX = 16, NONE = [];
    // The zoom detail's "under" pass (fields) sits beneath the realm tints, so it is part of the cached raster: a hit
    // must also match the detail key (it changes by decade, not by year).
    function applyRealms() {
      const hit = realmRaster.get(realmsNow), dk = detail("key") || "";
      if (hit && hit.dk === dk) { base.set(hit.base); ids = hit.ids; realmRaster.delete(realmsNow); realmRaster.set(realmsNow, hit); return; }
      base.set(terrain); detail("under"); drawRealms();
      realmRaster.delete(realmsNow);
      realmRaster.set(realmsNow, { base: base.slice(), ids, dk });
      if (realmRaster.size > RASTER_MAX) realmRaster.delete(realmRaster.keys().next().value);
    }
    // The one place where realms are done and sprites come next (year-dependent passes over base go here).
    function realmsDone() { detail("over"); paint(); }
    function detail(phase) {
      if (!detailFn || !last) return;
      try { return detailFn({ w, h, U0, V0, PX, k: last.k, need: NEED, base, cls, hs, band, lonA, latA, lowNoise, ids, realms: realmsNow, hash, toPixel: (lon, lat) => { const p = projection([lon, lat]); return p && [Math.floor((p[0] * last.k) / PX) - U0, Math.floor((p[1] * last.k) / PX) - V0]; } }, phase); }
      catch (err) { console.error("pixel detail", err); }
    }

    // Realms: rasterise polygons to an id buffer at art-pixel size, tint the land, and draw borders where ids change.
    function drawRealms() {
      if (!realmsNow.length) { ids = null; return; }
      const enc = i => { const n = i + 1; return `rgb(${n & 255},${(n >> 8) & 255},${(n * 97 + 31) & 255})`; };
      const d = maskFor(realmsNow.map(r => r.feature), (f, i) => enc(i));
      ids = new Int32Array(w * h);
      for (let k = 0; k < w * h; k++) {
        const a = d[k * 4 + 3]; if (a < 250) { ids[k] = a > 0 ? -1 : 0; continue; }
        const n = d[k * 4] | d[k * 4 + 1] << 8;
        ids[k] = n && ((n * 97 + 31) & 255) === d[k * 4 + 2] && n <= realmsNow.length ? n : -1;
      }
      // Anti-aliased edge pixels take the id of a clean neighbour.
      for (let k = 0; k < w * h; k++) if (ids[k] === -1) ids[k] = ids[k - 1] > 0 ? ids[k - 1] : ids[k - w] > 0 ? ids[k - w] : 0;
      const tint = realmsNow.map(r => rgb(r.color));
      const view = new Uint8Array(base.buffer);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const k = j * w + i, n = ids[k]; if (!n || cls[k] <= 2 || cls[k] === 255) continue;
        const o = k * 4, tc = tint[n - 1];
        const edge = (i + 1 < w && ids[k + 1] !== n && !(cls[k + 1] <= 2)) || (j + 1 < h && ids[k + w] !== n && !(cls[k + w] <= 2)) ||
          (i > 0 && ids[k - 1] !== n && !(cls[k - 1] <= 2)) || (j > 0 && ids[k - w] !== n && !(cls[k - w] <= 2));
        if (edge) { const e = mix(tc, [30, 22, 18], 0.45); view[o] = e[0]; view[o + 1] = e[1]; view[o + 2] = e[2]; continue; }
        const inner = (i + 2 < w && ids[k + 2] !== n) || (j + 2 < h && ids[k + 2 * w] !== n) || (i > 1 && ids[k - 2] !== n) || (j > 1 && ids[k - 2 * w] !== n);
        const a = inner ? 0.5 : 0.17;
        view[o] = view[o] + (tc[0] - view[o]) * a; view[o + 1] = view[o + 1] + (tc[1] - view[o + 1]) * a; view[o + 2] = view[o + 2] + (tc[2] - view[o + 2]) * a;
      }
    }

    // Sprites are painted into the same pixel grid so they share its crispness.
    const spriteCache = {};
    function spritePixels(name, team, f, night, flip) {
      const key = name + "|" + (team || "") + "|" + f + (night ? "|n" : "") + (flip ? "|f" : "");
      if (spriteCache[key]) return spriteCache[key];
      const S = (global.PIXEL_SPRITES || {})[name]; if (!S) return null;
      const fr = S.frames[f % S.frames.length];
      const tc = team ? rgb(team) : C.r, td = mix(tc, [20, 16, 14], 0.4);
      const px = [];
      fr.forEach((row, y) => [...row].forEach((ch, x) => {
        if (ch === ".") return;
        let c = ch === "x" ? tc : ch === "X" ? td : C[ch]; if (!c) return;
        if (night) c = "wWyog".includes(ch) && name.startsWith("city") ? (ch === "W" ? [232, 150, 60] : [255, 214, 110]) : NIGHT_RGB(c);
        px.push(flip ? S.ax - x : x - S.ax, y - S.ay, pack(c));
      }));
      return spriteCache[key] = px;
    }
    // Declutter: when sprites carry a priority (pri), keep the most important ones that fit without touching,
    // up to max; sprites sharing a grp (a battle's two armies and clash) are kept or dropped together.
    let spriteOpts = {}, spriteMask = null, overlay = null;
    function declutter(src, t) {
      if (!src.some(s => s.pri != null)) return src;
      const pad = spriteOpts.pad == null ? 2 : spriteOpts.pad, max = spriteOpts.max || Infinity, groups = new Map();
      src.forEach((s, n) => {
        const S = (global.PIXEL_SPRITES || {})[s.sprite], p = S && projection([s.lon, s.lat]); if (!p) return;
        const i0 = Math.floor((p[0] * t.k) / PX) - U0 + (s.dx || 0), j0 = Math.floor((p[1] * t.k) / PX) - V0 + (s.dy || 0);
        const hw = Math.max(S.ax, S.w - 1 - S.ax), b = [i0 - hw, j0 - S.ay, i0 + hw, j0 + S.h - 1 - S.ay];
        const key = s.grp || n, g = groups.get(key);
        if (!g) groups.set(key, { pri: s.pri || 0, n, b, items: [s] });
        else { g.items.push(s); g.pri = Math.max(g.pri, s.pri || 0); g.b = [Math.min(g.b[0], b[0]), Math.min(g.b[1], b[1]), Math.max(g.b[2], b[2]), Math.max(g.b[3], b[3])]; }
      });
      const kept = [], keep = new Set();
      for (const g of [...groups.values()].sort((a, b) => b.pri - a.pri || a.n - b.n)) {
        const b = g.b;
        if (b[2] < 0 || b[3] < 0 || b[0] >= w || b[1] >= h) continue;
        if (kept.length >= max) break;
        if (kept.some(o => b[0] - pad <= o[2] && b[2] + pad >= o[0] && b[1] - pad <= o[3] && b[3] + pad >= o[1])) continue;
        kept.push(b); for (const s of g.items) keep.add(s);
      }
      return src.filter(s => keep.has(s));
    }
    function paint() {
      if (!base) return;
      const list = declutter(allSprites, last);
      const img = ctx.createImageData(w, h), out = new Uint32Array(img.data.buffer);
      out.set(base);
      // Water shimmer: a few world-anchored wave glints that move with the frame.
      const glint = pack(rgb("#8ab8c4"));
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const k = j * w + i, c = cls[k]; if (c > 1) continue;
        const u = U0 + i, v = V0 + j;
        if (v % 5 === 0 && hash(u >> 2, v) < 0.035 && ((u + frame) & 3) < 2) out[k] = glint;
      }
      const t = last, view = new Uint8Array(out.buffer);
      const M = MOODS[mood];
      if (M) for (let o = 0; o < view.length; o += 4) M(view, o);
      const night = mood === "night";
      // Night: settlements glow, a dithered warm halo sized by the town.
      if (night) for (const s of list) {
        const R = glowOf(s.sprite); if (!R) continue;
        const p = projection([s.lon, s.lat]); if (!p) continue;
        const ci = Math.floor((p[0] * t.k) / PX) - U0, cj = Math.floor((p[1] * t.k) / PX) - V0 - 4;
        for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
          const i = ci + di, j = cj + dj, dd = Math.sqrt(di * di + dj * dj) / R;
          if (i < 0 || j < 0 || i >= w || j >= h || dd > 1) continue;
          const f = Math.pow(1 - dd, 1.6);
          if (BAYER[((V0 + j) & 3) * 4 + ((U0 + i) & 3)] + 0.47 < f * 1.3) {
            const o = (j * w + i) * 4, a = Math.min(0.85, 0.75 * f + 0.12);
            view[o] += (255 - view[o]) * a; view[o + 1] += (192 - view[o + 1]) * a; view[o + 2] += (104 - view[o + 2]) * a * 0.6;
          }
        }
      }
      // spriteMask marks the pixels sprites cover, so an overlay can skip a mark a sprite already stands for.
      if (!spriteMask || spriteMask.length !== w * h) spriteMask = new Uint8Array(w * h); else spriteMask.fill(0);
      for (const s of list) {
        const p = projection([s.lon, s.lat]); if (!p) continue;
        const i0 = Math.floor((p[0] * t.k) / PX) - U0 + (s.dx || 0), j0 = Math.floor((p[1] * t.k) / PX) - V0 + (s.dy || 0);
        const px = spritePixels(s.sprite, s.team, (s.frame || 0) + frame, night, s.flip); if (!px) continue;
        for (let q = 0; q < px.length; q += 3) {
          const i = i0 + px[q], j = j0 + px[q + 1];
          if (i >= 0 && j >= 0 && i < w && j < h) { out[j * w + i] = px[q + 2]; spriteMask[j * w + i] = 1; }
        }
      }
      if (overlay) try {
        overlay({ out, w, h, px: PX, frame, night, sprite: spriteMask, cls,
          // Projected (pre-zoom) coordinates to this frame's art pixel, as floats.
          at: (x, y) => [(x * t.k) / PX - U0, (y * t.k) / PX - V0] });
      } catch (err) { console.error("pixel overlay", err); }
      ctx.putImageData(img, 0, 0);
    }

    return {
      canvas,
      render,
      warm,
      move(t) { if (!last) return; const s = t.k / last.k; canvas.style.transform = `translate(${t.x - last.x * s}px,${t.y - last.y * s}px) scale(${s})`; canvas.style.transformOrigin = `${-parseFloat(canvas.style.left)}px ${-parseFloat(canvas.style.top)}px`; },
      sprites(l, o) { allSprites = l; spriteOpts = o || {}; paint(); },
      // A new year with the same view: keep the terrain pass, redo only realms and sprites.
      setRealms(r) { realmsNow = r || NONE; if (!terrain) return; applyRealms(); realmsDone(); },
      // Is the last render for this transform (so a year change can use setRealms)?
      same(t) { return !!last && !!terrain && t.k === last.k && t.x === last.x && t.y === last.y && lastW === container.clientWidth && lastH === container.clientHeight; },
      setMood(m) { const re = (m === "winter") !== (mood === "winter"); mood = m; if (re && last) render(last); else paint(); },
      tick() { frame++; paint(); },
      overlay(fn) { overlay = fn; },
      repaint() { paint(); },
      setDetail(fn) { detailFn = fn; },
      setFrame(f) { frame = f; },
      // Is this lon/lat drawn as water right now (from the last render)?
      isWater(lon, lat) { if (!cls || !last) return false; const q = this.toPixel(lon, lat); if (!q || q[0] < 0 || q[1] < 0 || q[0] >= w || q[1] >= h) return false; return cls[q[1] * w + q[0]] <= 2; },
      // Which realm is drawn under a screen point (for hover and click), from the id buffer.
      realmAt(sx, sy) { if (!ids || !last) return null; const i = Math.floor((sx - parseFloat(canvas.style.left)) / PX), j = Math.floor((sy - parseFloat(canvas.style.top)) / PX); const n = ids[j * w + i]; return n > 0 ? realmsNow[n - 1] : null; },
      toPixel(lon, lat) { const p = projection([lon, lat]); return p && [Math.floor((p[0] * last.k) / PX) - U0, Math.floor((p[1] * last.k) / PX) - V0]; },
      get size() { return { w, h, PX }; },
    };
  }
  global.PixelMap = PixelMap;
})(typeof window !== "undefined" ? window : globalThis);
