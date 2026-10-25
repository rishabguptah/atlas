// Pixel map renderer: a top-down 16-bit world map that is re-drawn from data at every zoom. See SPEC.md.
//
//   const pm = PixelMap(container, projection, { px: 3, rasters, land, rivers, palette })
//   pm.render(transform, { realms, year })   on zoom end, resize and year change (transform = d3 zoom transform)
//   pm.move(transform)                       on every zoom frame: shifts the last frame with CSS until render
//   pm.sprites(list, {max, pad}?)           [{lon, lat, sprite, frame?, team?, flip?, pri?, grp?}] drawn into the pixel grid; with pri, decluttered
//   pm.tick()                                advance sprite and water animation by one frame (call ~4 fps)
//   pm.overlay(fn) / pm.repaint()            fn(g) paints last, into the same grid (lens marks, see marks.js); repaint redraws
//   pm.setEra(style, {quiet?})               era map style from eras.js (null = today's look): grades the cached raster, draws the frame, ~400 ms dither crossfade
//   pm.setDetail(fn)                         fn(G, phase) draws zoom detail into the grid: "under" before realm tints, "over" after; "key" names the under pass (see detail.js)
//   pm.labelGrid()                           realm id and terrain class per art pixel of the last frame (for realm names)
//   pm.spriteBoxes()                         screen boxes of the prioritised sprites last painted (labels keep off them)
//   pm.underlay(fn)                          fn(g) paints after the terrain and realms, before the sprites (choropleths, grammar.js)
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
    const C = Object.fromEntries(Object.entries(PAL.KEYS).map(([k, v]) => [k, rgb(v)]));
    const OUT = rgb(opts.outside || "#efe6cc"), OUTP = pack(OUT), RIM = pack(rgb("#2a2420"));
    const canvas = document.createElement("canvas");
    canvas.className = "pixelmap";
    Object.assign(canvas.style, { position: "absolute", left: 0, top: 0, imageRendering: "pixelated", transformOrigin: "0 0", pointerEvents: "none" });
    container.prepend(canvas);
    const ctx = canvas.getContext("2d");
    const off = document.createElement("canvas"), octx = off.getContext("2d", { willReadFrequently: true });
    let lastW = 0, lastH = 0, terrain = null, last = null, base = null, cls = null, hs = null, band = null, lowNoise = null, latA = null, lonA = null, elevA = null, riv = null, anim = null, art = null, detailFn = null, ids = null, w = 0, h = 0, U0 = 0, V0 = 0, frame = 0, allSprites = [], realmsNow = [];

    // Terrain tiles: levels coarse to fine, each {cell (degrees), tdeg (tile size in degrees), url(col, row)}.
    // Tiles load on demand; until a finer tile arrives the coarser level shows, then the map re-renders.
    const levels = opts.levels || [], tiles = {};
    let pending = 0, onTile = null;
    function tile(L, li, col, row) {
      const key = li * 100000 + col * 100 + row, t = tiles[key];
      if (t) return t.data ? t : null;
      const rec = tiles[key] = { x0: -180 + col * L.tdeg, y0: 90 - row * L.tdeg, cell: L.cell };
      const img = new Image(); pending++;
      img.onload = () => { rec.img = img; decode(rec); pending--; tileVer++; clearTimeout(onTile); onTile = setTimeout(() => last && render(last), 60); };
      img.onerror = () => { pending--; rec.data = null; rec.failed = true; };
      img.src = L.url(col, row);
      return null;
    }
    const OUT3 = [0, 0, 0, 0];
    // Warp noise for class edges (see sample), baked as tiles per zoom scale.
    const warpTiles = new Map();
    function warpFor(cp) {
      const sc = Math.max(2, Math.round(cp * 1.3)), sm = Math.max(2, Math.round(cp * 0.42));
      let t = warpTiles.get(sc + "," + sm);
      if (!t) { const NT = global.PixelTerrainArt.noiseTile; t = [NT(sc, sc, 5, 1), NT(sc, sc, 5, 2), NT(sm, sm, 9, 3), NT(sm, sm, 9, 4)]; warpTiles.set(sc + "," + sm, t); }
      return t;
    }
    // OUT3: [class, hillshade, elevation band, elevation in metres (float)].
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
      // Zoomed past the data, class edges are warped by smooth noise about a cell wide, so they read as organic
      // shapes rather than blocks or speckle; light and elevation are interpolated so slopes stay smooth.
      const fx = (lon - r.x0) / r.cell, fy = (r.y0 - lat) / r.cell, cp = r.cell / need;
      let wx = 0, wy = 0;
      if (!exact && cp > 1.2) {
        const W = warpFor(cp);
        wx = (W[0](u, v) - 0.5) * 1.5 + (W[2](u, v) - 0.5) * 0.5;
        wy = (W[1](u, v) - 0.5) * 1.5 + (W[3](u, v) - 0.5) * 0.5;
      }
      const x = Math.min(r.w - 1, Math.max(0, Math.floor(fx + wx))), y = Math.min(r.h - 1, Math.max(0, Math.floor(fy + wy)));
      const i = (y * r.w + x) * 4, D = r.data;
      OUT3[0] = D[i];
      if (cp > 1.2 && !exact) {
        const x0 = Math.min(r.w - 2, Math.max(0, Math.floor(fx - 0.5))), y0 = Math.min(r.h - 2, Math.max(0, Math.floor(fy - 0.5)));
        const ax = Math.min(1, Math.max(0, fx - 0.5 - x0)), ay = Math.min(1, Math.max(0, fy - 0.5 - y0)), q = (y0 * r.w + x0) * 4, q2 = q + r.w * 4;
        for (let ch = 1; ch < 3; ch++) {
          const t = D[q + ch] + (D[q + 4 + ch] - D[q + ch]) * ax, b = D[q2 + ch] + (D[q2 + 4 + ch] - D[q2 + ch]) * ax;
          OUT3[ch] = t + (b - t) * ay;
        }
      } else { OUT3[1] = D[i + 1]; OUT3[2] = D[i + 2]; }
      OUT3[3] = OUT3[2] * 25; OUT3[1] = Math.round(OUT3[1]); OUT3[2] = Math.round(OUT3[2]);
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
    let warmQ = [], warmOn = false, fadeTimer = 0;
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

    // The terrain of the current region (U0, V0, w, h): classes, rivers, then the terrain art (terrain-art.js) and the rim.
    function terrainPass(t, need) {
      const landM = maskFor([opts.land], () => "#fff");
      base = new Uint32Array(w * h); cls = new Uint8Array(w * h).fill(255);
      hs = new Uint8Array(w * h); band = new Uint8Array(w * h); NEED = need; lowNoise = new Float32Array(w * h); latA = new Float32Array(w * h); lonA = new Float32Array(w * h); elevA = new Float32Array(w * h);
      // Inverse projection on a coarse grid, interpolated inside cells whose corners are all on the globe and do not
      // straddle the antimeridian; exact per pixel elsewhere (near the rim). Much cheaper than inverting every pixel.
      // The grid is anchored to the world (every G-th art column and row), so any region of the same view interpolates
      // exactly the same longitude and latitude for a given art pixel.
      const G = 8, gU = Math.floor(U0 / G), gV = Math.floor(V0 / G), gw = Math.floor((U0 + w - 1) / G) - gU + 2, gh = Math.floor((V0 + h - 1) / G) - gV + 2;
      const gl = new Float64Array(gw * gh * 2), gok = new Uint8Array(gw * gh);
      const inv = (i, j, outA, o) => {
        const px = ((U0 + i + 0.5) * PX) / t.k, py = ((V0 + j + 0.5) * PX) / t.k;
        const ll = projection.invert([px, py]);
        if (!ll || !isFinite(ll[0]) || Math.abs(ll[0]) > 180 || Math.abs(ll[1]) > 90) return 0;
        const back = projection(ll);
        if (!back || Math.abs(back[0] - px) > 0.5 || Math.abs(back[1] - py) > 0.5) return 0;
        outA[o] = ll[0]; outA[o + 1] = ll[1]; return 1;
      };
      for (let gj = 0; gj < gh; gj++) for (let gi = 0; gi < gw; gi++) gok[gj * gw + gi] = inv((gU + gi) * G - U0, (gV + gj) * G - V0, gl, (gj * gw + gi) * 2);
      // A cell whose 4x4 surrounding grid points are all off the globe is paper: no exact inversion there (inverting
      // off-globe points is the slow path of the projection, and most of a world view is paper).
      const paper = new Uint8Array(gw * gh);
      for (let gj = 1; gj < gh - 2; gj++) for (let gi = 1; gi < gw - 2; gi++) {
        let any = 0;
        for (let y = -1; y <= 2 && !any; y++) for (let x = -1; x <= 2; x++) if (gok[(gj + y) * gw + gi + x]) { any = 1; break; }
        paper[gj * gw + gi] = !any;
      }
      const ll = [0, 0];
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const k = j * w + i, u = U0 + i, v = V0 + j;
        const gi = Math.floor(u / G) - gU, gj = Math.floor(v / G) - gV, a = gj * gw + gi, b = a + 1, c2 = a + gw, d2 = c2 + 1;
        if (paper[a]) { base[k] = OUTP; continue; }
        if (gok[a] && gok[b] && gok[c2] && gok[d2] && Math.abs(gl[a * 2] - gl[b * 2]) < 90 && Math.abs(gl[a * 2] - gl[d2 * 2]) < 90) {
          const fx = (u - (gU + gi) * G) / G, fy = (v - (gV + gj) * G) / G;
          for (let q = 0; q < 2; q++) {
            const top = gl[a * 2 + q] + (gl[b * 2 + q] - gl[a * 2 + q]) * fx, bot = gl[c2 * 2 + q] + (gl[d2 * 2 + q] - gl[c2 * 2 + q]) * fx;
            ll[q] = top + (bot - top) * fy;
          }
        } else if (!inv(i, j, ll, 0)) { base[k] = OUTP; continue; }
        const s = sample(ll[0], ll[1], need, u, v) || [10, 128, 0];
        let c = s[0]; const s1 = s[1], s2 = s[2], s3 = s[3];
        // Rivers stay thin lines when zoomed past the data: only the unjittered cell counts.
        if (c === 4 && sample(ll[0], ll[1], need, u, v, true)[0] !== 4) c = 10;
        const isLand = landM[k * 4 + 3] > 127;
        // Rasterised rivers only once zoomed in far enough that a cell is about a pixel; vector lines cover the rest.
        if (c === 4 && (need > 0.1 || !isLand)) c = 10;
        if (isLand && WATER(c) && c !== 3) c = 10;
        if (!isLand && !WATER(c)) c = 2;
        cls[k] = c; hs[k] = s1; band[k] = s2;
        latA[k] = ll[1]; lonA[k] = ll[0]; elevA[k] = s3;
        lowNoise[k] = Math.sin(ll[0] * 1.7 + Math.sin(ll[1] * 2.3)) * Math.sin(ll[1] * 2.1 + ll[0] * 0.6);
      }
      // Rivers first (they mark cls 4 and riv), then the terrain art paints every pixel from the classes (terrain-art.js).
      riv = new Uint8Array(w * h);
      drawRivers(t, need);
      art = global.PixelTerrainArt.paint({ w, h, U0, V0, need, cls, hs, band, elev: elevA, latA, lonA, riv, base, mood,
        l0: tiles[0] && tiles[0].data ? tiles[0] : null, toPx: (lon, lat) => { const p = projection([lon, lat]); return p && [Math.floor((p[0] * t.k) / PX) - U0, Math.floor((p[1] * t.k) / PX) - V0]; } });
      anim = art.anim;
      // Rim of the world: one ink pixel where the sphere meets the paper.
      for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
        const k = j * w + i; if (cls[k] !== 255) continue;
        if (cls[k - 1] !== 255 || cls[k + 1] !== 255 || cls[k - w] !== 255 || cls[k + w] !== 255) base[k] = RIM;
      }
    }
    // Run terrainPass on another region of the world grid and hand back its buffers (the view's are left as they were).
    // Wide enough for the terrain art's largest world-anchored pieces (mountain cells, landmark peaks, blur, coast distance).
    const SEAM = 16;
    let prevView = null, tileVer = 0;
    function region(t, need, ru, rv, rw, rh) {
      const sv = { U0, V0, w, h, base, cls, hs, band, lowNoise, latA, lonA, elevA, riv, anim };
      U0 = ru; V0 = rv; w = rw; h = rh; off.width = rw; off.height = rh;
      terrainPass(t, need);
      const out = { U0, V0, w, h, base, cls, hs, band, lowNoise, latA, lonA, elevA, riv, anim };
      ({ U0, V0, w, h, base, cls, hs, band, lowNoise, latA, lonA, elevA, riv, anim } = sv);
      return out;
    }
    // Copy the world-grid rectangle [u0, u1) x [v0, v1) from one region's buffers into another's.
    function blit(src, dst, u0, v0, u1, v1) {
      if (u1 <= u0 || v1 <= v0) return;
      for (const key of ["base", "cls", "hs", "band", "lowNoise", "latA", "lonA", "elevA", "riv", "anim"]) {
        const S = src[key], D = dst[key];
        for (let v = v0; v < v1; v++) {
          const so = (v - src.V0) * src.w + (u0 - src.U0), dO = (v - dst.V0) * dst.w + (u0 - dst.U0);
          D.set(S.subarray(so, so + (u1 - u0)), dO);
        }
      }
    }

    function render(t, o = {}) {
      const W = container.clientWidth, H = container.clientHeight; lastW = W; lastH = H;
      last = t; realmsNow = o.realms || realmsNow; if (o.mood) mood = o.mood; rv++; fade = null;
      // Art pixel (i, j) covers screen x in [ox + i*PX, ox + (i+1)*PX); U0 + i is its column in the zoomed world grid.
      const ox = ((t.x % PX) + PX) % PX - PX, oy = ((t.y % PX) + PX) % PX - PX;
      U0 = Math.round((ox - t.x) / PX); V0 = Math.round((oy - t.y) / PX);
      w = Math.ceil((W - ox) / PX) + 1; h = Math.ceil((H - oy) / PX) + 1;
      canvas.width = w; canvas.height = h;
      Object.assign(canvas.style, { left: ox + "px", top: oy + "px", width: w * PX + "px", height: h * PX + "px", transform: "" });
      const sw = Math.abs(projection([180, 0])[0] - projection([-180, 0])[0]);
      const need = 360 / (sw * t.k / PX);
      // A pan at the same zoom keeps every art pixel it already drew (they are anchored to the world grid) and only
      // draws the newly exposed bands, each with a margin so trees, peaks and shorelines join up across the seam.
      const P = prevView, reuse = P && P.k === t.k && P.need === need && P.mood === mood && P.ver === tileVer && !o.full &&
        Math.abs(U0 - P.U0) < w && Math.abs(V0 - P.V0) < h;
      if (!reuse) { off.width = w; off.height = h; terrainPass(t, need); }
      else {
        base = new Uint32Array(w * h); cls = new Uint8Array(w * h).fill(255); hs = new Uint8Array(w * h); band = new Uint8Array(w * h);
        lowNoise = new Float32Array(w * h); latA = new Float32Array(w * h); lonA = new Float32Array(w * h); elevA = new Float32Array(w * h);
        riv = new Uint8Array(w * h); anim = new Uint8Array(w * h);
        const view = { U0, V0, w, h, base, cls, hs, band, lowNoise, latA, lonA, elevA, riv, anim };
        // The old frame's interior (its edge band may lack art anchored just outside it).
        const iu0 = P.U0 + SEAM, iv0 = P.V0 + SEAM, iu1 = P.U0 + P.w - SEAM, iv1 = P.V0 + P.h - SEAM;
        blit(P, view, Math.max(U0, iu0), Math.max(V0, iv0), Math.min(U0 + w, iu1), Math.min(V0 + h, iv1));
        // New view minus that interior: up to four bands.
        const bands = [[U0, V0, U0 + w, Math.max(V0, Math.min(V0 + h, iv0))], [U0, Math.min(V0 + h, Math.max(V0, iv1)), U0 + w, V0 + h]];
        const my0 = Math.max(V0, iv0), my1 = Math.min(V0 + h, iv1);
        if (my1 > my0) bands.push([U0, my0, Math.max(U0, Math.min(U0 + w, iu0)), my1], [Math.min(U0 + w, Math.max(U0, iu1)), my0, U0 + w, my1]);
        for (const [u0, v0, u1, v1] of bands) {
          if (u1 <= u0 || v1 <= v0) continue;
          const r = region(t, need, u0 - SEAM, v0 - SEAM, u1 - u0 + 2 * SEAM, v1 - v0 + 2 * SEAM);
          blit(r, view, u0, v0, u1, v1);
        }
        ({ U0, V0, w, h, base, cls, hs, band, lowNoise, latA, lonA, elevA, riv, anim } = view);
        off.width = w; off.height = h; art = { ...art, anim };
      }
      prevView = { k: t.k, need, mood, ver: tileVer, U0, V0, w, h, base: base.slice(), cls, hs, band, lowNoise, latA, lonA, elevA, riv, anim };
      terrain = base.slice();
      realmRaster.clear();
      applyRealms();
      realmsDone();
    }

    function setPx(i, j, col) { if (i >= 0 && j >= 0 && i < w && j < h) base[j * w + i] = col; }
    function line(x0, y0, x1, y1, col) {
      x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let e = dx + dy, n = 0;
      for (;;) {
        const q = y0 * w + x0;
        if (x0 >= 0 && y0 >= 0 && x0 < w && y0 < h && cls[q] >= 4 && cls[q] !== 255) { cls[q] = 4; riv[q] = Math.max(riv[q], col); }
        if (x0 === x1 && y0 === y1 || ++n > 4000) break;
        const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; }
      }
    }
    // Rivers as 1-pixel lines (2 for the great rivers when zoomed in), more of them as you zoom. They are projected to the
    // zoomed world grid once per zoom (pans and region passes reuse that), and segments off the region are skipped.
    let riverGrid = null;
    function drawRivers(t, need) {
      const maxRank = need > 0.35 ? 3 : need > 0.15 ? 5 : need > 0.06 ? 7 : 9;
      const pk = t.k + "|" + projection.scale() + "|" + projection.translate().join();
      if (!riverGrid || riverGrid.pk !== pk) riverGrid = { pk, lines: (opts.rivers || []).map(r => ({ rank: r.rank, pts: r.line.map(ll => { const p = projection(ll); return p ? [Math.floor((p[0] * t.k) / PX), Math.floor((p[1] * t.k) / PX)] : null; }) })) };
      for (const r of riverGrid.lines) {
        if (r.rank > maxRank) continue;
        const wide = r.rank <= 2 && need < 0.09;
        let prev = null;
        for (const g of r.pts) {
          if (!g) { prev = null; continue; }
          const q = [g[0] - U0, g[1] - V0];
          if (prev && !((prev[0] < -1 && q[0] < -1) || (prev[1] < 0 && q[1] < 0) || (prev[0] > w && q[0] > w) || (prev[1] >= h && q[1] >= h))) {
            // riv: 2 for the great rivers (a lighter channel), 1 for the rest; the great ones widen as you come in.
            line(prev[0], prev[1], q[0], q[1], r.rank <= 2 ? 2 : 1);
            if (wide) line(prev[0] + 1, prev[1], q[0] + 1, q[1], 2);
            if (r.rank <= 1 && need < 0.035) line(prev[0], prev[1] + 1, q[0], q[1] + 1, 2);
          }
          prev = q;
        }
      }
    }

    let NEED = 1, mood = opts.mood || "day";
    // Era style (eras.js): grades the cached raster per border frame and draws a frame after everything else.
    let era = opts.era || null, rv = 0, fade = null;
    // terrain: the raster before realms (terrain plus the zoom detail's under pass, which drawRealms leaves untouched
    // when an era is on); key changes whenever that raster does.
    const eraCtx = dk => ({ base, terrain: base, key: rv + "|" + dk, cls, hs, band, latA, ids, realms: realmsNow, w, h, U0, V0, PX, k: last.k, need: NEED, rv, mood, projection,
      at: (x, y) => [(x * last.k) / PX - U0, (y * last.k) / PX - V0] });

    // Realm rasters are kept per border frame (the realms array) for the current view, so scrubbing back and forth
    // through years that share a frame, or revisiting one, only copies a buffer. Cleared by render() (new view).
    const realmRaster = new Map(), RASTER_MAX = 16, NONE = [];
    // The zoom detail's "under" pass (fields) sits beneath the realm tints, so it is part of the cached raster: a hit
    // must also match the detail key (it changes by decade, not by year).
    function applyRealms() {
      const hit = realmRaster.get(realmsNow), dk = detail("key") || "";
      if (hit && hit.dk === dk) { base.set(hit.base); ids = hit.ids; realmRaster.delete(realmsNow); realmRaster.set(realmsNow, hit); return; }
      base.set(terrain); detail("under"); drawRealms();
      // An era style grades the raster (terrain plus the under detail) and draws realms its own way (eras.js).
      if (era) era.grade(eraCtx(dk));
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
      // An era style draws realms its own way from the id buffer (eras.js), so the default tint is skipped.
      if (era) return;
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
    let spriteOpts = {}, spriteMask = null, overlay = null, underlay = null, shown = [], lastOut = null;
    const GLINT = pack(rgb("#8ab8c4"));
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
      shown = list;
      const img = ctx.createImageData(w, h), out = new Uint32Array(img.data.buffer);
      out.set(base);
      // Water shimmer: a few world-anchored wave glints that move with the frame.
      const glint = era && era.glint !== undefined ? era.glint : GLINT;
      if (glint !== null) for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
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
      // Data passes (views/pixel/grammar.js): a choropleth sits under the sprites, the marks and compare go over them.
      const frameInfo = () => ({ out, w, h, px: PX, frame, night, sprite: spriteMask, cls, ids, realms: realmsNow, U0, V0, k: t.k,
        // Projected (pre-zoom) coordinates to this frame's art pixel, as floats.
        at: (x, y) => [(x * t.k) / PX - U0, (y * t.k) / PX - V0] });
      if (underlay) try { underlay(frameInfo()); } catch (err) { console.error("pixel underlay", err); }
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
      // The frame before lens marks, so era ornaments can keep clear of marks.
      const pre = era && era.over ? out.slice() : null;
      if (overlay) try { overlay(frameInfo()); } catch (err) { console.error("pixel overlay", err); }
      const vis = [Math.ceil(-parseFloat(canvas.style.left) / PX), Math.ceil(-parseFloat(canvas.style.top) / PX), Math.floor((lastW - parseFloat(canvas.style.left)) / PX) - 1, Math.floor((lastH - parseFloat(canvas.style.top)) / PX) - 1];
      if (era && era.over) try { era.over({ out, pre, w, h, px: PX, frame, vis, cls, sprite: spriteMask, U0, V0, k: t.k, projection, at: (x, y) => [(x * t.k) / PX - U0, (y * t.k) / PX - V0] }); } catch (err) { console.error("pixel era", err); }
      // Era crossfade: the old frame dissolves into the new one through an ordered-dither mask, in a few steps.
      if (fade) { if (fade.prev.length === out.length && fade.U0 === U0 && fade.V0 === V0) { const m = fade.mask, p = fade.prev, f = fade.t; for (let k = 0; k < out.length; k++) if (m[k] >= f) out[k] = p[k]; } }
      lastOut = out;
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
      // Switch era style (null = today's look): regrade, then dissolve from the old frame over about 400 ms.
      setEra(st, o = {}) {
        if ((st && st.id) === (era && era.id)) return;
        const prev = lastOut && !o.instant ? lastOut.slice() : null;
        era = st; realmRaster.clear();
        // quiet: the caller is about to re-render anyway (a new view), so no regrade and no crossfade here.
        if (!terrain || o.quiet) { fade = null; return; }
        applyRealms(); clearTimeout(fadeTimer);
        if (!prev || matchMedia("(prefers-reduced-motion: reduce)").matches) { fade = null; realmsDone(); return; }
        const mask = new Float32Array(w * h);
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const u = U0 + i, v = V0 + j; mask[j * w + i] = (BAYER[(v & 3) * 4 + (u & 3)] + 0.47) * 0.45 + hash(u >> 3, v >> 3) * 0.55; }
        fade = { prev, mask, U0, V0, t: 0.2 };
        const step = () => { if (!fade) return; fade.t += 0.2; if (fade.t > 1.01) { fade = null; paint(); return; } paint(); fadeTimer = setTimeout(step, 80); };
        paint(); fadeTimer = setTimeout(step, 80);
      },
      get era() { return era && era.id; },
      setMood(m) { const re = (m === "winter") !== (mood === "winter"); mood = m; if (re && last) render(last); else paint(); },
      tick() { frame++; paint(); },
      overlay(fn) { overlay = fn; },
      underlay(fn) { underlay = fn; },
      repaint() { paint(); },
      setDetail(fn) { detailFn = fn; },
      setFrame(f) { frame = f; },
      // Is this lon/lat drawn as water right now (from the last render)?
      isWater(lon, lat) { if (!cls || !last) return false; const q = this.toPixel(lon, lat); if (!q || q[0] < 0 || q[1] < 0 || q[0] >= w || q[1] >= h) return false; return cls[q[1] * w + q[0]] <= 2; },
      // Which realm is drawn under a screen point (for hover and click), from the id buffer.
      realmAt(sx, sy) { if (!ids || !last) return null; const i = Math.floor((sx - parseFloat(canvas.style.left)) / PX), j = Math.floor((sy - parseFloat(canvas.style.top)) / PX); const n = ids[j * w + i]; return n > 0 ? realmsNow[n - 1] : null; },
      // Screen boxes of the sprites last painted with a priority (towns, armies, landmarks), so names can keep off them.
      spriteBoxes() {
        if (!last) return [];
        const out = [], L = parseFloat(canvas.style.left), Tp = parseFloat(canvas.style.top);
        for (const s of shown) {
          if (s.pri == null || s.pri < 1) continue;
          const S = (global.PIXEL_SPRITES || {})[s.sprite], p = S && projection([s.lon, s.lat]); if (!p) continue;
          const i0 = Math.floor((p[0] * last.k) / PX) - U0 + (s.dx || 0), j0 = Math.floor((p[1] * last.k) / PX) - V0 + (s.dy || 0);
          out.push([L + (i0 - S.ax) * PX, Tp + (j0 - S.ay) * PX, L + (i0 - S.ax + S.w) * PX, Tp + (j0 - S.ay + S.h) * PX]);
        }
        return out;
      },
      // The last frame's realm ids and terrain classes per art pixel, for naming realms (realmnames.js).
      labelGrid() { return ids && last ? { ids, cls, w, h, PX, left: parseFloat(canvas.style.left), top: parseFloat(canvas.style.top), realms: realmsNow } : null; },
      toPixel(lon, lat) { const p = projection([lon, lat]); return p && [Math.floor((p[0] * last.k) / PX) - U0, Math.floor((p[1] * last.k) / PX) - V0]; },
      get size() { return { w, h, PX }; },
      // Terrain art of the last render: { anim (1 foam, 2 wave glyph, 3 river, 4 smoke), tier, ms } (terrain-art.js).
      get art() { return art; },
    };
  }
  global.PixelMap = PixelMap;
})(typeof window !== "undefined" ? window : globalThis);
