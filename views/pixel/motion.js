// Motion for the pixel map: everything that moves, on two small canvases above the map, never by repainting it.
// See SPEC.md "Motion" and the art direction (D7, D8): stepped at 10 fps in whole art pixels, palette cycling for water,
// paused while scrubbing, zooming, panning, hidden or off screen, and still (one static frame) under reduced motion.
//
//   const mo = PixelMotion(pm, el, projection, { px: 3, mapEl, source })
//   mo.year(y)               the year changed (cheap: work waits until the year settles)
//   mo.move(t)               on zoom frames: the canvases follow the map's CSS transform
//   mo.jump()                before rendering a big instant year jump: the old frame dissolves into the new one
//   mo.fly(view, ms)         a camera flight started: a pixel ping marks where it lands
//   mo.pulse(lon, lat, o)    a stepped ring ({color, r, repeat}); pulse(null) clears the repeating ones
//   mo.layer(id, fn)         fn(g) paints into the motion canvas each step (g: out, w, h, frame, at, toPixel, sprite, cls)
//   mo.onStep(fn), mo.frame  the step counter, for anything that wants to march in time
//   mo.set({sky, month, weather, motion}), mo.settings, mo.destroy()
//
// source (all optional, called when the year settles): movers() -> [{line, segs, tot, phase}], campaigns(y) -> [{a, b, team, sprite}],
// plague(y) -> [{pts, month}], emitters(y) -> [{lon, lat, kind: "battle"|"fire"|"ash"}], lights(y) -> [{lon, lat, pop}] (thousands),
// moverSprite(lon, lat, sea) -> sprite name, isOn(lens) -> bool.
(function (global) {
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
  const hash = (u, v) => { let h = (u * 374761393 + v * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const pack = (r, g, b, a = 255) => ((a & 255) << 24 | (b & 255) << 16 | (g & 255) << 8 | (r & 255)) >>> 0;
  const packH = (h, a) => { const c = rgb(h); return pack(c[0], c[1], c[2], a); };
  const R = c => c & 255, G = c => (c >>> 8) & 255, B = c => (c >>> 16) & 255;
  const mixP = (c, d, t) => pack(R(c) + (R(d) - R(c)) * t, G(c) + (G(d) - G(c)) * t, B(c) + (B(d) - B(c)) * t);
  const lum = c => (R(c) * 0.3 + G(c) * 0.55 + B(c) * 0.15) / 255;
  const TAU = Math.PI * 2, RAD = Math.PI / 180;
  // Smooth value noise in -0.5..0.5 on a world-anchored grid of cell art pixels.
  const vnoise = (u, v, cell) => {
    const x = u / cell, y = v / cell, i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy - 0.5;
  };
  const STEP = 100;          // ms per step: 10 fps
  const SETTLE = 350;        // ms of quiet after a year change or a move before the heavier passes run
  const KEY = "atlas.motion.v1";

  // Ramps lean blue-violet in shadow and warm in the light (D3).
  const SNOW = ["#8e9cb8", "#c8d2e2", "#eef0f0", "#fbfaf2"].map(h => packH(h));
  const ICE = ["#9fb4c8", "#d4e0e8", "#f2f6f4"].map(h => packH(h));
  const AUTUMN = ["#5e2a22", "#a2482a", "#d0862e", "#e4b448"].map(h => packH(h));
  const LARCH = ["#6a5a26", "#b0902e", "#dcc04a"].map(h => packH(h));
  const NIGHT = [10, 16, 44], DUSK = [255, 150, 70];
  const LIGHT = { fire: ["#ffc060", "#e07a28", "#a04818"], gas: ["#ffe08a", "#f0a040", "#b06428"], electric: ["#fff6d0", "#ffd060", "#d08a30"] };
  const PLAGUE = [packH("#8a4fa0"), packH("#c88ad8"), packH("#4e2c5c")];
  const INK = packH("#221f1a"), VELLUM = packH("#f6f0dc"), GOLD = packH("#d8a32c"), TRAIL = packH("#2a2018");
  const CLOUD = ["#8e9cbc", "#c4cede", "#eef1f2", "#fffdf2"].map(rgb), SHADOW = pack(14, 22, 48, 46);
  const RAIN = pack(150, 180, 205, 170), FLAKE = pack(250, 250, 244, 230), BOLT = packH("#fff4a8");

  const STYLE = `
.pxmo { position: absolute; left: 0; top: 0; image-rendering: pixelated; pointer-events: none; transform-origin: 0 0; }
.pxsky-btn { image-rendering: pixelated; display: block; cursor: pointer; pointer-events: auto; }
.pxsky-pop { position: absolute; right: 10px; bottom: 96px; z-index: 6; pointer-events: auto; background: #f6f0dc; color: #221f1a;
  border: 3px solid #221f1a; box-shadow: 3px 3px 0 #221f1a; padding: 9px 12px 10px; display: grid; gap: 8px; min-width: 214px;
  font-family: "Pixelify Sans", "Silkscreen", ui-monospace, monospace; font-size: 16px; }
.pxsky-pop[hidden] { display: none; }
.pxsky-pop h4 { margin: 0; font: 400 16px/1 "Silkscreen", "Pixelify Sans", monospace; letter-spacing: .04em; color: #8a6418; text-transform: uppercase; }
.pxsky-pop .opts { display: flex; flex-wrap: wrap; gap: 4px; }
.pxsky-pop button { font: inherit; font-size: 16px; line-height: 1; padding: 4px 7px; background: #f6f0dc; color: #221f1a; border: 2px solid #221f1a; cursor: pointer; }
.pxsky-pop button[aria-pressed="true"] { background: #221f1a; color: #f6f0dc; }
.pxsky-pop button:focus-visible { outline: 2px solid #d8a32c; outline-offset: 1px; }
.pxsky-pop .note { font: 15px/1.35 Spectral, Georgia, serif; color: #4a4035; max-width: 240px; }
@media (max-width: 640px) { .pxsky-pop { bottom: 70px; } }
`;
  const SKY_MODES = [["day", "Day"], ["cycle", "Day & night"], ["night", "Night lights"], ["now", "Sun now"]];
  const MONTHS = [["auto", "Auto"], ["jan", "Jan"], ["apr", "Apr"], ["jul", "Jul"], ["oct", "Oct"]];
  const MONTH_DOY = { jan: 15, apr: 105, jul: 196, oct: 288 };

  // ---------- small procedural sprites: clouds, storms ----------
  // A cumulus seen from above at an angle, the way RPG world maps draw them: a row of round bumps on a flat base.
  // Each pixel gets a tone: 1 base shadow, 2 shade, 3 body, 4 lit top-left. scale grows the cloud as you zoom in.
  function cloudShape(seed, scale) {
    const w = Math.round((18 + hash(seed, 2) * 22) * scale), base = Math.round((7 + hash(seed, 3) * 5) * scale);
    const n = 3 + Math.floor(hash(seed, 1) * 3), bumps = [];
    for (let q = 0; q < n; q++) {
      const t = (q + 0.5) / n, mid = 1 - Math.abs(t - 0.5) * 1.4;
      const r = (3 + mid * (4 + hash(seed, 10 + q) * 4)) * scale;
      bumps.push([t * w + (hash(seed, 20 + q) - 0.5) * 4 * scale, base - r * 0.35, r]);
    }
    const top = Math.floor(Math.min(...bumps.map(b => b[1] - b[2]))), H = base - top + 3, W = w + 4, m = new Uint8Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const x = i - 2, y = j + top;
      if (y > base + 1) continue;
      let best = 0;
      for (const [cx, cy, r] of bumps) {
        const dx = (x - cx) / r, dy = (y - cy) / r, d = dx * dx + dy * dy; if (d > 1) continue;
        const lit = -dx * 0.55 - dy * 0.85;
        best = Math.max(best, y >= base ? 1 : lit > 0.45 ? 4 : lit > -0.25 ? 3 : 2);
      }
      // The flat underside: a band of shade between the outermost bumps.
      if (!best && y >= base - 1 && x > bumps[0][0] - bumps[0][2] * 0.6 && x < bumps[n - 1][0] + bumps[n - 1][2] * 0.6) best = 1;
      m[j * W + i] = best;
    }
    return { w: W, h: H, m };
  }
  // A storm seen from above: spiral arms around a clear eye, 4 frames of rotation.
  function stormFrames() {
    const S = 19, c = 9, frames = [];
    for (let f = 0; f < 4; f++) {
      const m = new Uint8Array(S * S);
      for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
        const dx = i - c, dy = j - c, r = Math.hypot(dx, dy); if (r > 9.2 || r < 1.6) continue;
        const a = Math.atan2(dy, dx) + f * Math.PI / 8, arm = Math.sin(a * 2 + r * 0.62);
        if (r < 3.4) m[j * S + i] = r < 2.4 ? 0 : 3;
        else if (arm > -0.15 - (9 - r) * 0.06) m[j * S + i] = arm > 0.55 ? 4 : arm > 0.1 ? 3 : 2;
      }
      frames.push({ w: S, h: S, m });
    }
    return frames;
  }

  function PixelMotion(pm, el, projection, opts = {}) {
    const PX = opts.px || 3, mapEl = opts.mapEl || el.parentElement, src = opts.source || {};
    if (!document.getElementById("pxmo-style")) { const st = document.createElement("style"); st.id = "pxmo-style"; st.textContent = STYLE; document.head.appendChild(st); }
    const mk = cls => { const c = document.createElement("canvas"); c.className = "pxmo " + cls; return c; };
    // season: snow, sea ice, autumn (changes rarely). fx: water shimmer, ink-in, plague, actors (under the clouds).
    // sky: cloud shadows, night, lights, clouds, smoke. dis: the old frame dissolving after a year jump.
    const seas = mk("pxmo-season"), fx = mk("pxmo-fx"), sky = mk("pxmo-sky"), dis = mk("pxmo-dis");
    pm.canvas.after(seas); seas.after(fx); fx.after(sky); sky.after(dis);
    const ectx = seas.getContext("2d"), fctx = fx.getContext("2d"), sctx = sky.getContext("2d"), dctx = dis.getContext("2d");
    pm.ownWater(false);

    // ---------- settings ----------
    const reduceQ = matchMedia("(prefers-reduced-motion: reduce)");
    let settings = { sky: "day", month: "auto", weather: true, motion: null };
    try { Object.assign(settings, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { /* storage blocked: defaults */ }
    const moving = () => settings.motion != null ? settings.motion : !reduceQ.matches;

    // ---------- state ----------
    let V = null, w = 0, h = 0, fxImg = null, fxb = null, skyImg = null, skyb = null, seasonB = null, seaImg = null, animRects = [];
    let trig = null; // per-pixel sin/cos of latitude and longitude, for the sun
    let seasonDoyBuilt = null, half = 0;
    let frame = 0, clock = 0, year = null, lastChange = 0, settleTimer = 0, settled = false, dirtyWater = true;
    let water = { glint: null, foam: null, river: null };
    let nightL = null;
    let sun = null, nightB = null, nightKey = "", nightA = null;
    let lightsAll = null, lightsNow = [], lightsYear = null, lightsLoading = false;
    let movers = [], marches = [], fronts = [], emitters = [], puffs = [], pulses = [], ink = null, prevIds = null, prevRealms = null, prevKey = "";
    let clouds = [], flocks = [], storm = null, flash = 0, dissolve = 0, visible = true, timer = 0, cost = 0, slow = 0;
    const layers = new Map(), stepFns = [], STORM = stormFrames();
    // Cloud shapes per size: small at world zoom, larger as you come in.
    const SHAPES = [0.8, 1.15, 1.6].map(sc => Array.from({ length: 12 }, (_, i) => cloudShape(i * 7 + 3, sc)));

    // ---------- placement: same box as the pixel map canvas ----------
    function place() {
      const s = pm.canvas.style;
      for (const c of [seas, fx, sky]) {
        if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
        Object.assign(c.style, { left: s.left, top: s.top, width: s.width, height: s.height, transform: "", transformOrigin: s.transformOrigin });
      }
    }
    function move() {
      const s = pm.canvas.style;
      for (const c of [seas, fx, sky, dis]) { c.style.transform = s.transform; c.style.transformOrigin = s.transformOrigin; }
      lastChange = performance.now();
    }

    // ---------- clock: virtual sun and season ----------
    // "day": no night, the map's own season; "cycle": a day every 90 s and a year every 12 minutes;
    // "night": all night, lights on; "now": the real sun for this moment.
    let vt0 = performance.now(), vClock = 0;
    function sunNow() {
      const mode = settings.sky;
      let doy, utc;
      if (mode === "now") { const d = new Date(); doy = (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5; utc = d.getUTCHours() + d.getUTCMinutes() / 60; }
      else { utc = (13 + vClock / 90 * 24) % 24; doy = (172 + vClock / 720 * 365) % 365; }
      if (settings.month !== "auto") doy = MONTH_DOY[settings.month];
      const dec = 23.44 * Math.sin(TAU * (doy - 81) / 365) * RAD;
      return { doy, utc, dec, lon: (12 - utc) * 15 * RAD, night: mode === "cycle" || mode === "now" ? "sun" : mode === "night" ? "all" : null };
    }
    // Which day of the year the season layer shows: Auto in day mode keeps the map's own (summer-like) look.
    const seasonDoy = () => settings.month !== "auto" ? MONTH_DOY[settings.month] : settings.sky === "cycle" || settings.sky === "now" ? sunNow().doy : null;

    // ---------- layout: per view, after the map renders ----------
    function layout() {
      V = pm.view(); if (!V) return;
      w = V.w; h = V.h;
      fxImg = fctx.createImageData(w, h); fxb = new Uint32Array(fxImg.data.buffer);
      skyImg = sctx.createImageData(w, h); skyb = new Uint32Array(skyImg.data.buffer);
      seaImg = ectx.createImageData(w, h); trig = null; animRects = [];
      seasonB = null; seasonDoyBuilt = null; nightB = null; nightKey = ""; sun = null; prevIds = null; ink = null;
      place(); scanWater(); spawnClouds(); flocks = []; storm = null;
      dirtyWater = true; settled = false; changed();
    }

    // Water by palette cycling: lists of the pixels that shimmer, and each one's phase.
    function scanWater() {
      const { cls, U0, V0 } = V, gl = [], fo = [], rv = [];
      for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
        const k = j * w + i, c = cls[k]; if (c === 255) continue;
        const u = U0 + i, v = V0 + j;
        if (c <= 3) {
          const land = q => cls[q] >= 4 && cls[q] !== 255;
          if (land(k - 1) || land(k + 1) || land(k - w) || land(k + w)) fo.push(k, (u * 3 + v * 5) & 7);
          else if (v % 5 === 0 && hash(u >> 2, v) < (c === 0 ? 0.02 : 0.04)) gl.push(k, Math.floor(hash(u, v >> 1) * 8));
        } else if (c === 4) rv.push(k, (u + v * 2) & 7);
      }
      water = { glint: Int32Array.from(gl), foam: Int32Array.from(fo), river: Int32Array.from(rv) };
    }
    // One water step: glints twinkle, surf rolls along the coast, rivers run. Colours are lifted from what the map drew,
    // so this follows any palette; pixels a sprite or mark covers are left alone.
    function paintWater(f) {
      const { out, base } = V; if (!out) return;
      const wf = f >> 1;
      const g = water.glint; for (let n = 0; n < g.length; n += 2) { const k = g[n]; if (out[k] !== base[k]) continue; const p = (g[n + 1] + wf) & 7; if (p < 2) fxb[k] = mixP(base[k], 0xffecf0d8, p ? 0.32 : 0.55); }
      const fo = water.foam; for (let n = 0; n < fo.length; n += 2) { const k = fo[n]; if (out[k] !== base[k]) continue; const p = (fo[n + 1] + wf) & 7; if (p < 3) fxb[k] = mixP(base[k], 0xfff4f8ec, p === 1 ? 0.5 : 0.25); }
      const rv = water.river; for (let n = 0; n < rv.length; n += 2) { const k = rv[n]; if (out[k] !== base[k]) continue; if (((rv[n + 1] - wf) & 7) < 2) fxb[k] = mixP(base[k], 0xffe0d8b8, 0.35); }
    }

    // ---------- seasons: snow line, sea ice and autumn woods, each from the real hemisphere's month ----------
    function buildSeason(doy) {
      const { cls, band, lat, lon, U0, V0, base, out, ids } = V;
      seasonB = new Uint32Array(seaImg.data.buffer); seasonB.fill(0);
      const cN = Math.cos(TAU * (doy - 30) / 365);
      // Seasonal snow line (degrees from the equator) per hemisphere: about 50 in January and 74 in July in the north,
      // the same half a year later in the south. Sea ice reaches furthest in March (north) and September (south).
      const snowN = 62 - 12 * cN, snowS = 62 + 12 * cN;
      const iceN = 72 - 10 * Math.cos(TAU * (doy - 75) / 365), iceS = 66 - 7 * Math.cos(TAU * (doy - 258) / 365);
      const fallN = Math.max(0, 1 - Math.abs(doy - 290) / 40), fallS = Math.max(0, 1 - Math.abs(doy - 110) / 40);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const k = j * w + i, c = cls[k]; if (c === 255 || out && out[k] !== base[k]) continue;
        const la = lat[k], al = Math.abs(la), d = BAYER[((V0 + j) & 3) * 4 + ((U0 + i) & 3)], u = U0 + i, v = V0 + j;
        const noise = vnoise(u, v, 14) * 5 + vnoise(u, v, 5) * 1.6, lo = lon[k];
        if (c <= 3) {
          // Sea ice (and frozen lakes, which go with the snow line). The Gulf Stream keeps the North Atlantic and the
          // Barents Sea open further north; the Sea of Okhotsk freezes far south.
          const warm = la > 0 && lo > -30 && lo < 60 ? 10 : la > 0 && lo > 135 && lo < 160 ? -12 : 0;
          const line = c === 3 ? (la >= 0 ? snowN : snowS) + 3 : la >= 0 ? iceN + warm : iceS;
          const over = al + noise + d * 1.6 - line;
          if (over > 0) seasonB[k] = ICE[over > 3 ? (d > 0.5 ? 2 : 1) : d > 0.6 ? 1 : 0];
          continue;
        }
        if (c === 4 || c === 5 || c === 17) continue;
        // Europe stays milder (the Gulf Stream); the interiors of North America and East Asia freeze further south.
        const tweak = la <= 0 ? 0 : lo > -12 && lo < 45 ? 6 : (lo > 100 && lo < 145) || (lo > -130 && lo < -50) ? -4 : 0;
        const over = al + noise + Math.max(0, band[k] - 30) * 0.2 + d * 1.6 - (la >= 0 ? snowN + tweak : snowS);
        const b = base[k], L = lum(b);
        if (over > 0) {
          // Border pixels stay dark so borders read through the snow.
          const edge = ids && i > 0 && j > 0 && i < w - 1 && j < h - 1 && (ids[k] !== ids[k - 1] || ids[k] !== ids[k + 1] || ids[k] !== ids[k - w] || ids[k] !== ids[k + w]);
          // Dark firs keep their colour under a frost, so forests still read in winter.
          seasonB[k] = edge ? mixP(b, SNOW[0], 0.4) : c >= 7 && c <= 9 && L < 0.3 ? mixP(b, SNOW[0], 0.35) : L < 0.25 ? SNOW[0] : L < 0.42 ? SNOW[1] : over > 2.5 && L > 0.55 ? SNOW[3] : SNOW[2];
          continue;
        }
        const fall = la >= 0 ? fallN : fallS;
        if (fall > 0 && (c === 7 || c === 8) && al > 28 && al < 66 && hash(u, v) < fall * (c === 8 ? 0.9 : 0.6)) {
          const R2 = c === 7 ? LARCH : AUTUMN, t = Math.min(R2.length - 1, Math.floor(L * 1.15 * R2.length + (hash(v, u) - 0.5)));
          if (c === 7 && L < 0.2) continue; // the dark firs stay green
          seasonB[k] = R2[Math.max(0, t)];
        }
      }
      ectx.putImageData(seaImg, 0, 0); seasonDoyBuilt = doy;
    }
    function clearSeason() { if (seasonB) { seasonB = null; ectx.clearRect(0, 0, seas.width, seas.height); } seasonDoyBuilt = null; }

    // ---------- night: the terminator from the sun, dithered; lights where it is dark ----------
    function buildNight(s) {
      const { cls, lat, lon, U0, V0, sprite } = V;
      if (!nightB || nightB.length !== w * h) { nightB = new Uint32Array(w * h); nightA = new Uint8Array(w * h); }
      if (!trig) {
        trig = { sl: new Float32Array(w * h), cl: new Float32Array(w * h), so: new Float32Array(w * h), co: new Float32Array(w * h) };
        for (let k = 0; k < w * h; k++) { const a = lat[k] * RAD, o = lon[k] * RAD; trig.sl[k] = Math.sin(a); trig.cl[k] = Math.cos(a); trig.so[k] = Math.sin(o); trig.co[k] = Math.cos(o); }
      }
      const { sl, cl, so, co } = trig, sd = Math.sin(s.dec), cd = Math.cos(s.dec), cs = Math.cos(s.lon), ss = Math.sin(s.lon), all = s.night === "all";
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const k = j * w + i; if (cls[k] === 255) { nightB[k] = 0; nightA[k] = 0; continue; }
        let a, warm = false;
        if (all) a = 0.6;
        else {
          const se = sl[k] * sd + cl[k] * cd * (co[k] * cs + so[k] * ss);
          if (se > 0.07) { nightB[k] = 0; nightA[k] = 0; continue; }
          if (se > 0) { a = 0.14; warm = true; }
          else if (se > -0.105) a = 0.2 + 0.25 * (-se / 0.105);
          else a = Math.min(0.62, 0.45 + (-se - 0.105) * 1.7);
        }
        // Quantise to steps of 1/12 with a Bayer dither: pixel-art shading, no smooth gradient.
        const d = BAYER[((V0 + j) & 3) * 4 + ((U0 + i) & 3)], q = Math.floor(a * 12 + d) / 12;
        const qa = sprite && sprite[k] ? q * 0.55 : q;
        nightA[k] = q * 255;
        nightB[k] = warm ? pack(DUSK[0], DUSK[1], DUSK[2], qa * 255) : pack(NIGHT[0], NIGHT[1], NIGHT[2], qa * 255);
      }
    }
    function lightsFor(y) {
      // Lights: the Reba et al. cities when they have loaded, the page's own cities until then.
      if (!lightsAll && opts.lightsData) lightsAll = opts.lightsData;
      if (!lightsAll && !lightsLoading && opts.lightsUrl) {
        lightsLoading = true;
        fetch(opts.lightsUrl).then(r => r.ok ? r.json() : null).then(d => { if (d && d.c) { lightsAll = d.c; lightsYear = null; changed(); } }).catch(() => {});
      }
      if (!lightsAll) return src.lights ? src.lights(y) || [] : [];
      const outL = [];
      for (const r of lightsAll) {
        if (r[2] > y) continue;
        let p = r[r.length - 1];
        for (let q = 2; q < r.length - 2; q += 2) if (y >= r[q] && y <= r[q + 2]) { p = r[q + 1] + (r[q + 3] - r[q + 1]) * (y - r[q]) / (r[q + 2] - r[q] || 1); break; }
        outL.push({ lat: r[0], lon: r[1], pop: p });
      }
      return outL;
    }
    function placeLights() {
      const era = year == null ? "fire" : year < 1800 ? "fire" : year < 1900 ? "gas" : "electric";
      const C = LIGHT[era].map(h => rgb(h));
      lightsNow = [];
      for (const L of lightsFor(year)) {
        const q = pm.toPixel(L.lon, L.lat); if (!q || q[0] < -8 || q[1] < -8 || q[0] >= w + 8 || q[1] >= h + 8) continue;
        // Electric light carries further than fire.
        const p = L.pop * (era === "electric" ? 2.2 : era === "gas" ? 1.3 : 1);
        const r = Math.max(1, Math.min(8, 1 + Math.log2(Math.max(1, p / 15)) * 1.15));
        lightsNow.push({ i: q[0], j: q[1], r, core: p > 900 ? 2 : p > 180 ? 1 : 0, C, flick: era === "fire" ? hash(q[0], q[1]) : -1 });
      }
      lightsNow.sort((a, b) => a.r - b.r);
      nightKey = "";
    }
    function drawLights(dst) {
      const { U0, V0 } = V;
      for (const L of lightsNow) {
        const { i: ci, j: cj, r, C } = L, k0 = cj * w + ci;
        if (ci < 0 || cj < 0 || ci >= w || cj >= h || nightA[k0] < 70) continue;
        const dark = Math.min(1, (nightA[k0] - 60) / 90);
        const R0 = Math.ceil(r);
        for (let dj = -R0; dj <= R0; dj++) for (let di = -R0; di <= R0; di++) {
          const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= w || j >= h) continue;
          const dd = Math.hypot(di, dj) / r; if (dd > 1) continue;
          const f = Math.pow(1 - dd, 1.5) * dark;
          if (BAYER[((V0 + j) & 3) * 4 + ((U0 + i) & 3)] < f * 1.25) { const c = C[2]; dst[j * w + i] = pack(c[0], c[1], c[2], 90 + f * 150); }
        }
        const core = C[0], cc = pack(core[0], core[1], core[2]);
        const put = (i, j, c) => { if (i >= 0 && j >= 0 && i < w && j < h) dst[j * w + i] = c; };
        put(ci, cj, cc);
        if (L.core >= 1) { put(ci + 1, cj, cc); put(ci, cj + 1, cc); put(ci + 1, cj + 1, pack(C[1][0], C[1][1], C[1][2])); }
        if (L.core >= 2) { put(ci - 1, cj, cc); put(ci, cj - 1, cc); put(ci + 2, cj + 1, cc); put(ci + 1, cj + 2, cc); }
      }
    }
    // Fire light flickers: a few cores change tone each step (palette cycling, not a redraw).
    function flicker() {
      for (const L of lightsNow) {
        if (L.flick < 0 || L.i < 0 || L.j < 0 || L.i >= w || L.j >= h || nightA[L.j * w + L.i] < 70) continue;
        const c = L.C[((frame + Math.floor(L.flick * 7)) % 7 === 0) ? 1 : 0];
        skyb[L.j * w + L.i] = pack(c[0], c[1], c[2]);
      }
    }

    // ---------- clouds, weather, storms, birds ----------
    // Clouds sit on a grid anchored to the world at the current zoom octave, so they keep their place while you zoom
    // inside one octave; wind moves each latitude band its own way (westerlies east, trade winds west).
    let kL = 1;
    function spawnClouds() {
      kL = Math.pow(2, Math.floor(Math.log2(Math.max(1, V.t.k))));
    }
    const CS = 64; // cloud cell, in art pixels at the octave's zoom
    const windAt = la => { const a = Math.abs(la); return a < 28 ? -1.1 : a < 62 ? 1.6 : -0.6; };
    function cloudiness(la, lo, doy) {
      const itcz = 5 + 7 * Math.sin(TAU * (doy - 110) / 365), a = Math.abs(la);
      let d = 0.08 + 0.42 * Math.exp(-(((la - itcz) / 8) ** 2)) + 0.36 * Math.exp(-(((a - 54) / 11) ** 2)) - 0.1 * Math.exp(-(((a - 24) / 6) ** 2));
      // The South Asian monsoon, June to September.
      if (lo > 66 && lo < 100 && la > 8 && la < 30 && doy > 155 && doy < 275) d += 0.45;
      return Math.max(0, d) * 0.55;
    }
    function cloudList() {
      if (!settings.weather || !V) return [];
      const { U0, V0, t } = V, s = t.k / kL, doy = seasonDoy() ?? 172, list = [];
      const rows0 = Math.floor(V0 / s / CS) - 1, rows1 = Math.ceil((V0 + h) / s / CS) + 1;
      for (let cv = rows0; cv <= rows1; cv++) {
        const jc = Math.round((cv + 0.5) * CS * s) - V0;
        const ll = projection.invert([((U0 + w / 2) * PX) / t.k, ((V0 + Math.max(0, Math.min(h - 1, jc))) * PX) / t.k]);
        const la = ll && isFinite(ll[1]) ? ll[1] : 0;
        const off = clock * windAt(la) * 1.4 / s; // art px in octave units
        const c0 = Math.floor((U0 / s - off) / CS) - 1, c1 = Math.ceil(((U0 + w) / s - off) / CS) + 1;
        for (let cu = c0; cu <= c1; cu++) {
          const r = hash(cu * 31 + 7, cv * 17 + 3);
          const x = Math.round(((cu + hash(cu, cv * 3 + 1) * 0.8) * CS + off) * s) - U0, y = Math.round(((cv + hash(cv, cu * 5 + 2) * 0.8) * CS) * s) - V0;
          if (x < -40 || y < -20 || x > w + 10 || y > h + 10) continue;
          const ci = Math.max(0, Math.min(w - 1, x + 8)), cj = Math.max(0, Math.min(h - 1, y + 4)), k = cj * w + ci;
          if (V.cls[k] === 255) continue;
          let dens = cloudiness(V.lat[k], V.lon[k], doy);
          const c = V.cls[k]; if (c === 12 || c === 13) dens *= 0.2; else if (c === 9) dens *= 1.3;
          if (r > dens) continue;
          const set = SHAPES[t.k < 2 ? 0 : t.k < 8 ? 1 : 2], shape = set[Math.floor(hash(cu, cv) * set.length)];
          // Calm first: a cloud never parks over sprites or lens marks (the things the map is saying).
          let cov = 0, tot = 0;
          for (let j = 0; j < shape.h; j += 2) for (let i = 0; i < shape.w; i += 2) {
            const xx = x + i, yy = y + j; if (xx < 0 || yy < 0 || xx >= w || yy >= h || !shape.m[j * shape.w + i]) continue;
            const q = yy * w + xx; tot++; if ((V.sprite && V.sprite[q]) || (V.out && V.out[q] !== V.base[q])) cov++;
          }
          if (tot && cov / tot > 0.03) continue;
          list.push({ x, y, shape, rain: dens > 0.3 && hash(cv, cu) < 0.6, storm: dens > 0.32 && Math.abs(V.lat[k]) < 25, lat: V.lat[k], seed: cu * 131 + cv });
        }
      }
      return list;
    }
    function stamp(img, x0, y0, nightAt, alphaMul) {
      const { m, w: W, h: H } = img, { out, base, cls } = V;
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const t = m[j * W + i]; if (!t) continue;
        const x = x0 + i, y = y0 + j; if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const k = y * w + x; if (cls[k] === 255) continue;
        // Thin over marks and sprites so they read through the cloud.
        const covered = out && out[k] !== base[k];
        let c = CLOUD[t - 1];
        const na = nightAt ? nightA[k] / 255 : 0;
        if (na) c = [c[0] + (NIGHT[0] - c[0]) * na * 1.1, c[1] + (NIGHT[1] - c[1]) * na * 1.1, c[2] + (NIGHT[2] - c[2]) * na];
        if (flash && t >= 3) c = [255, 248, 210];
        const a = (covered ? 0.4 : t === 1 ? 0.8 : 0.92) * alphaMul;
        // Ragged rims: a Bayer dither thins the outermost pixels.
        if (t === 1 && BAYER[((V.V0 + y) & 3) * 4 + ((V.U0 + x) & 3)] > 0.7) continue;
        skyb[k] = pack(c[0], c[1], c[2], a * 255);
      }
    }
    function shadowOf(img, x0, y0) {
      const { m, w: W, h: H } = img, { cls } = V;
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        if (!m[j * W + i]) continue;
        const x = x0 + i, y = y0 + j; if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const k = y * w + x; if (cls[k] !== 255 && !skyb[k]) skyb[k] = SHADOW;
      }
    }
    function drawWeather(nightOn) {
      const zoomed = V.t.k >= 2.5, doy = seasonDoy() ?? 172;
      for (const c of clouds) shadowOf(c.shape, c.x + 4, c.y + 6);
      if (storm) shadowOf(STORM[0], storm.x + 4, storm.y + 6);
      return () => {
        for (const c of clouds) {
          if (zoomed && c.rain) {
            const snow = (c.lat >= 0 ? 56 + 16 * Math.cos(TAU * (doy - 30) / 365) : 56 - 16 * Math.cos(TAU * (doy - 30) / 365)) < Math.abs(c.lat) && seasonDoy() != null;
            for (let d = 0; d < 7; d++) {
              const x = c.x + 2 + Math.floor(hash(c.seed, d) * (c.shape.w - 4)) + (snow ? ((frame + d) >> 2) % 2 : 0);
              const y = c.y + c.shape.h - 1 + ((frame * (snow ? 1 : 2) + d * 5) % 12);
              if (x < 0 || y < 0 || x >= w || y + 1 >= h || V.cls[y * w + x] === 255) continue;
              skyb[y * w + x] = snow ? FLAKE : RAIN; if (!snow) skyb[(y + 1) * w + x] = RAIN;
            }
          }
          stamp(c.shape, c.x, c.y, nightOn, 1);
        }
        if (storm) stamp(STORM[(frame >> 1) & 3], storm.x, storm.y, nightOn, 1);
        // Lightning: a rare flash in a tropical storm cloud, one step long, with a bolt to the ground.
        if (flash) {
          const c = flash.c, x = c.x + (c.shape.w >> 1);
          let y = c.y + c.shape.h - 1, xx = x;
          for (let n = 0; n < 9; n++, y++) { xx += (hash(c.seed, n + frame) < 0.5 ? -1 : 1) * (n % 2); if (xx >= 0 && y >= 0 && xx < w && y < h) skyb[y * w + xx] = BOLT; }
        }
      };
    }
    // Hurricanes in the North Atlantic (August to October) and typhoons in the West Pacific (July to October).
    function stormNow() {
      const doy = seasonDoy(); if (doy == null || !settings.weather) return null;
      const tracks = [];
      if (doy > 213 && doy < 305) tracks.push([[-42, 13], [-62, 18], [-76, 25], [-72, 34], [-52, 44]]);
      if (doy > 182 && doy < 305) tracks.push([[152, 11], [136, 16], [126, 22], [128, 30], [140, 38]]);
      for (const tr of tracks) {
        const p = (clock / 70) % 1, f = p * (tr.length - 1), n = Math.floor(f), ll = d3.geoInterpolate(tr[n], tr[n + 1])(f - n);
        const q = pm.toPixel(ll[0], ll[1]);
        if (q && q[0] > -20 && q[1] > -20 && q[0] < w && q[1] < h) return { x: q[0] - 9, y: q[1] - 9 };
      }
      return null;
    }
    // Birds: one or two flocks in a V when zoomed in, flying north in spring and south in autumn.
    function stepBirds() {
      if (!settings.weather || V.t.k < 2.5) { flocks = []; return; }
      const doy = seasonDoy() ?? 172, dir = doy > 50 && doy < 150 ? [0, -1] : doy > 235 && doy < 320 ? [0, 1] : [1, 0];
      if (flocks.length < (w * h > 160000 ? 2 : 1) && hash(frame, 77) < 0.02) {
        const i = Math.floor(hash(frame, 3) * w), j = dir[1] < 0 ? h - 2 : dir[1] > 0 ? 2 : Math.floor(hash(frame, 5) * h);
        flocks.push({ i: dir[0] > 0 ? 2 : i, j, dir, n: 3 + Math.floor(hash(frame, 9) * 4), seed: frame });
      }
      if (frame % 2 === 0) for (const f of flocks) { f.i += f.dir[0]; f.j += f.dir[1]; }
      flocks = flocks.filter(f => f.i > -20 && f.j > -20 && f.i < w + 20 && f.j < h + 20);
    }
    function drawBirds() {
      for (const f of flocks) for (let b = 0; b < f.n; b++) {
        const side = b % 2 ? 1 : -1, rank = (b + 1) >> 1;
        const bi = f.i + (f.dir[1] ? side * rank * 3 : -rank * 3), bj = f.j + (f.dir[1] ? rank * 2 * -f.dir[1] : side * rank * 2);
        const up = ((frame >> 1) + b) & 1;
        const px = up ? [[0, 0], [2, 0], [1, 1]] : [[0, 1], [2, 1], [1, 0]];
        for (const [dx, dy] of px) { const i = bi + dx, j = bj + dy; if (i >= 0 && j >= 0 && i < w && j < h) fxb[j * w + i] = INK; }
      }
    }

    // ---------- smoke: battles, burning cities and eruptions ----------
    function stepSmoke() {
      for (const e of emitters) {
        if (e.q[0] < -5 || e.q[1] < -5 || e.q[0] > w + 5 || e.q[1] > h + 5) continue;
        if ((frame + e.seed) % (e.kind === "ash" ? 2 : 4) === 0) puffs.push({ i: e.q[0] + Math.round((hash(frame, e.seed) - 0.5) * 4), j: e.q[1] - (e.kind === "battle" ? 9 : 6), age: 0, kind: e.kind, seed: frame + e.seed });
      }
      for (const p of puffs) { p.age++; if (p.age % 2 === 0) p.j--; if (p.age % 3 === 0) p.i += p.kind === "ash" ? 1 : hash(p.seed, p.age) < 0.6 ? 1 : 0; }
      puffs = puffs.filter(p => p.age < (p.kind === "ash" ? 26 : 16));
      if (puffs.length > 220) puffs.splice(0, puffs.length - 220);
    }
    function drawSmoke(nightOn) {
      const { U0, V0 } = V;
      for (const p of puffs) {
        const life = p.age / (p.kind === "ash" ? 26 : 16), r = 1 + Math.floor(life * 3), dark = p.kind === "ash" ? 70 : p.kind === "fire" ? 90 : 150;
        const g = Math.round(dark + (nightOn ? -40 : 0) + life * 50);
        for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
          if (di * di + dj * dj > r * r) continue;
          const i = p.i + di, j = p.j + dj; if (i < 0 || j < 0 || i >= w || j >= h) continue;
          if (BAYER[((V0 + j) & 3) * 4 + ((U0 + i) & 3)] < 1 - life * 0.9) skyb[j * w + i] = pack(g, g - 4, g - 10, 210 - life * 120);
        }
        // Embers at the root of a fire.
        if (p.kind !== "battle" && p.age < 3 && p.i >= 0 && p.j + 2 < h && p.i < w && p.j + 2 >= 0) skyb[(p.j + 2) * w + p.i] = packH(p.age & 1 ? "#ffb040" : "#e05a20");
      }
    }

    // ---------- meaning first: ink-in, plague fronts, campaigns, trade ----------
    // Borders that changed since the last settled year ink in over three stepped frames.
    // Borders that moved ink in quietly: only pixels within about 2 art px of a boundary that changed, in ink, stepping
    // from the old line to the new over three frames. Never a realm fill (art direction review of #63).
    function diffBorders() {
      const { ids, realms, cls } = V;
      const key = [V.t.k, V.t.x, V.t.y, w, h].join();
      if (!ids || !src.isOn || !src.isOn("borders")) { prevIds = null; return; }
      if (prevIds && prevKey === key && prevRealms !== realms) {
        const idx = new Map(realms.map((r, n) => [r.name || r.id, n + 1]));
        const map = new Int32Array(prevRealms.length + 1); prevRealms.forEach((r, n) => { map[n + 1] = idx.get(r.name || r.id) || -1; });
        const land = k => cls[k] > 3 && cls[k] !== 255;
        const edgeOf = (A, k) => { const a = A[k]; return A[k - 1] !== a || A[k + 1] !== a || A[k - w] !== a || A[k + w] !== a; };
        // An old boundary pixel survives if the same two realms still meet there (by name).
        const same = k => { const a = prevIds[k], b = ids[k]; return (a === 0 && b === 0) || map[a] === b; };
        const oldL = [], newL = [], moved = new Uint8Array(w * h);
        let changed = 0;
        for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
          const k = j * w + i; if (!land(k)) continue;
          if (!same(k)) changed++;
          const eo = edgeOf(prevIds, k), en = edgeOf(ids, k);
          if (eo && !en) { oldL.push(k); moved[k] = 1; } else if (en && !eo) { newL.push(k); moved[k] = 1; }
        }
        // A wholesale change (a new data frame, everything renamed) is not news: skip it.
        if ((oldL.length || newL.length) && changed < w * h * 0.25) {
          // The step between: changed pixels within 2 px of either line.
          const mid = [];
          for (let j = 2; j < h - 2; j++) for (let i = 2; i < w - 2; i++) {
            const k = j * w + i; if (moved[k] || !land(k) || same(k)) continue;
            let near = false;
            for (let dj = -2; dj <= 2 && !near; dj++) for (let di = -2; di <= 2; di++) if (moved[k + dj * w + di]) { near = true; break; }
            if (near) mid.push(k);
          }
          ink = { old: Int32Array.from(oldL), mid: Int32Array.from(mid), now: Int32Array.from(newL), f0: frame };
        }
      }
      prevIds = ids.slice(); prevRealms = realms; prevKey = key;
    }
    function drawInk() {
      if (!ink) return;
      const s = frame - ink.f0; if (s > 3) { ink = null; return; }
      const { U0, V0 } = V, col = (V.era && V.era.ink) || INK;
      const put = (L, cover) => { for (let n = 0; n < L.length; n++) { const k = L[n], i = k % w, j = (k / w) | 0; if (BAYER[((V0 + j) & 3) * 4 + ((U0 + i) & 3)] < cover) fxb[k] = col; } };
      // 0: the old line in ink; 1: the ground between, dithered; 2: the new line; 3: the new line fading.
      if (s === 0) put(ink.old, 1);
      else if (s === 1) { put(ink.old, 0.35); put(ink.mid, 0.4); put(ink.now, 0.5); }
      else if (s === 2) put(ink.now, 1);
      else put(ink.now, 0.4);
    }
    // A projected polyline as art-pixel steps, for walking along it.
    function trace(pts) {
      const outP = []; let prev = null;
      for (const ll of pts) {
        const q = pm.toPixel(ll[0], ll[1]); if (!q) { prev = null; continue; }
        if (prev) {
          const dx = q[0] - prev[0], dy = q[1] - prev[1], n = Math.max(Math.abs(dx), Math.abs(dy));
          if (n > 4000) { prev = q; continue; }
          for (let s = 1; s <= n; s++) outP.push([Math.round(prev[0] + dx * s / n), Math.round(prev[1] + dy * s / n)]);
        } else outP.push(q);
        prev = q;
      }
      return outP;
    }
    function drawFronts() {
      const { U0, V0 } = V, loop = (clock % 12) / 12 * 12; // a year of spread every 12 s: one second per month
      for (const f of fronts) {
        const p = Math.max(0, Math.min(1, loop - (f.month - 1))), n = Math.floor(p * (f.path.length - 1));
        if (p <= 0) continue;
        // The trail: a dithered purple band three pixels wide, densest along the route.
        for (let s = 0; s <= n; s++) {
          const [ci, cj] = f.path[s];
          for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
            const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= w || j >= h || V.sprite[j * w + i]) continue;
            if (BAYER[((V0 + j) & 3) * 4 + ((U0 + i) & 3)] < (di || dj ? 0.22 : 0.6)) fxb[j * w + i] = di || dj ? PLAGUE[2] : PLAGUE[0];
          }
        }
        // The front: a pulsing blot at the head, bright core, dark rim.
        if (p < 1) {
          const [ci, cj] = f.path[n], R2 = ((frame >> 1) & 1) ? 12 : 8;
          for (let dj = -4; dj <= 4; dj++) for (let di = -4; di <= 4; di++) {
            const i = ci + di, j = cj + dj, d = di * di + dj * dj; if (d > R2 + 4 || i < 0 || j < 0 || i >= w || j >= h) continue;
            if (d > R2) { if (BAYER[((V0 + j) & 3) * 4 + ((U0 + i) & 3)] < 0.5) fxb[j * w + i] = PLAGUE[2]; }
            else fxb[j * w + i] = d <= 2 ? PLAGUE[1] : BAYER[((V0 + j) & 3) * 4 + ((U0 + i) & 3)] < 0.7 ? PLAGUE[0] : PLAGUE[1];
          }
        }
      }
    }
    // A sprite drawn into the motion canvas; erase marks pixels of other frames that the map drew (frame 0) to restore.
    function sprite(name, team, f, i0, j0, flip, erase) {
      const px = pm.spritePixels(name, team, f, false, flip); if (!px) return false;
      if (erase) {
        const f0 = pm.spritePixels(name, team, 0, false, flip);
        for (let q = 0; q < f0.length; q += 3) { const i = i0 + f0[q], j = j0 + f0[q + 1]; if (i >= 0 && j >= 0 && i < w && j < h) fxb[j * w + i] = V.base[j * w + i] | 0xff000000; }
      }
      for (let q = 0; q < px.length; q += 3) { const i = i0 + px[q], j = j0 + px[q + 1]; if (i >= 0 && j >= 0 && i < w && j < h) fxb[j * w + i] = px[q + 2]; }
      return true;
    }
    const covers = (i0, j0, r) => { const m = V.sprite; if (!m) return false; for (let dj = -r; dj <= 0; dj++) for (let di = -r; di <= r; di++) { const i = i0 + di, j = j0 + dj; if (i >= 0 && j >= 0 && i < w && j < h && m[j * w + i]) return true; } return false; };
    function drawActors() {
      const sf = frame >> 2; // sprite frames at 2.5 fps, as SPEC.md asks (3 to 4)
      // Sprites the map placed that have more than one frame: animate them in place.
      for (const s of V.kept || []) {
        const S = (global.PIXEL_SPRITES || {})[s.sprite]; if (!S || S.frames.length < 2) continue;
        const q = pm.toPixel(s.lon, s.lat); if (!q) continue;
        const f = ((s.frame || 0) + sf) % S.frames.length; if (f === 0 && !(s.frame)) continue;
        const i0 = q[0] + (s.dx || 0), j0 = q[1] + (s.dy || 0);
        if (sprite(s.sprite, s.team, (s.frame || 0) + sf, i0, j0, s.flip, true)) animRects.push([i0 - S.w, j0 - S.h, S.w * 2 + 1, S.h * 2 + 1]);
      }
      // Campaigns: footprints from the last battle to the next one of the same war, and the army walking them.
      const placed = [];
      for (const m of marches) {
        const P = m.path; if (P.length < 2) continue;
        const mid = P[P.length >> 1];
        if (mid[0] < 0 || mid[1] < 0 || mid[0] >= w || mid[1] >= h || placed.length >= 5 || placed.some(q => Math.abs(q[0] - mid[0]) + Math.abs(q[1] - mid[1]) < 24)) continue;
        placed.push(mid);
        const p = (clock / 9 + m.phase) % 1, n = Math.min(P.length - 1, Math.floor(p * 1.25 * (P.length - 1)));
        // Footprints: two-pixel dashes in ink, the way a campaign map marks a march.
        for (let s = 0; s < n; s++) { if (s % 4 > 1) continue; const [i, j] = P[s]; if (i >= 0 && j >= 0 && i < w && j < h && !V.sprite[j * w + i]) fxb[j * w + i] = TRAIL; }
        const [i, j] = P[n];
        if (!covers(i, j, 3)) sprite(m.sprite, m.team, sf, i, j, P[P.length - 1][0] < P[0][0], false);
      }
      // Trade: ships and caravans along the active routes, with a wake behind each ship.
      for (const mv of movers) {
        let s = ((mv.phase + clock * 0.022 / Math.max(0.2, mv.tot)) % 1) * mv.tot, ll = mv.line[mv.line.length - 1], seg = 0;
        for (let n = 0; n < mv.segs.length; n++) { if (s <= mv.segs[n]) { ll = d3.geoInterpolate(mv.line[n], mv.line[n + 1])(s / (mv.segs[n] || 1)); seg = n; break; } s -= mv.segs[n]; }
        const q = pm.toPixel(ll[0], ll[1]); if (!q || q[0] < -10 || q[1] < -10 || q[0] > w + 10 || q[1] > h + 10) continue;
        const k = q[1] * w + q[0], sea = q[0] >= 0 && q[1] >= 0 && q[0] < w && q[1] < h && V.cls[k] <= 2;
        if (covers(q[0], q[1], 4)) continue;
        const a = pm.toPixel(mv.line[seg][0], mv.line[seg][1]), b = pm.toPixel(mv.line[seg + 1][0], mv.line[seg + 1][1]);
        const left = a && b && b[0] < a[0];
        const name = src.moverSprite ? src.moverSprite(ll[0], ll[1], sea) : sea ? "ship" : "caravan";
        if (sea) for (let n = 1; n <= 3; n++) { const i = q[0] + (left ? n + 4 : -n - 4), j = q[1] + ((n + (frame >> 1)) & 1); if (i >= 0 && j >= 0 && i < w && j < h && V.cls[j * w + i] <= 2) fxb[j * w + i] = mixP(V.base[j * w + i], 0xfff4f8ec, n === 1 ? 0.6 : 0.35); }
        sprite(name, null, sf, q[0], q[1], left, false);
      }
    }
    function drawPulses() {
      pulses = pulses.filter(p => p.repeat || frame - p.f0 < 8);
      for (const p of pulses) {
        const s = (frame - p.f0) % (p.repeat ? 16 : 99); if (s > 6) continue;
        const q = pm.toPixel(p.lon, p.lat); if (!q) continue;
        const r = Math.round((p.r || 9) * (s + 1) / 7), col = packH(p.color || "#d8a32c");
        for (let a = 0; a < 64; a++) {
          const i = q[0] + Math.round(Math.cos(a / 64 * TAU) * r), j = q[1] + Math.round(Math.sin(a / 64 * TAU) * r);
          if (i >= 0 && j >= 0 && i < w && j < h) { fxb[j * w + i] = s < 5 ? col : INK; const o = j * w + i + 1; if (s < 4 && i + 1 < w && !(a % 2)) fxb[o] = INK; }
        }
      }
    }

    // ---------- settle: the heavier passes, once the year and the view are quiet ----------
    function changed() {
      lastChange = performance.now(); settled = false;
      if (animRects.length && fxb) { for (const [x, y, rw, rh] of animRects) { for (let j = Math.max(0, y); j < Math.min(h, y + rh); j++) fxb.fill(0, j * w + Math.max(0, x), j * w + Math.min(w, x + rw)); fctx.putImageData(fxImg, 0, 0, x, y, rw, rh); } animRects = []; }
      clearTimeout(settleTimer); settleTimer = setTimeout(settle, SETTLE);
    }
    function settle() {
      settleTimer = 0;
      if (!V) return;
      if (mapEl.classList.contains("moving")) { settleTimer = setTimeout(settle, SETTLE); return; }
      V = pm.view(); if (!V) return;
      if (V.w !== w || V.h !== h) return layout();
      const on = k => !src.isOn || src.isOn(k);
      diffBorders();
      const sd = seasonDoy(); if (sd == null) clearSeason(); else buildSeason(sd);
      if (lightsYear !== year) { lightsYear = year; lightsNow = []; }
      if (sunNow().night) placeLights();
      movers = on("money") && src.movers ? src.movers() || [] : [];
      marches = on("war") && src.campaigns ? (src.campaigns(year) || []).map((c, n) => ({ ...c, path: trace([c.a, c.b]), phase: hash(n, 5) })).filter(m => m.path.length > 6) : [];
      fronts = on("disease") && src.plague ? (src.plague(year) || []).map(f => ({ month: f.month || 1, path: trace(f.pts) })).filter(f => f.path.length > 1) : [];
      emitters = src.emitters ? (src.emitters(year) || []).map((e, n) => ({ ...e, q: pm.toPixel(e.lon, e.lat) || [-99, -99], seed: n * 13 })) : [];
      puffs = [];
      dirtyWater = true; settled = true;
      draw(true);
    }

    // ---------- the step ----------
    function running() { return visible && !document.hidden && moving(); }
    function quiet() { return !V || mapEl.classList.contains("moving") || performance.now() - lastChange < SETTLE || !settled; }
    function tick() {
      if (!running()) return stop();
      if (quiet()) return;
      if (slow && (half ^= 1)) return;
      const t0 = performance.now();
      frame++; clock += STEP / 1000; vClock += STEP / 1000;
      // The season moves on in "cycle" and "now": rebuild when it has moved about three days.
      const sd = seasonDoy(); if (sd != null && (seasonDoyBuilt == null || Math.abs(sd - seasonDoyBuilt) > 3)) buildSeason(sd);
      draw(false);
      for (const fn of stepFns) try { fn(frame); } catch (err) { console.error("motion step", err); }
      cost = cost * 0.9 + (performance.now() - t0) * 0.1;
      // Budget guard: a slow machine drops to 5 fps, then loses the weather.
      if (cost > 6 && !slow) slow = 1;
      if (cost > 10 && settings.weather) { settings.weather = false; clouds = []; }
    }
    function draw(full) {
      if (!V || !fxb) return;
      // fx: water, actors, meaning; one put.
      fxb.fill(0); animRects = [];
      paintWater(moving() ? frame : 0);
      drawFronts(); drawInk(); stepBirds(); drawBirds(); drawActors(); drawPulses();
      if (layers.size) {
        const g = { out: fxb, w, h, frame, px: PX, cls: V.cls, sprite: V.sprite, at: (x, y) => [(x * V.t.k) / PX - V.U0, (y * V.t.k) / PX - V.V0], toPixel: (lon, lat) => pm.toPixel(lon, lat) };
        for (const fn of layers.values()) try { fn(g); } catch (err) { console.error("motion layer", err); }
      }
      fctx.putImageData(fxImg, 0, 0);
      // sky: shadows, night, lights, clouds, smoke.
      const s = sunNow(), nightOn = !!s.night;
      clouds = cloudList(); storm = stormNow();
      if (flash) flash = 0; else if (nightOn && settings.weather && moving()) { const st = clouds.filter(c => c.storm); if (st.length && hash(frame, 991) < 0.012 * Math.min(4, st.length)) flash = { c: st[Math.floor(hash(frame, 7) * st.length)] }; }
      stepSmoke();
      if (!clouds.length && !nightOn && !puffs.length && !storm) { if (skyDirty) { sctx.clearRect(0, 0, w, h); skyDirty = false; } return; }
      skyb.fill(0);
      const top = drawWeather(nightOn);
      if (nightOn) {
        const key = s.night === "all" ? "all" : Math.round(s.lon / RAD * 2) + ":" + Math.round(s.dec / RAD * 2);
        if (key !== nightKey || full || !nightL) {
          buildNight(s); nightKey = key;
          // The night and its lights are one cached layer, rebuilt only when the sun moves a step or the lights change.
          if (!nightL || nightL.length !== w * h) nightL = new Uint32Array(w * h);
          nightL.set(nightB); drawLights(nightL);
        }
        for (let k = 0; k < skyb.length; k++) { const n = nightL[k]; if (n) skyb[k] = skyb[k] && (n >>> 24) < 250 ? mixShade(skyb[k], n) : n; }
        flicker();
      }
      top(); drawSmoke(nightOn);
      sctx.putImageData(skyImg, 0, 0); skyDirty = true;
    }
    let skyDirty = false;
    // A cloud shadow under the night: darken by both.
    const mixShade = (a, b) => pack(R(b), G(b), B(b), Math.min(235, (a >>> 24) + (b >>> 24)));

    function start() { if (!timer && running()) timer = setInterval(tick, STEP); }
    function stop() { clearInterval(timer); timer = 0; }
    // A still frame (reduced motion, or paused for good): the season, the night and the clouds where they are.
    function still() { if (V && settled) draw(true); }

    // ---------- year-jump dissolve ----------
    // The old frame is copied over the new and eaten away by a Bayer threshold in five stepped frames.
    const tiles = BAYER.map((_, n) => { const c = document.createElement("canvas"); c.width = c.height = 4; const x = c.getContext("2d"); BAYER.forEach((b, q) => { if (b < (n + 1) / 16) { x.fillStyle = "#000"; x.fillRect(q % 4, q >> 2, 1, 1); } }); return c; });
    function jump() {
      if (!moving() || !pm.canvas.width) return;
      dis.width = pm.canvas.width; dis.height = pm.canvas.height;
      const s = pm.canvas.style; Object.assign(dis.style, { left: s.left, top: s.top, width: s.width, height: s.height, transform: s.transform, transformOrigin: s.transformOrigin, display: "" });
      dctx.globalCompositeOperation = "source-over"; dctx.drawImage(pm.canvas, 0, 0);
      clearInterval(dissolve); let n = 0;
      dissolve = setInterval(() => {
        n++;
        if (n > 5) { clearInterval(dissolve); dissolve = 0; dis.style.display = "none"; return; }
        dctx.globalCompositeOperation = "destination-out";
        dctx.fillStyle = dctx.createPattern(tiles[Math.min(15, Math.round(n * 16 / 5) - 1)], "repeat"); dctx.fillRect(0, 0, dis.width, dis.height);
      }, STEP);
    }

    // ---------- sky control: a pixel plate beside the compass, and a small chronicle popover ----------
    const btn = document.createElement("canvas"), BW = 19, BH = 25;
    btn.width = BW; btn.height = BH; btn.className = "pxsky-btn"; Object.assign(btn.style, { width: BW * PX + "px", height: BH * PX + "px" });
    btn.tabIndex = 0; btn.setAttribute("role", "button"); btn.setAttribute("aria-haspopup", "true"); btn.title = "Sky, seasons and motion (N for night)";
    const pop = document.createElement("div"); pop.className = "pxsky-pop"; pop.hidden = true; pop.setAttribute("role", "dialog"); pop.setAttribute("aria-label", "Sky and motion");
    function drawBtn() {
      const x = btn.getContext("2d"), mode = settings.sky;
      x.clearRect(0, 0, BW, BH);
      x.fillStyle = "#221f1a"; x.fillRect(1, 0, BW - 2, BH); x.fillRect(0, 1, BW, BH - 2);
      x.fillStyle = mode === "day" ? "#3c6c80" : mode === "night" ? "#141a34" : "#2a3050"; x.fillRect(2, 2, BW - 4, BH - 4);
      x.fillStyle = "#c8a46a"; x.fillRect(2, 1, BW - 4, 1); x.fillRect(2, BH - 2, BW - 4, 1); x.fillRect(1, 2, 1, BH - 4); x.fillRect(BW - 2, 2, 1, BH - 4);
      const P = (c, pts) => { x.fillStyle = c; for (const [i, j] of pts) x.fillRect(i, j, 1, 1); };
      const disc = (cx, cy, r, c) => { x.fillStyle = c; for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i * i + j * j <= r * r + 1) x.fillRect(cx + i, cy + j, 1, 1); };
      if (mode === "night") { disc(9, 9, 4, "#f2ecd0"); disc(11, 8, 3, "#141a34"); P("#fff6d0", [[4, 4], [14, 13], [5, 14], [15, 4]]); }
      else if (mode === "day") { disc(9, 9, 3, "#ffd060"); P("#ffd060", [[9, 3], [9, 15], [3, 9], [15, 9], [5, 5], [13, 5], [5, 13], [13, 13]]); P("#fff6d0", [[8, 8]]); }
      else { disc(7, 8, 3, "#ffd060"); disc(12, 11, 3, "#f2ecd0"); disc(14, 10, 2, mode === "now" ? "#2a3050" : "#2a3050"); }
      // Ground strip: green land, a cloud when the weather is on, a dot of town light in night modes.
      x.fillStyle = "#4a783a"; x.fillRect(2, 18, BW - 4, 5); x.fillStyle = "#3a5a40"; x.fillRect(2, 21, BW - 4, 2);
      if (settings.weather) { P("#f7f7f2", [[3, 16], [4, 15], [5, 15], [6, 16], [4, 16], [5, 16]]); }
      if (mode !== "day") P("#ffd060", [[13, 19], [15, 20]]);
      if (!moving()) { P("#e8e4dc", [[15, 15], [16, 15], [15, 16], [16, 16]]); x.fillStyle = "#221f1a"; x.fillRect(15, 15, 1, 2); }
      btn.setAttribute("aria-label", "Sky: " + SKY_MODES.find(m => m[0] === mode)[1] + (moving() ? "" : ", motion off"));
    }
    function renderPop() {
      const row = (title, key, opts2) => `<h4>${title}</h4><div class="opts">${opts2.map(([v, l]) => `<button data-k="${key}" data-v="${v}" aria-pressed="${String(settings[key]) === String(v)}">${l}</button>`).join("")}</div>`;
      pop.innerHTML = row("Sky", "sky", SKY_MODES) + row("Month", "month", MONTHS) +
        row("Weather", "weather", [["true", "On"], ["false", "Off"]]) +
        `<h4>Motion</h4><div class="opts">${[["on", "On"], ["off", "Off"]].map(([v, l]) => `<button data-k="motion" data-v="${v}" aria-pressed="${(moving() ? "on" : "off") === v}">${l}</button>`).join("")}</div>` +
        `<p class="note">${settings.sky === "night" ? "City lights from Reba et al. (2016): fire light before 1800, gas to 1900, then electric." : settings.sky === "now" ? "The real sun right now, over the world of the year on the slider." : settings.sky === "cycle" ? "A day every 90 seconds, a year of seasons every 12 minutes." : "Snow, sea ice and autumn follow the month in each hemisphere."}</p>`;
    }
    pop.addEventListener("click", ev => {
      const b = ev.target.closest("button[data-k]"); if (!b) return;
      const k = b.dataset.k, v = b.dataset.v;
      set({ [k]: k === "weather" ? v === "true" : k === "motion" ? v === "on" : v });
    });
    const toggle = open => { pop.hidden = open == null ? !pop.hidden : !open; if (!pop.hidden) renderPop(); btn.setAttribute("aria-expanded", String(!pop.hidden)); };
    btn.addEventListener("click", () => toggle());
    btn.addEventListener("keydown", ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); toggle(); } });
    const onDoc = ev => { if (!pop.hidden && !pop.contains(ev.target) && ev.target !== btn) toggle(false); };
    document.addEventListener("pointerdown", onDoc);
    // N toggles night lights (and back to the last sky).
    let lastSky = settings.sky === "night" ? "day" : settings.sky;
    const onKey = ev => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey || ev.defaultPrevented) return;
      const t = ev.target; if (t.closest && t.closest("input, textarea, select, [contenteditable]")) return;
      if (ev.key === "Escape" && !pop.hidden) { toggle(false); return; }
      if (ev.key.toLowerCase() !== "n") return;
      if (settings.sky === "night") set({ sky: lastSky }); else { lastSky = settings.sky; set({ sky: "night" }); }
      ev.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    function mountBtn() {
      const row = mapEl.querySelector(".pxhud-br .row");
      if (row) row.prepend(btn); else { const box = document.createElement("div"); Object.assign(box.style, { position: "absolute", right: "10px", bottom: "10px", zIndex: 5 }); box.append(btn); mapEl.append(box); }
      mapEl.append(pop);
    }
    mountBtn(); drawBtn();

    function set(o) {
      const prevNight = !!sunNow().night;
      Object.assign(settings, o);
      if ("sky" in o && o.sky !== "night") lastSky = o.sky;
      try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) { /* not saved */ }
      if (o.sky) { vClock = 0; nightKey = ""; if (!!sunNow().night !== prevNight && sunNow().night) placeLights(); }
      const sd = seasonDoy(); if (V) { if (sd == null) clearSeason(); else buildSeason(sd); }
      if (!settings.weather) { clouds = []; flocks = []; }
      drawBtn(); if (!pop.hidden) renderPop();
      if (V && settled) draw(true);
      if (running()) start(); else stop();
    }

    // ---------- lifecycle ----------
    pm.on(kind => {
      if (kind === "layout") layout();
      else if (kind === "realms" || kind === "paint") { V = pm.view(); changed(); }
    });
    const io = typeof IntersectionObserver === "function" ? new IntersectionObserver(es => { visible = es.some(e => e.isIntersecting); if (running()) start(); else stop(); }) : null;
    if (io) io.observe(mapEl);
    const onVis = () => { if (running()) start(); else stop(); };
    document.addEventListener("visibilitychange", onVis);
    const onReduce = () => { drawBtn(); if (running()) start(); else { stop(); still(); } };
    if (reduceQ.addEventListener) reduceQ.addEventListener("change", onReduce);
    if (pm.view()) layout();
    start();

    const self = {
      year(y) { if (y !== year) { year = y; changed(); } },
      move,
      jump,
      fly(v, ms) { if (v && isFinite(v.lon) && isFinite(v.lat)) setTimeout(() => self.pulse(v.lon, v.lat, { color: "#d8a32c", r: 10 }), (ms || 0) + SETTLE + 60); },
      pulse(lon, lat, o = {}) {
        if (lon == null) { pulses = pulses.filter(p => !p.repeat); return; }
        pulses.push({ lon, lat, color: o.color, r: o.r, repeat: !!o.repeat, f0: frame });
        if (!timer) { // reduced motion: one still ring, then gone
          if (V && settled) { draw(true); setTimeout(() => { pulses = pulses.filter(p => p.repeat); if (V && settled) draw(true); }, 1200); }
        }
      },
      layer(id, fn) { if (fn) layers.set(id, fn); else layers.delete(id); },
      onStep(fn) { stepFns.push(fn); },
      get frame() { return frame; },
      get settings() { return { ...settings, motion: moving() }; },
      get cost() { return cost; },
      set,
      destroy() {
        stop(); clearTimeout(settleTimer); clearInterval(dissolve);
        if (io) io.disconnect();
        document.removeEventListener("visibilitychange", onVis); document.removeEventListener("pointerdown", onDoc); document.removeEventListener("keydown", onKey);
        if (reduceQ.removeEventListener) reduceQ.removeEventListener("change", onReduce);
        for (const c of [seas, fx, sky, dis, btn, pop]) c.remove();
      },
    };
    return self;
  }
  global.PixelMotion = PixelMotion;
})(typeof window !== "undefined" ? window : globalThis);
