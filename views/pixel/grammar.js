// The data grammar of the pixel map (see views/atlas/VIZ.md): how numbers, kinds and certainty become pixels.
// One source for lens tinctures and data ramps (PIXEL_PALETTE.LENS / LENS_DARK / RAMP), the confidence grammar,
// Minard flow ribbons, choropleths dithered into a monochrome relief, city tiers and the compare-two-years overlay.
//
//   PixelGrammar.conf(rec)                 -> 0 solid | 1 hatched | 2 dashed | 3 fog (art direction D10)
//   PixelGrammar.flowWidth(people)         -> ribbon width in art px: one pixel for every tenfold (10k = 1 ... 100M = 5)
//   PixelGrammar.ribbon(g, polys, o)       paints one flow into a PixelMap frame g (marks.js calls it for lines with w)
//   PixelGrammar.thematic = {...} | null   a choropleth; PixelGrammar.under(g) paints it under the sprites
//   PixelGrammar.compare = {...} | null    territory that changed hands since another year, painted by over(g)
//   PixelGrammar.tier(pop)                 -> city tier 0..5 (no number, hamlet, town, city, great city, metropolis)
(function (global) {
  const PAL = global.PIXEL_PALETTE || (global.PIXEL_PALETTE = {});
  // D4: one heraldic tincture per lens family. Purpure re-stepped from #8a4fa0 so it parts from Azure under deuteranopia.
  const LENS = { land: "#3f8f5e", power: "#c0392b", wealth: "#d8a32c", peoples: "#d2742c", mind: "#3a6fb8", shocks: "#903f85" };
  // The same six, one step lighter for the dark chronicle (panel text and swatches on #121a1b).
  const LENS_DARK = { land: "#6cbf8a", power: "#e86a5a", wealth: "#e8bf5a", peoples: "#ee9a58", mind: "#7aa6e8", shocks: "#c47ab8" };
  // Which family each lens (layer key) and each guide lens belongs to.
  const FAMILY = { places: "land", borders: "land", terrain: "land", war: "power", order: "power", law: "power", changes: "power", thematic: "power",
    money: "wealth", tech: "wealth", people: "peoples", peoples: "peoples", ideas: "mind", art: "mind", disease: "shocks",
    geography: "land", military: "power", economy: "wealth", population: "peoples", religion: "mind", literature: "mind" };
  // Data ramps: five steps, monotone lightness, hue leaning cooler as they darken (validated: views/atlas/VIZ.md).
  const RAMP = {
    risk: ["#e09a46", "#c27837", "#a3582b", "#823a20", "#621e16"],     // calm -> about to break
    age: ["#88b05d", "#639455", "#43774a", "#265b3d", "#0f3f2e"],      // young -> ancient
    change: ["#4f2f7f", "#8f7bbd", "#d6cfbf", "#d99045", "#9a4a08"],   // shrinking <- steady -> growing (diverging, purple-orange: clear of the sea)
    mono: ["#4c4436", "#6e6450", "#938770", "#b9ad92", "#e2d8bc"],     // the relief a choropleth sits on
  };
  Object.assign(PAL, { LENS, LENS_DARK, LENS_OF: FAMILY, RAMP });

  // ---------- page tokens: every lens colour on the page comes from the six tinctures ----------
  const VARS = { "--y-places": "land", "--y-people": "peoples", "--y-money": "wealth", "--y-disease": "shocks", "--y-ideas": "mind", "--y-order": "power",
    "--y-war": "power", "--l-geography": "land", "--l-military": "power", "--l-economy": "wealth", "--l-population": "peoples", "--l-disease": "shocks",
    "--l-religion": "mind", "--l-ideas": "mind", "--l-literature": "mind", "--l-people": "peoples", "--l-order": "power" };
  if (typeof document !== "undefined" && !document.getElementById("pixel-grammar-tokens")) {
    const rule = T => Object.entries(VARS).map(([k, f]) => `${k}: ${T[f]};`).join(" ") + " " + Object.keys(LENS).map(f => `--fam-${f}: ${T[f]};`).join(" ");
    const st = document.createElement("style"); st.id = "pixel-grammar-tokens";
    st.textContent = `:root { ${rule(LENS)} }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${rule(LENS_DARK)} } }
:root[data-theme="dark"] { ${rule(LENS_DARK)} }`;
    (document.head || document.documentElement).appendChild(st);
  }
  // Plugin lenses take their family's tincture (the page sets --y-<id> from lens.color).
  if (global.ATLAS && typeof global.ATLAS.lens === "function" && !global.ATLAS.lens._tinct) {
    const reg = global.ATLAS.lens;
    global.ATLAS.lens = function (d) { if (d && LENS[d.family] && !d.ownColor) { d.srcColor = d.color; d.color = LENS[d.family]; } return reg.call(this, d); };
    global.ATLAS.lens._tinct = true;
  }

  // ---------- confidence (D10) ----------
  const SOLID = 0, HATCH = 1, DASH = 2, FOG = 3;
  const CONF_NAME = ["attested", "estimated", "approximate or disputed", "unknown extent"];
  // Names other threads use too: sure / likely / legend (lens paths, "Follow objects through history").
  const CONF_KEY = { solid: 0, attested: 0, sure: 0, hatched: 1, estimated: 1, dashed: 2, approximate: 2, disputed: 2, likely: 2, fog: 3, unknown: 3, speculative: 3, legend: 3 };
  // Explicit rec.conf wins; then what the record itself says about its certainty.
  function conf(r) {
    if (!r) return SOLID;
    if (r.conf != null) return typeof r.conf === "number" ? Math.max(0, Math.min(3, r.conf | 0)) : CONF_KEY[r.conf] ?? SOLID;
    if (r.ghost || r.speculative) return FOG;
    if (r.disputed || (Array.isArray(r.views) && r.views.length > 1)) return DASH;
    const lo = r.low ?? (Array.isArray(r.range) ? r.range[0] : null), hi = r.high ?? (Array.isArray(r.range) ? r.range[1] : null);
    if (lo != null && hi != null && lo > 0 && hi / lo > 1.5) return HATCH;
    if (r.approx || r.start_approx || r.end_approx || r.estimate) return HATCH;
    return SOLID;
  }
  // World-anchored patterns (u, v are art pixels in world space, so they never shimmer on pan).
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const bayer = (u, v) => BAYER[((v & 3) << 2) | (u & 3)] / 16;
  const hatchOn = (u, v) => ((u + v) & 3) < 2;          // a 2-px 45 degree stripe
  const fogOn = (u, v, d) => bayer(u, v) < d;           // ordered dissolve, d = density 0..1

  // ---------- colour helpers ----------
  const hex = s => { const m = /^#?([0-9a-f]{6})$/i.exec(String(s).trim()); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const probe = typeof document !== "undefined" ? document.createElement("i") : null, cssCache = new Map();
  function rgbOf(c) {
    if (Array.isArray(c)) return c;
    let v = cssCache.get(c); if (v) return v;
    v = hex(c);
    if (!v && probe && document.body) { probe.style.color = c; document.body.appendChild(probe); const m = getComputedStyle(probe).color.match(/[\d.]+/g); probe.remove(); v = m ? [+m[0], +m[1], +m[2]] : null; }
    v = v || [128, 128, 128]; cssCache.set(c, v); return v;
  }
  const pack = c => (255 << 24 | c[2] << 16 | c[1] << 8 | c[0]) >>> 0;
  const unpack = p => [p & 255, (p >> 8) & 255, (p >> 16) & 255];
  const mix = (a, b, t) => [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
  const INK = [34, 31, 26], VELLUM = [246, 240, 220];
  // Hue-shifted tones of one colour: shadows lean blue-violet, highlights lean warm (D3).
  function tones(c) {
    const b = rgbOf(c);
    return { k: pack(INK), c: pack(b), d: pack(mix(b, [40, 30, 64], 0.42)), l: pack(mix(b, [255, 236, 170], 0.4)), w: pack(VELLUM), rgb: b };
  }

  // ---------- flows (Minard ribbons) ----------
  // Width means a number: one art pixel for every tenfold of people, so 10k = 1 px, 1M = 3 px, 100M = 5 px. No count, no width.
  const flowWidth = n => !(n > 0) ? 0 : Math.max(1, Math.min(6, Math.round(Math.log10(n) - 3)));
  let MASK = null, DIST = null, TOUCH = [];
  function ribbon(g, polys, o) {
    const { w, h, out } = g, N = w * h;
    if (!MASK || MASK.length !== N) { MASK = new Uint8Array(N); DIST = new Float32Array(N); TOUCH = []; }
    const W = Math.max(1, o.w || 1), hw = (W - 1) / 2, T = o.tones || tones(o.color), a = o.alpha ?? 1, cf = o.conf || 0;
    const prog = o.progress == null ? 1 : Math.max(0, Math.min(1, o.progress));
    const U0 = g.U0 || 0, V0 = g.V0 || 0;
    // Walk the polyline in art pixels at half-pixel steps, stamping a span across the normal.
    const pts = [];
    for (const poly of polys) {
      let prev = null;
      for (const p of poly) {
        const q = g.at(p[0], p[1]);
        if (prev) {
          const dx = q[0] - prev[0], dy = q[1] - prev[1], L = Math.hypot(dx, dy);
          if (L > 0 && L < 3000) { const n = Math.ceil(L * 2); for (let s = 0; s < n; s++) pts.push(prev[0] + dx * s / n, prev[1] + dy * s / n, -dy / L, dx / L); }
        }
        prev = q;
      }
      if (prev) pts.push(prev[0], prev[1], pts.length ? pts[pts.length - 2] : 0, pts.length ? pts[pts.length - 1] : 1);
    }
    if (pts.length < 8) return;
    // Cumulative length (art px) for progress, dashes and chevrons.
    const n = pts.length / 4, len = new Float32Array(n);
    for (let i = 1; i < n; i++) len[i] = len[i - 1] + Math.hypot(pts[i * 4] - pts[i * 4 - 4], pts[i * 4 + 1] - pts[i * 4 - 3]);
    const total = len[n - 1] || 1, cut = total * prog;
    for (let i = 0; i < n; i++) {
      const x = pts[i * 4], y = pts[i * 4 + 1], nx = pts[i * 4 + 2], ny = pts[i * 4 + 3];
      for (let t = -hw; t <= hw + 1e-6; t += 0.5) {
        const px = Math.floor(x + nx * t + 0.5), py = Math.floor(y + ny * t + 0.5);
        if (px < 0 || py < 0 || px >= w || py >= h) continue;
        const k = py * w + px;
        if (!MASK[k]) { MASK[k] = len[i] <= cut ? 1 : 2; DIST[k] = len[i]; TOUCH.push(k); }
      }
    }
    const put = (k, c, al) => { if (al >= 0.99) { out[k] = c; return; } const o0 = unpack(out[k]); out[k] = pack(mix(o0, unpack(c), al)); };
    // Outline first (ink around the filled part, a faint dotted ink around what is still to come), then body.
    const ring = [];
    for (const k of TOUCH) {
      const i = k % w, j = (k / w) | 0;
      for (const kk of [k - 1, k + 1, k - w, k + w]) {
        if (kk < 0 || kk >= N || MASK[kk]) continue;
        const ii = kk % w; if (Math.abs(ii - i) > 1) continue;
        ring.push(kk, MASK[k], DIST[k]);
      }
    }
    for (let r = 0; r < ring.length; r += 3) {
      const kk = ring[r], filled = ring[r + 1] === 1, d = ring[r + 2], u = (kk % w) + U0, v = ((kk / w) | 0) + V0;
      if (MASK[kk] === 3) continue; MASK[kk] = 3; TOUCH.push(kk);
      if (!filled) { if (((u + v) & 1) === 0) put(kk, T.k, a * 0.55); continue; }
      if (cf === FOG && !fogOn(u, v, 0.5)) continue;
      if (cf === DASH && (d % 6) >= 3.5) continue;
      put(kk, T.k, a * 0.92);
    }
    for (const k of TOUCH) {
      const m = MASK[k]; if (m !== 1 && m !== 2) continue;
      const i = k % w, j = (k / w) | 0, u = i + U0, v = j + V0;
      if (m === 2) { if (cf !== FOG && ((u + v) & 3) === 0) put(k, T.c, a * 0.5); continue; }    // still to come: a sparse trace
      const top = j === 0 || MASK[k - w] === 3 || MASK[k - w] === 0, left = i === 0 || MASK[k - 1] === 3 || MASK[k - 1] === 0;
      let c = T.c;
      if (cf === HATCH && !hatchOn(u, v)) c = T.d;                    // estimated: 2-px diagonal stripes
      if (cf === FOG && !fogOn(u, v, 0.55)) continue;                 // unknown extent: dissolves
      if (W >= 3 && (top || left) && cf !== HATCH) c = T.l;            // a vellum-warm highlight on the lit edge
      put(k, c, a);
    }
    // Chevrons inside the ribbon, pointing downstream: vellum for a free flow, ink for a forced one.
    if (W >= 3 && cf !== FOG) {
      const step = Math.max(14, W * 5), ph = ((o.frame || 0) % 4) * (step / 4), col = o.forced ? T.k : T.w;
      for (let i = 0; i < n; i += 1) {
        const d = len[i]; if (d > cut) break;
        if (((d + ph) % step) >= 0.6) continue;
        const x = pts[i * 4], y = pts[i * 4 + 1], nx = pts[i * 4 + 2], ny = pts[i * 4 + 3], tx = ny, ty = -nx;
        for (let t = -hw; t <= hw + 1e-6; t += 0.5) for (const dd of [0, 0.7]) {
          const back = Math.abs(t) * 1.1 + dd, px = Math.floor(x + nx * t - tx * back + 0.5), py = Math.floor(y + ny * t - ty * back + 0.5);
          if (px < 0 || py < 0 || px >= w || py >= h) continue;
          const k = py * w + px; if (MASK[k] === 1) put(k, col, a);
        }
      }
    }
    // The front of a flow still under way: a bright ink-capped head.
    if (prog < 1 && cut > 0) {
      let i = 0; while (i < n - 1 && len[i + 1] <= cut) i++;
      const x = Math.floor(pts[i * 4] + 0.5), y = Math.floor(pts[i * 4 + 1] + 0.5), r = Math.max(1, Math.ceil(W / 2));
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const px = x + dx, py = y + dy; if (px < 0 || py < 0 || px >= w || py >= h) continue;
        const q = dx * dx + dy * dy; if (q > r * r + 1) continue;
        put(py * w + px, q > (r - 1) * (r - 1) + 0.5 ? T.k : T.l, a);
      }
    }
    for (const k of TOUCH) MASK[k] = 0; TOUCH.length = 0;
  }

  // ---------- cities ----------
  // 0 no number, 1 under 15k, 2 town to 80k, 3 city to 400k, 4 great city to 1M, 5 metropolis.
  const tier = p => !(p > 0) ? 0 : p > 1e6 ? 5 : p > 400000 ? 4 : p > 80000 ? 3 : p > 15000 ? 2 : 1;
  const TIER_NAME = ["size unknown", "under 15,000", "15,000 to 80,000", "80,000 to 400,000", "400,000 to a million", "over a million"];

  // ---------- choropleth under the sprites ----------
  // thematic = { key, ramp: [5 colours], step(realm) -> 0..4 | -1 (no data) | null (not a realm we colour), conf(realm)? -> 0..3,
  //              hi: step to emphasise or null }. The land turns to a monochrome relief so the ramp owns the hue channel;
  // each realm's step is washed in with an ordered dither and the relief's light and shade still show through.
  const G = { thematic: null, compare: null };
  function under(g) {
    const th = G.thematic; if (!th || !g.ids || !g.realms || (th.active && !th.active())) return;
    const { out, w, h, ids, cls, realms } = g, U0 = g.U0 || 0, V0 = g.V0 || 0;
    const steps = new Int8Array(realms.length + 1).fill(-2), cf = new Uint8Array(realms.length + 1);
    for (let n = 1; n <= realms.length; n++) { let s = null; try { s = th.step(realms[n - 1]); } catch (e) { s = null; } steps[n] = s == null ? -2 : s; cf[n] = th.conf ? th.conf(realms[n - 1]) || 0 : 0; }
    const R = th.ramp.map(rgbOf), mono = RAMP.mono.map(rgbOf), hi = th.hi;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = j * w + i, c = cls[k]; if (c <= 4 || c === 255) continue;   // sea, lakes and rivers keep their colour
      const o = out[k], r = o & 255, gg = (o >> 8) & 255, b = (o >> 16) & 255;
      const lum = (r * 0.3 + gg * 0.59 + b * 0.11) / 255;
      // Relief: the terrain's own light and shade on a five-step sepia ramp (ordered dither between steps).
      const t = Math.max(0, Math.min(3.999, (lum - 0.18) * 7.2)), lo = t | 0, u = i + U0, v = j + V0;
      const base = mono[lo + (t - lo > bayer(u, v) ? 1 : 0)];
      const n = ids[k], s = n > 0 ? steps[n] : -2;
      if (s === -2) { out[k] = pack(base); continue; }
      if (s === -1) { out[k] = pack(fogOn(u, v, 0.25) ? mix(base, VELLUM, 0.55) : base); continue; }   // no data: fog
      const edge = (i > 0 && ids[k - 1] !== n) || (i + 1 < w && ids[k + 1] !== n) || (j > 0 && ids[k - w] !== n) || (j + 1 < h && ids[k + w] !== n);
      const col = R[s];
      if (edge) { out[k] = pack(mix(col, INK, 0.55)); continue; }
      const shade = 0.72 + (lum - 0.45) * 0.9;                      // keep the hills: lighter and darker round the step colour
      const lit = shade >= 1 ? mix(col, [255, 240, 196], Math.min(0.5, shade - 1)) : mix(col, [24, 20, 40], Math.min(0.5, 1 - shade));
      const q = cf[n];
      let px = lit;
      if (q === HATCH && !hatchOn(u, v)) px = mix(lit, base, 0.55);
      else if (q === FOG && !fogOn(u, v, 0.45)) px = base;
      else if (q === 0 && bayer(u, v) >= 0.8) px = mix(lit, base, 0.5);   // a few relief pixels left showing in every 4x4
      if (hi != null && s !== hi) px = mix(px, base, 0.7);
      out[k] = pack(px);
    }
  }

  // ---------- compare two years, painted over the sprites ----------
  // compare = { year, ids: Int32Array (realm per art pixel for the other year, same frame as g), key, names: [n -> realm id] }
  // compare = { year, realms (the other year's), projection, active?() }; its id buffer is rasterised here once per view.
  function over(g) {
    const cmp = G.compare; if (!cmp || !cmp.realms || !g.ids || !g.realms || (cmp.active && !cmp.active())) return;
    const { out, w, h, ids, cls, realms } = g, U0 = g.U0 || 0, V0 = g.V0 || 0, other = cmp.realms;
    const key = [U0, V0, g.k, w, h].join();
    if (!cmp.ids || cmp.key !== key || cmp.of !== other) { cmp.ids = rasterise(other, cmp.projection, { k: g.k }, w, h, g.px, U0, V0); cmp.key = key; cmp.of = other; }
    const B = cmp.ids;
    const gain = rgbOf(LENS.power), ink = pack(INK);
    // A realm is the same power across years by its Living Atlas link (la: tsardom and empire are both Russia), else its id.
    const idOf = r => r.la || r.id || r.name, idA = n => n > 0 ? idOf(realms[n - 1]) : null, idB = n => n > 0 ? idOf(other[n - 1]) : null;
    // Renamed states (Spanish Empire then Kingdom of Spain) are the same power too: two realms are heirs when each is the
    // other's largest overlap and they share at least half of the smaller one. Counted once per view and year.
    if (cmp.heirKey !== key || cmp.heirOf !== realms) { cmp.heirs = heirs(ids, B, cls); cmp.heirKey = key; cmp.heirOf = realms; }
    const H = cmp.heirs, memo = new Map();
    for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
      const k = j * w + i; if (cls[k] <= 4 || cls[k] === 255) continue;
      const a = ids[k], b = B[k], u = i + U0, v = j + V0;
      // The other year's borders: a dotted ink line.
      if ((B[k + 1] !== b || B[k + w] !== b) && ((u + v) & 1) === 0) { out[k] = ink; continue; }
      const key = a * 65536 + b; let changed = memo.get(key);
      if (changed === undefined) { changed = idA(a) !== idB(b) && !H.has(key); memo.set(key, changed); }
      if (changed && ((u + v) & 3) === 0) out[k] = pack(mix(unpack(out[k]), gain, 0.8));
      else if (changed && ((u + v) & 3) === 1) out[k] = pack(mix(unpack(out[k]), INK, 0.35));
    }
  }
  function heirs(A, B, cls) {
    const pair = new Map(), na = new Map(), nb = new Map(), bestA = new Map(), bestB = new Map(), out = new Set();
    for (let k = 0; k < A.length; k++) {
      const a = A[k], b = B[k]; if (a <= 0 || b <= 0 || cls[k] <= 4 || cls[k] === 255) continue;
      const key = a * 65536 + b; pair.set(key, (pair.get(key) || 0) + 1); na.set(a, (na.get(a) || 0) + 1); nb.set(b, (nb.get(b) || 0) + 1);
    }
    pair.forEach((c, key) => {
      const a = Math.floor(key / 65536), b = key % 65536;
      if (!bestA.has(a) || c > pair.get(bestA.get(a))) bestA.set(a, key);
      if (!bestB.has(b) || c > pair.get(bestB.get(b))) bestB.set(b, key);
    });
    bestA.forEach((key, a) => {
      const b = key % 65536;
      if (bestB.get(b) === key && pair.get(key) * 2 >= Math.min(na.get(a), nb.get(b))) out.add(key);
    });
    return out;
  }
  // Rasterise a list of realms to an id buffer for the frame g came from (for compare).
  let RCV = null;
  function rasterise(realms, projection, t, w, h, px, U0, V0) {
    const cv = RCV || (RCV = document.createElement("canvas")); cv.width = w; cv.height = h;
    const c = cv.getContext("2d", { willReadFrequently: true });
    c.setTransform(t.k / px, 0, 0, t.k / px, -U0, -V0);
    const path = d3.geoPath(projection, c);
    realms.forEach((r, i) => { const n = i + 1; c.fillStyle = `rgb(${n & 255},${(n >> 8) & 255},${(n * 97 + 31) & 255})`; c.beginPath(); path(r.feature); c.fill(); });
    const d = c.getImageData(0, 0, w, h).data, ids = new Int32Array(w * h);
    for (let k = 0; k < w * h; k++) {
      const al = d[k * 4 + 3]; if (al < 250) { if (al > 0) ids[k] = -1; continue; }
      const n = d[k * 4] | d[k * 4 + 1] << 8;
      if (n && ((n * 97 + 31) & 255) === d[k * 4 + 2] && n <= realms.length) ids[k] = n; else ids[k] = -1;
    }
    // Anti-aliased edge pixels take the id of a clean neighbour (as pixelmap.js does for the year on the map).
    for (let k = 0; k < w * h; k++) if (ids[k] === -1) ids[k] = k > 0 && ids[k - 1] > 0 ? ids[k - 1] : k >= w && ids[k - w] > 0 ? ids[k - w] : 0;
    return ids;
  }

  global.PixelGrammar = {
    LENS, LENS_DARK, FAMILY, RAMP, CONF_NAME, SOLID, HATCH, DASH, FOG, TIER_NAME,
    conf, flowWidth, ribbon, tier, under, over, rasterise, tones, bayer, hatchOn, fogOn, rgbOf,
    get thematic() { return G.thematic; }, set thematic(v) { G.thematic = v || null; },
    get compare() { return G.compare; }, set compare(v) { G.compare = v || null; },
    familyColor: id => LENS[FAMILY[id] || id] || null,
  };
})(typeof window !== "undefined" ? window : globalThis);
