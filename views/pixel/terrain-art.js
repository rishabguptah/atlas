// Terrain art for the pixel map: biome ramps, quiet water, coasts, forest canopies, mountain ranges, dunes, tundra
// ponds, terraces, river ribbons and landmark peaks, painted into the art-pixel grid from the sampled terrain classes.
// pixelmap.js calls it once per render (zoom end); year steps never repaint terrain. See SPEC.md ("Terrain art").
//
//   PixelTerrainArt.paint(S) -> { anim }
//     S: { w, h, U0, V0, need (degrees per art pixel), cls, hs, band, elev (metres, float), latA, lonA, riv (1 river, 2 great
//          river), base (Uint32 RGBA, written), mood, l0 (decoded L0 tile, for the climate grid), toPx(lon, lat) -> [i, j] }
//     anim: per pixel 1 = foam, 2 = wave glyph, 3 = river, 4 = volcano smoke (the motion layer palette-cycles these).
//   PixelTerrainArt.LANDMARKS   bespoke mountains [{ name, lon, lat, kind, tier, ... }]
(function (global) {
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => v / 16 - 0.47);
  const hash = (u, v) => { let h = (u * 374761393 + v * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const pack = ([r, g, b]) => (255 << 24 | b << 16 | g << 8 | r) >>> 0;
  // Smooth value noise on the integer lattice, 0..1.
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }

  // Tileable noise: value noise on a wrapped lattice, baked once into a small tile and read by (u mod T, v mod T),
  // so per-pixel noise costs an array read. sx, sy = feature size in pixels; n = lattice cells per tile side.
  function noiseTile(sx, sy, n, seed) {
    const TW = sx * n, TH = sy * n, t = new Float32Array(TW * TH), L = (a, b) => hash(((a % n) + n) % n + seed, ((b % n) + n) % n + seed * 7);
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
      const fx = x / sx, fy = y / sy, xi = Math.floor(fx), yi = Math.floor(fy), ax = fx - xi, ay = fy - yi;
      const kx = ax * ax * (3 - 2 * ax), ky = ay * ay * (3 - 2 * ay), a = L(xi, yi), b = L(xi + 1, yi), c = L(xi, yi + 1), d = L(xi + 1, yi + 1);
      t[y * TW + x] = a + (b - a) * kx + (c - a) * ky + (a - b - c + d) * kx * ky;
    }
    const at = (u, v) => t[(((v % TH) + TH) % TH) * TW + (((u % TW) + TW) % TW)];
    return at;
  }
  const NB = noiseTile(13, 11, 6, 3), NG = noiseTile(5, 4, 11, 19), NSEA = noiseTile(37, 21, 4, 41), NGLADE = noiseTile(9, 8, 8, 77);

  // ---------- ramps ----------
  // Ramp ids index RAMP (packed five-tone arrays) so per-pixel arrays can hold them as bytes.
  const NAMES = ["deep", "sea", "shelf", "shore", "lake", "river", "tundra", "taiga", "forest", "forest_med", "jungle", "grass", "grass_med",
    "grass_monsoon", "steppe", "savanna", "prairie", "steppe_outback", "sand", "sand_arabia", "sand_gobi", "sand_outback", "rock_desert",
    "rock_outback", "wetland", "rock", "alpine", "snow", "ice", "beach", "paddy", "irrigated", "cliff"];
  const ID = Object.fromEntries(NAMES.map((n, i) => [n, i]));
  let RAMP = null, RAMP_SRC = null, FOAM = 0, INK = 0;
  function ramps() {
    const P = global.PIXEL_PALETTE;
    if (RAMP_SRC === P.RAMPS) return RAMP;
    RAMP_SRC = P.RAMPS;
    RAMP = NAMES.map(n => Uint32Array.from((P.RAMPS[n] || P.RAMPS.grass).map(c => pack(rgb(c)))));
    FOAM = pack(rgb("#d4e6dc")); INK = pack(rgb("#2c2630"));
    return RAMP;
  }

  // ---------- regions (regional biome palettes) ----------
  // Boxes [lon0, lat0, lon1, lat1]. A pixel is inside when its distance into the box beats a dithered threshold, so
  // regions meet in a few pixels of dither rather than a hard seam.
  const REG = {
    med: [[-10, 30, 42, 46], [-124, 31, -114, 41], [-74, -38, -69, -29], [17, -35, 23, -32], [113, -36, 123, -30]],
    aus: [[112, -40, 155, -10]],
    afr: [[-18, -30, 52, 17]],
    arab: [[34, 12, 60, 33]],
    gobi: [[70, 35, 125, 50]],
    monsoon: [[98, 18, 142, 42], [68, 6, 98, 30], [92, -10, 125, 18]],
    terraces: [[100, 18, 122, 33], [117, 18, 125, 26], [95, -9, 125, 22], [128, 30, 142, 38], [-80, -18, -68, -5], [80, 26, 92, 30]],
    nam: [[-112, 30, -90, 55]],
  };
  function inReg(boxes, lon, lat, edge) {
    for (const b of boxes) if (Math.min(lon - b[0], b[2] - lon, lat - b[1], b[3] - lat) > edge) return true;
    return false;
  }
  // Irrigated green against the desert: river valleys, deltas and oases (ellipses lon, lat, rx, ry in degrees).
  const GREEN = [
    [31.0, 30.85, 1.25, 0.55, "Nile delta"], [30.7, 29.35, 0.3, 0.18, "Fayum"], [45.2, 32.4, 1.7, 0.9, "Mesopotamian alluvium"],
    [44.4, 33.3, 0.6, 0.35, "Baghdad"], [68.2, 24.6, 0.7, 0.5, "Indus delta"], [72.5, 30.6, 1.6, 0.8, "Punjab"],
    [64.6, 39.7, 1.2, 0.35, "Zeravshan (Bukhara, Samarkand)"], [71.6, 40.7, 1.4, 0.45, "Ferghana"], [61.8, 37.6, 0.4, 0.3, "Merv"],
    [89.2, 42.9, 0.35, 0.18, "Turpan"], [76.0, 39.45, 0.4, 0.25, "Kashgar"], [79.9, 37.1, 0.4, 0.2, "Khotan"], [25.5, 29.2, 0.25, 0.12, "Siwa"],
    [30.5, 25.4, 0.25, 0.3, "Kharga"], [36.4, 33.5, 0.3, 0.18, "Ghouta (Damascus)"], [-7.99, 31.6, 0.4, 0.25, "Haouz (Marrakesh)"],
    [51.7, 32.6, 0.4, 0.25, "Isfahan"], [43.0, 36.3, 0.5, 0.3, "Assyria"], [-114.5, 32.8, 0.6, 0.4, "Colorado delta"],
    [39.6, 24.5, 0.2, 0.15, "Medina"], [45.1, 2.1, 0.4, 0.3, "Shabelle"], [32.5, 15.6, 0.3, 0.4, "Gezira"], [-69.9, -16.4, 0.01, 0.01, ""],
  ];

  // Climate grid: the dominant open-ground biome (classes 6..14) per 1 degree cell, read from L0, so hills and
  // mountain slopes below the treeline wear the land around them (green Alps valleys, tan Zagros, forested Appalachians).
  let CLIM = null, CLIM_SRC = null;
  function climate(l0) {
    if (!l0 || !l0.data) return null;
    if (CLIM_SRC === l0) return CLIM;
    const W = 360, H = 180, g = new Uint8Array(W * H), sx = l0.w / W, sy = l0.h / H, cnt = new Int32Array(18);
    for (let gy = 0; gy < H; gy++) for (let gx = 0; gx < W; gx++) {
      cnt.fill(0);
      for (let y = Math.floor(gy * sy); y < Math.floor((gy + 1) * sy); y++) for (let x = Math.floor(gx * sx); x < Math.floor((gx + 1) * sx); x++) {
        const c = l0.data[(y * l0.w + x) * 4]; if (c >= 6 && c <= 14) cnt[c]++;
      }
      let best = 0, bn = 0; for (let c = 6; c <= 14; c++) if (cnt[c] > bn) { bn = cnt[c]; best = c; }
      g[gy * W + gx] = best;
    }
    // Cells that are all mountain take the nearest biome around them.
    for (let pass = 0; pass < 30; pass++) {
      let left = 0; const prev = g.slice();
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const k = y * W + x; if (prev[k]) continue;
        const n = prev[y * W + (x + 1) % W] || prev[y * W + (x + W - 1) % W] || (y > 0 && prev[k - W]) || (y < H - 1 && prev[k + W]);
        if (n) g[k] = n; else left++;
      }
      if (!left) break;
    }
    CLIM_SRC = l0; CLIM = g;
    return g;
  }
  const climAt = (g, lon, lat) => g ? g[Math.min(179, Math.max(0, Math.floor(90 - lat))) * 360 + Math.min(359, Math.max(0, Math.floor(lon + 180)))] || 10 : (Math.abs(lat) > 58 ? 7 : 10);

  // Snowline and treeline in metres by latitude (glaciers sit lower toward the poles; the dry subtropics hold snow higher).
  const SNOW = [[0, 4800], [20, 5000], [30, 5300], [36, 5400], [41, 4200], [46, 3000], [55, 1900], [65, 900], [72, 200], [90, 0]];
  function snowline(lat) {
    const a = Math.abs(lat);
    for (let i = 1; i < SNOW.length; i++) if (a <= SNOW[i][0]) { const [a0, s0] = SNOW[i - 1], [a1, s1] = SNOW[i]; return s0 + (s1 - s0) * (a - a0) / (a1 - a0); }
    return 0;
  }

  // ---------- small sprites (text grids; letters pick ramp tones, see stampG) ----------
  // Crowns: a = highlight, b = lit, c = shade; the dark gaps between crowns come from the fill below them.
  const CROWN = {
    // deciduous (temperate), by tier
    8: [null, [".a.", "abb", ".c."], [".aab.", "aabbc", "abbcc", ".bcc."], ["..aab..", ".aaabbc", "aaabbbc", "abbbbcc", ".bbbccc", "..ccc.."]],
    // conifer (taiga)
    7: [null, [".a.", "ab.", "abc", ".c."], ["..a..", ".ab..", ".abb.", "aabbc", ".bcc."], ["...a...", "..ab...", "..abb..", ".aabbc.", ".abbbc.", "aabbbcc", ".bbccc."]],
    // tropical
    9: [null, [".ab.", "abbc", ".cc."], [".aab.a.", "aabbabb", "abbbbbc", ".bccbcc", "..c.cc."], ["..aab.aab.", ".aabbbabbc", "aabbbbbbbc", "abbbbcbbcc", ".bbccbccc.", "..cc..cc.."]],
  };
  const CROWN_STEP = { 7: [null, [3, 2], [4, 3], [5, 4]], 8: [null, [3, 2], [4, 3], [6, 4]], 9: [null, [3, 2], [5, 3], [7, 4]] };
  const DUNE = [null, [".aab", "a..c"], ["..aab.", ".a..bc", "a....c"], ["...aaab..", "..a...bc.", ".a.....cc", "a.......c"]];
  const MESA = [null, ["ab"], [".ab.", "abcc"], [".aab..", "abbbc.", "bbcccc"]];
  const TUFT = [null, ["a.a"], ["a.a", ".a."], ["a.a.a", ".aa.."]];
  const ACACIA = [null, ["aaa", ".t."], [".aaaa.", "abbbbc", "...t.."], [".aaaaa..", "aabbbbbc", ".ccc.cc.", "....t..."]];
  const POND = [null, ["ab"], [".ab", "abb"], [".aab.", "aabbb", ".bbb."]];
  const WAVE = [[".a.", "a.a"], [".aa.", "a..a"], ["..aa..", ".a..a.", "a....a"], ["...aa...", ".aa..aa.", "a......a"]];

  // ---------- peaks: generated, cached ----------
  // A peak is a flat list of [dx, dy, tone, kind] with kind 0 = rock, 1 = snow, 2 = outline; (0, 0) is the middle of
  // its base. Lit from the upper left: the face left of the ridge is light (brightest along the ridge), the right face
  // is in shadow, and an ink outline closes both flanks so each summit reads on its own inside a range.
  const peakCache = new Map();
  function peak(W, H, apex, snowRows, seed) {
    const key = W + "," + H + "," + apex + "," + snowRows + "," + seed;
    let p = peakCache.get(key); if (p) return p;
    p = [];
    const L = [], R = [];
    // Flanks: straight to slightly concave, with a one-pixel step here and there so no two summits match.
    const cl = 1 + hash(seed, 1) * 0.35, cr = 1 + hash(seed, 2) * 0.35;
    for (let y = 0; y < H; y++) {
      const f = y / Math.max(1, H - 1);
      const jl = y > 1 && y < H - 1 && hash(seed + y, 3) < 0.25 ? 1 : 0, jr = y > 1 && y < H - 1 && hash(seed + y, 7) < 0.25 ? 1 : 0;
      L.push(Math.round(apex - apex * Math.pow(f, cl)) + jl);
      R.push(Math.round(apex + (W - 1 - apex) * Math.pow(f, cr)) - jr);
    }
    for (let y = 1; y < H; y++) { L[y] = Math.min(L[y], L[y - 1]); R[y] = Math.max(R[y], R[y - 1]); }
    const ridgeAt = y => apex + Math.round(y * (0.25 + hash(seed, 5) * 0.2));
    const snowAt = x => snowRows + (Math.abs(x - apex) < 2 ? 1 : 0) + (hash(seed + x, 11) < 0.4 ? 1 : 0) - (hash(seed + x, 13) < 0.25 ? 1 : 0);
    for (let y = 0; y < H; y++) for (let x = L[y]; x <= R[y]; x++) {
      const ridge = ridgeAt(y), right = x > ridge;
      const outL = x === L[y] || (y > 0 && x < L[y - 1]), outR = x === R[y] || (y > 0 && x > R[y - 1]);
      const snowy = y < snowAt(x);
      let tone, kind = snowy ? 1 : 0;
      if (y === 0 || outR) { tone = snowy ? 0 : 0; kind = snowy ? 1 : 2; }
      else if (outL) { tone = snowy ? 1 : 1; kind = snowy ? 1 : 2; }
      else if (snowy) tone = right ? (x === ridge + 1 ? 1 : 2) : 4;
      else if (right) tone = x === ridge + 1 ? 0 : x >= R[y] - 1 ? 0 : 1;
      else {
        tone = x >= ridge - 1 ? 4 : x <= L[y] + 1 ? 2 : 3;
        // a gully or two running down the lit face
        if (y > 1 && hash(seed * 3 + x + y, 17) < 0.1) tone = 2;
      }
      p.push(x - (W >> 1), y - (H - 1), tone, kind);
    }
    peakCache.set(key, p);
    return p;
  }

  // A hill: a low rounded dome, lit top-left, shaded and outlined on the right, drawn in the ground's own ramp.
  const hillCache = new Map();
  function hill(W, H, seed) {
    const key = W + "," + H + "," + seed; let p = hillCache.get(key); if (p) return p;
    p = [];
    const c = (W - 1) / 2 + (hash(seed, 1) - 0.5);
    for (let y = 0; y < H; y++) {
      const f = (H - y - 0.35) / H, hw = Math.round(((W - 1) / 2) * Math.sqrt(Math.max(0, 1 - f * f)));
      for (let x = Math.round(c - hw); x <= Math.round(c + hw); x++) {
        const right = x > c + (y < 1 ? 0 : -0.5), edgeR = x === Math.round(c + hw), top = y === 0;
        const tone = edgeR ? 0 : right ? 1 : top || x === Math.round(c - hw) + 1 ? 4 : 3;
        p.push(x - (W >> 1), y - (H - 1), tone, edgeR ? 2 : 0);
      }
    }
    hillCache.set(key, p); return p;
  }

  // ---------- landmarks ----------
  // Bespoke mountains, drawn instead of generated peaks near them. kind: cone (volcano or stratovolcano), massif, monolith,
  // table, horn. tier = first zoom tier they appear at (0 world .. 3 close); size grows with the tier.
  const LANDMARKS = [
    { name: "Everest", lon: 86.925, lat: 27.988, kind: "massif", tier: 1, h: [0, 9, 13, 18], snow: 0.55 },
    { name: "K2", lon: 76.513, lat: 35.881, kind: "horn", tier: 2, h: [0, 8, 12, 16], snow: 0.6 },
    { name: "Kangchenjunga", lon: 88.147, lat: 27.703, kind: "massif", tier: 2, h: [0, 8, 11, 15], snow: 0.5 },
    { name: "Kailash", lon: 81.311, lat: 31.067, kind: "dome", tier: 2, h: [0, 6, 9, 12], snow: 0.7 },
    { name: "Fuji", lon: 138.727, lat: 35.361, kind: "cone", tier: 1, h: [0, 7, 10, 14], snow: 0.35 },
    { name: "Kilimanjaro", lon: 37.353, lat: -3.076, kind: "cone", tier: 0, h: [5, 7, 10, 13], snow: 0.2, flat: 0.35 },
    { name: "Mount Kenya", lon: 37.307, lat: -0.152, kind: "horn", tier: 2, h: [0, 6, 8, 11], snow: 0.3 },
    { name: "Etna", lon: 14.995, lat: 37.751, kind: "cone", tier: 1, h: [0, 6, 9, 12], snow: 0.2, smoke: 1, dark: 1 },
    { name: "Vesuvius", lon: 14.426, lat: 40.821, kind: "cone", tier: 2, h: [0, 5, 7, 9], snow: 0, smoke: 1, dark: 1, flat: 0.25 },
    { name: "Ararat", lon: 44.298, lat: 39.702, kind: "cone", tier: 1, h: [0, 7, 10, 13], snow: 0.4, twin: 1 },
    { name: "Damavand", lon: 52.109, lat: 35.952, kind: "cone", tier: 2, h: [0, 7, 9, 12], snow: 0.35 },
    { name: "Elbrus", lon: 42.439, lat: 43.349, kind: "cone", tier: 2, h: [0, 7, 9, 12], snow: 0.55, twin: 1 },
    { name: "Olympus", lon: 22.358, lat: 40.086, kind: "massif", tier: 2, h: [0, 6, 8, 11], snow: 0.25 },
    { name: "Mont Blanc", lon: 6.865, lat: 45.833, kind: "dome", tier: 2, h: [0, 7, 9, 12], snow: 0.6 },
    { name: "Matterhorn", lon: 7.659, lat: 45.976, kind: "horn", tier: 3, h: [0, 0, 9, 13], snow: 0.35 },
    { name: "Teide", lon: -16.642, lat: 28.272, kind: "cone", tier: 2, h: [0, 6, 8, 11], snow: 0.15 },
    { name: "Hekla", lon: -19.666, lat: 63.983, kind: "cone", tier: 2, h: [0, 5, 7, 9], snow: 0.4, smoke: 1 },
    { name: "Sinai", lon: 33.975, lat: 28.539, kind: "massif", tier: 2, h: [0, 5, 7, 10], snow: 0, red: 1 },
    { name: "Denali", lon: -151.007, lat: 63.069, kind: "massif", tier: 1, h: [0, 8, 11, 15], snow: 0.6 },
    { name: "Rainier", lon: -121.76, lat: 46.853, kind: "cone", tier: 2, h: [0, 6, 9, 12], snow: 0.55 },
    { name: "Popocatepetl", lon: -98.622, lat: 19.023, kind: "cone", tier: 1, h: [0, 6, 9, 12], snow: 0.3, smoke: 1 },
    { name: "Chimborazo", lon: -78.817, lat: -1.469, kind: "cone", tier: 2, h: [0, 7, 9, 12], snow: 0.45 },
    { name: "Cotopaxi", lon: -78.437, lat: -0.677, kind: "cone", tier: 2, h: [0, 6, 9, 12], snow: 0.4, smoke: 1 },
    { name: "Aconcagua", lon: -70.011, lat: -32.653, kind: "massif", tier: 1, h: [0, 8, 11, 15], snow: 0.5 },
    { name: "Uluru", lon: 131.036, lat: -25.345, kind: "monolith", tier: 1, h: [0, 3, 4, 6] },
    { name: "Table Mountain", lon: 18.403, lat: -33.963, kind: "table", tier: 2, h: [0, 4, 5, 7] },
    { name: "Mount Cook", lon: 170.142, lat: -43.595, kind: "horn", tier: 2, h: [0, 7, 9, 12], snow: 0.5 },
    { name: "Ruwenzori", lon: 29.872, lat: 0.386, kind: "massif", tier: 3, h: [0, 0, 8, 11], snow: 0.25 },
    { name: "Tai Shan", lon: 117.1, lat: 36.25, kind: "massif", tier: 3, h: [0, 0, 7, 9], snow: 0 },
    { name: "Krakatoa", lon: 105.423, lat: -6.102, kind: "cone", tier: 3, h: [0, 0, 6, 8], snow: 0, smoke: 1, dark: 1 },
  ];
  // Landmark sprite: same [dx, dy, tone, kind] list as peaks; kind 3 = smoke, 4 = red rock.
  const lmCache = new Map();
  function landmark(L, tier) {
    const H = L.h[tier]; if (!H) return null;
    const key = L.name + tier; let p = lmCache.get(key); if (p) return p;
    p = [];
    const put = (x, y, tone, kind) => p.push(x, y, tone, kind);
    if (L.kind === "monolith" || L.kind === "table") {
      // A long rock with a rounded (Uluru) or flat (Table Mountain) top, cliffs lit from the left.
      const W = L.kind === "monolith" ? H * 3 + 2 : H * 4;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const inset = L.kind === "monolith" ? (y === 0 ? 2 : y === 1 ? 1 : 0) : (y === 0 ? 1 : 0);
        if (x < inset || x >= W - inset) continue;
        const edge = x === inset || x === W - 1 - inset || y === 0;
        const tone = edge ? (x > W / 2 || y === 0 && x > W / 2 ? 0 : 3) : y === 1 ? 4 : x > W * 0.62 ? 1 : hash(x, y * 7) < 0.18 ? 1 : 2 + (y < H / 2 ? 1 : 0);
        put(x - (W >> 1), y - (H - 1), tone, L.kind === "monolith" ? 4 : 0);
      }
      L.kind === "table" && [0, 1, 2].forEach(i => put(-1 + i * 2 - 2 * H, -H + 1, 4, 5)); // tablecloth cloud
      lmCache.set(key, p); return p;
    }
    const W = L.kind === "cone" ? H * 2 + 3 : L.kind === "horn" ? Math.round(H * 1.3) + 1 : H * 2 + 1;
    const apex = L.kind === "horn" ? Math.round(W * 0.42) : W >> 1;
    const flat = L.flat ? Math.max(1, Math.round(W * L.flat / 2)) : L.kind === "dome" ? 1 : 0;
    const snowRows = Math.round(H * (L.snow || 0));
    if (L.twin) { // the lesser summit, behind and to the right of the great one (Little Ararat, Elbrus's east peak)
      const h2 = Math.round(H * 0.6), a2 = Math.round(W * 0.78);
      for (let y = 0; y < h2; y++) { const half = Math.round(y * 1.15); for (let x = a2 - half; x <= a2 + half; x++) put(x - apex, y - (h2 - 1), x === a2 + half ? 0 : x > a2 ? 1 : 3, x === a2 + half ? 2 : y < 2 && L.snow ? 1 : 0); }
    }
    for (let y = 0; y < H; y++) {
      const f = y / (H - 1);
      // Cones curve (concave flanks), horns are steep, massifs are broad with a shoulder.
      const sh = L.kind === "cone" ? Math.pow(f, 1.6) : L.kind === "horn" ? Math.pow(f, 1.25) : f;
      const xl = Math.round(apex - flat - (apex - flat) * sh), xr = Math.round(apex + flat + (W - 1 - apex - flat) * sh);
      for (let x = xl; x <= xr; x++) {
        const right = x > apex + (L.kind === "horn" ? 0 : Math.round(y * 0.2)), edge = x === xl || x === xr || y === 0;
        const se = snowRows + (hash(x, 31) < 0.4 ? 1 : 0) + (L.kind === "cone" && (x & 1) && y < snowRows + 3 && hash(x, 5) < 0.6 ? 2 : 0);
        let tone, kind = L.red ? 4 : 0;
        if (edge && (right || y === 0)) { tone = 0; kind = 2; }
        else if (y < se) { kind = 1; tone = right ? 1 : edge ? 3 : 4; }
        else tone = right ? (x === xr - 1 ? 0 : 1) : edge ? 2 : x > apex - 2 ? 4 : 3;
        if (L.dark && kind === 0) tone = Math.max(0, tone - 1);
        put(x - apex, y - (H - 1), tone, kind);
      }
    }
    if (L.smoke) for (let y = 1; y <= Math.max(2, H >> 1); y++) { const x = Math.round(Math.sin(y * 0.9) * 1.2) + (y >> 1); put(x, -(H - 1) - y, y & 1 ? 3 : 4, 3); if (y > 2) put(x + 1, -(H - 1) - y, 4, 3); }
    lmCache.set(key, p); return p;
  }

  // ---------- paint ----------
  function paint(S) {
    const { w, h, U0, V0, need, cls, hs, band, latA, lonA, base } = S;
    const elev = S.elev || null, riv = S.riv || null, mood = S.mood || "day";
    const TM = [performance.now()];
    const N = w * h, tier = need > 0.4 ? 0 : need > 0.15 ? 1 : need > 0.06 ? 2 : 3;
    const RM = ramps(), anim = new Uint8Array(N), clim = climate(S.l0);
    const D = (i, j) => BAYER[((V0 + j) & 3) * 4 + ((U0 + i) & 3)];
    const edgeDeg = Math.max(0.25, need * 5);
    const isLandC = c => c >= 4 && c !== 255;

    TM.push(performance.now());
    // 1. Clean speckle: a land pixel that matches at most one of its eight neighbours takes the local majority.
    const cnt = new Int16Array(18), src = cls.slice();
    for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
      const k = j * w + i, c = src[k]; if (c < 5 || c === 255) continue;
      let same = 0; cnt.fill(0);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue; const q = src[k + dj * w + di]; if (q === c) same++; else if (q >= 5 && q !== 255) cnt[q]++;
      }
      if (same >= 2) continue;
      let best = c, bn = 2; for (let q = 5; q < 18; q++) if (cnt[q] > bn) { bn = cnt[q]; best = q; }
      cls[k] = best;
    }

    TM.push(performance.now());
    // 2. Smoothed light and height: a [1 2 1] blur (twice when zoomed out, where the source is busier than the grid), so
    // slopes read as shapes, not grain.
    function blur(src, passes) {
      let a = Float32Array.from(src), t = new Float32Array(N);
      for (let p = 0; p < passes; p++) {
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const k = j * w + i; t[k] = ((i > 0 ? a[k - 1] : a[k]) + 2 * a[k] + (i < w - 1 ? a[k + 1] : a[k])) * 0.25; }
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const k = j * w + i; a[k] = ((j > 0 ? t[k - w] : t[k]) + 2 * t[k] + (j < h - 1 ? t[k + w] : t[k])) * 0.25; }
      }
      return a;
    }
    const lit = blur(hs, tier <= 1 ? 2 : 1);
    for (let k = 0; k < N; k++) lit[k] -= 128;
    const el = blur(elev || Float32Array.from(band, b => b * 25), 2);
    for (let k = 0; k < N; k++) if (cls[k] <= 3) el[k] = 0;

    TM.push(performance.now());
    // 3. Ground: a ramp per pixel (gR), an effective biome (gC) and a tone 0..4 (tn).
    const gR = new Uint8Array(N), gC = new Uint8Array(N), tn = new Int8Array(N), mn = new Float32Array(N);
    const winter = mood === "winter";
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = j * w + i, c = cls[k]; if (c === 255) continue;
      const u = U0 + i, v = V0 + j, d = D(i, j), lon = lonA[k], lat = latA[k];
      // Two octaves of screen-anchored noise: big soft patches plus a little grain.
      const nb = NB(u, v) - 0.5, n = nb * 0.65 + (NG(u, v) - 0.5) * 0.35;
      mn[k] = n;
      if (c <= 3) { gC[k] = c; continue; }
      let g = c;
      if (c === 4) g = climAt(clim, lon, lat);
      const e = el[k];
      if (c >= 15) {
        // Elevation zones: the local biome below the treeline, bare rock above it, snow above the snowline.
        const sl = snowline(lat) + n * 400, tl = sl - (Math.abs(lat) < 25 ? 1300 : 1000);
        const ed = e + d * 50;
        if (c === 17) g = ed > sl - 150 ? 17 : 16;
        else if (c === 16) g = ed > sl ? 17 : ed > tl ? 16 : climAt(clim, lon, lat);
        else g = ed > sl ? 17 : ed > tl + 300 ? 16 : climAt(clim, lon, lat);
      }
      if (winter && g !== 17 && g !== 16 && Math.abs(lat) > 47 + n * 8 - Math.max(0, e - 500) * 0.004 + d * 2.5) g = g === 7 || g === 8 || g === 9 ? g : 5;
      let r;
      switch (g) {
        case 5: r = ID.ice; break;
        case 6: r = ID.tundra; break;
        case 7: r = ID.taiga; break;
        case 8: r = inReg(REG.med, lon, lat, d * edgeDeg) ? ID.forest_med : ID.forest; break;
        case 9: r = ID.jungle; break;
        case 10: r = inReg(REG.med, lon, lat, d * edgeDeg) ? ID.grass_med : inReg(REG.monsoon, lon, lat, d * edgeDeg) ? ID.grass_monsoon : ID.grass; break;
        case 11: r = inReg(REG.aus, lon, lat, d * edgeDeg) ? ID.steppe_outback : inReg(REG.afr, lon, lat, d * edgeDeg) ? ID.savanna : inReg(REG.nam, lon, lat, d * edgeDeg) ? ID.prairie : ID.steppe; break;
        case 12: r = inReg(REG.aus, lon, lat, d * edgeDeg) ? ID.sand_outback : inReg(REG.arab, lon, lat, d * edgeDeg) ? ID.sand_arabia : inReg(REG.gobi, lon, lat, d * edgeDeg) ? ID.sand_gobi : ID.sand; break;
        case 13: r = inReg(REG.aus, lon, lat, d * edgeDeg) ? ID.rock_outback : ID.rock_desert; break;
        case 14: r = ID.wetland; break;
        // bare ground above the treeline: alpine steppe where it is level (the Tibetan plateau, the Altiplano), rock on slopes
        case 16: r = Math.abs(lit[k]) < 9 + d * 4 && e > 2500 ? ID.alpine : ID.rock; break;
        case 17: r = ID.snow; break;
        default: r = ID.grass;
      }
      gR[k] = r; gC[k] = g;
      // Tone: light from the hillshade, soft patches from the noise, dithered only near the steps between tones.
      const steep = g >= 16 ? 1 / 17 : c === 15 ? 1 / 22 : 1 / 28;
      // Deserts, ice and snow stay calm: only the big soft octave, little dither.
      const calm = g === 12 || g === 13 || g === 5 || g === 17;
      // Bare rock sits a tone darker so the lit faces of the peaks drawn on it stand out.
      tn[k] = Math.max(0, Math.min(4, Math.round((r === ID.rock ? 1.5 : 2) + lit[k] * steep + (calm ? nb * 0.4 + d * 0.3 : n * 0.85 + d * 0.55))));
    }

    TM.push(performance.now());
    // 4. Rivers: arid land beside a river turns irrigated green (the Nile's ribbon), wider as you zoom; oases and deltas too.
    const rib = [1, 1, 2, 3][tier];
    let ring = new Uint8Array(N);
    for (let k = 0; k < N; k++) if (cls[k] === 4) ring[k] = 1;
    for (let r = 1; r <= rib; r++) {
      const nx = ring.slice();
      for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
        const k = j * w + i; if (ring[k] || !(ring[k - 1] || ring[k + 1] || ring[k - w] || ring[k + w])) continue;
        nx[k] = r + 1;
      }
      ring = nx;
    }
    const arid = g => g === 11 || g === 12 || g === 13;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = j * w + i, g = gC[k]; if (cls[k] <= 4 || cls[k] === 255) continue;
      const rr = ring[k];
      if (rr > 1 && arid(g) && !(rr === rib + 1 && rib > 1 && ((U0 + i + V0 + j) & 1))) { gR[k] = ID.irrigated; gC[k] = 10; continue; }
      if (rr > 1 && tier >= 2 && rr === 2 && g !== 16 && g !== 17) tn[k] = Math.max(0, tn[k] - 1);
    }
    if (tier >= 1) for (const [glon, glat, rx, ry] of GREEN) {
      const p = S.toPx(glon, glat); if (!p) continue;
      const pxR = rx / need + 2, pyR = ry / need + 2;
      for (let j = Math.max(0, Math.floor(p[1] - pyR)); j < Math.min(h, p[1] + pyR); j++) for (let i = Math.max(0, Math.floor(p[0] - pxR)); i < Math.min(w, p[0] + pxR); i++) {
        const k = j * w + i; if (!arid(gC[k]) || cls[k] >= 15) continue;
        const dx = (lonA[k] - glon) / rx, dy = (latA[k] - glat) / ry;
        if (dx * dx + dy * dy + mn[k] * 0.5 + D(i, j) * 0.25 < 1) { gR[k] = ID.irrigated; gC[k] = 10; }
      }
    }

    TM.push(performance.now());
    // 5. Biome seams: one (two, close in) dithered pixel where open ground meets other ground, like an autotile edge.
    const FOREST = g => g >= 7 && g <= 9;
    const swap = new Uint8Array(N);
    for (let j = 0; j < h - 2; j++) for (let i = 0; i < w - 2; i++) {
      const k = j * w + i, a = gR[k], g = gC[k]; if (g <= 4 || FOREST(g)) continue;
      const chk = (U0 + i + V0 + j) & 1;
      const r1 = gR[k + 1], d1 = gR[k + w];
      if (gC[k + 1] > 4 && !FOREST(gC[k + 1]) && r1 !== a && chk) swap[k] = r1 + 1;
      else if (gC[k + w] > 4 && !FOREST(gC[k + w]) && d1 !== a && chk) swap[k] = d1 + 1;
      else if (tier >= 2 && D(i, j) > 0.2) {
        const r2 = gR[k + 2], d2 = gR[k + 2 * w];
        if (gC[k + 2] > 4 && !FOREST(gC[k + 2]) && r2 !== a) swap[k] = r2 + 1;
        else if (gC[k + 2 * w] > 4 && !FOREST(gC[k + 2 * w]) && d2 !== a) swap[k] = d2 + 1;
      }
    }
    for (let k = 0; k < N; k++) if (swap[k]) gR[k] = swap[k] - 1;

    TM.push(performance.now());
    // 6. Water: distance to the coast (chamfer, capped), then quiet two-tone seas, a shelf band, shore light and foam.
    const DMAX = 8, dist = new Uint8Array(N);
    for (let k = 0; k < N; k++) dist[k] = cls[k] <= 3 ? DMAX : 0;
    // A lip under southern coasts: the land's cliff face seen from above, one pixel (two on high coasts), once zoomed in.
    const lip = new Uint8Array(N);
    if (tier >= 1) for (let j = 1; j < h; j++) for (let i = 0; i < w; i++) {
      const k = j * w + i, n = k - w; if (cls[k] > 2 || !isLandC(cls[n]) || cls[n] === 4 || gC[n] === 5) continue;
      lip[k] = 1; dist[k] = 0;
      if (tier >= 2 && band[n] > 16 && j + 1 < h && cls[k + w] <= 2) { lip[k + w] = 2; dist[k + w] = 0; }
    }
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const k = j * w + i; if (!dist[k]) continue; let m = dist[k]; if (i > 0) m = Math.min(m, dist[k - 1] + 1); if (j > 0) m = Math.min(m, dist[k - w] + 1); dist[k] = m; }
    for (let j = h - 1; j >= 0; j--) for (let i = w - 1; i >= 0; i--) { const k = j * w + i; if (!dist[k]) continue; let m = dist[k]; if (i < w - 1) m = Math.min(m, dist[k + 1] + 1); if (j < h - 1) m = Math.min(m, dist[k + w] + 1); dist[k] = m; }
    const shoreBand = tier === 0 ? 2 : 3;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = j * w + i, c = cls[k]; if (c > 3) continue;
      const u = U0 + i, v = V0 + j, d = D(i, j), dd = dist[k];
      if (lip[k]) { const n = k - (lip[k] === 2 ? 2 * w : w); base[k] = RM[ID.cliff][lip[k] === 2 ? 0 : band[n] > 16 ? 1 : 2]; continue; }
      if (c === 3) { // lakes: flat, a light rim
        base[k] = dd === 1 ? RM[ID.lake][4] : dd === 2 && (u + v) & 1 ? RM[ID.lake][3] : RM[ID.lake][2];
        if (dd === 1) anim[k] = 1;
        continue;
      }
      // World zoom: one soft line of surf; closer in, white foam then a lit shallow band.
      if (dd === 1) { base[k] = tier === 0 ? RM[ID.shore][4] : FOAM; anim[k] = 1; continue; }
      if (dd === 2) { if (tier > 0) { base[k] = RM[ID.shore][3]; continue; } if ((u + v) & 1) { base[k] = RM[ID.shore][2]; continue; } }
      if (dd === 3 && shoreBand >= 3) { base[k] = (u + v) & 1 ? RM[ID.shore][2] : RM[ID.shelf][3]; continue; }
      // Open water: deep ocean nearly flat with a slow two-tone dither; the shelf a lighter band with a dithered edge.
      const slow = NSEA(u, v) + d * 0.035;
      if (c === 2) base[k] = RM[ID.shelf][band[k] < 1 ? 3 : 2];
      else if (c === 1) base[k] = RM[ID.sea][slow > 0.56 ? 3 : 2];
      else base[k] = RM[ID.deep][slow > 0.56 ? 2 : 1];
      // Shelf edge: dither across the step from sea to shelf.
      if (c < 2 && ((i + 1 < w && cls[k + 1] === 2) || (j + 1 < h && cls[k + w] === 2) || (i > 0 && cls[k - 1] === 2) || (j > 0 && cls[k - w] === 2)) && (u + v) & 1) base[k] = RM[ID.shelf][2];
    }

    TM.push(performance.now());
    // 7. Land base colours, beaches on low sandy or grassy coasts.
    for (let k = 0; k < N; k++) { const c = cls[k]; if (c <= 3 || c === 255) continue; base[k] = RM[gR[k]][tn[k]]; }
    if (tier >= 1) for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
      const k = j * w + i, g = gC[k]; if (cls[k] <= 4 || cls[k] === 255) continue;
      if (!(g === 10 || g === 11 || g === 12 || g === 13 || g === 6) || band[k] > 6) continue;
      if (cls[k - 1] <= 2 || cls[k + 1] <= 2 || cls[k - w] <= 2 || cls[k + w] <= 2) base[k] = RM[ID.beach][g === 12 ? 4 : 3];
    }

    // Stamping helper: rows of letters, a/b/c/t (and digits) mapped to colours by col; skips water and off-globe pixels.
    const covered = new Uint8Array(N);
    function stamp(i, j, rows, col, overWater) {
      const hgt = rows.length, wid = rows[0].length;
      for (let y = 0; y < hgt; y++) { const row = rows[y]; for (let x = 0; x < wid; x++) {
        const ch = row[x]; if (ch === ".") continue;
        const cc = col[ch]; if (cc == null) continue;
        const ii = i + x - (wid >> 1), jj = j + y - hgt + 1; if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
        const q = jj * w + ii, cq = cls[q]; if (cq === 255 || (!overWater && cq <= 3)) continue;
        base[q] = cc; covered[q] = 1;
      } }
    }
    const tone = (k, dt) => RM[gR[k]][Math.max(0, Math.min(4, tn[k] + dt))];

    TM.push(performance.now());
    // 8. Forests: a dark understorey, then crowns stamped back to front on a staggered, world-anchored lattice, so a
    // forest reads as a canopy mass with a bumpy rim; crowns cast a shadow onto open ground below the forest edge.
    const isF = new Uint8Array(N);
    for (let k = 0; k < N; k++) if (FOREST(gC[k]) && cls[k] > 4 && cls[k] !== 255) isF[k] = 1;
    // Glades: soft holes in the canopy (more in broadleaf woods than in taiga or rainforest), open meadow inside.
    if (tier >= 1) for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = j * w + i; if (!isF[k]) continue;
      const g = gC[k], q = NGLADE(U0 + i, V0 + j) + D(i, j) * 0.08;
      if (q < (g === 8 ? 0.3 : g === 7 ? 0.2 : 0.14)) {
        isF[k] = 0; gC[k] = g === 7 ? 6 : 10;
        gR[k] = g === 7 ? ID.tundra : gR[k] === ID.forest_med ? ID.grass_med : ID.grass; tn[k] = Math.min(4, tn[k] + 1);
        base[k] = RM[gR[k]][tn[k]];
      }
    }
    const snowCrown = winter ? RM[ID.snow][4] : 0;
    if (tier === 0) {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const k = j * w + i; if (!isF[k]) continue;
        const u = U0 + i, v = V0 + j;
        const south = j + 1 < h && !isF[k + w] && cls[k + w] > 3, north = j > 0 && !isF[k - w] && cls[k - w] > 3;
        base[k] = south ? tone(k, -2) : north ? tone(k, 1) : ((u + ((v >> 1) & 1) * 2) % 4 === 0 && (v & 1) === 0) ? (snowCrown || tone(k, 1)) : tone(k, 0);
      }
    } else {
      for (let k = 0; k < N; k++) if (isF[k]) base[k] = RM[gR[k]][Math.max(0, Math.min(1, tn[k] - 1))];
      const g0 = 9; // margin in lattice units to catch crowns whose centre sits just off screen
      for (const sp of [7, 8, 9]) {
        const [sx, sy] = CROWN_STEP[sp][tier], rows = CROWN[sp][tier];
        const r0 = Math.floor(V0 / sy) - 1, r1 = Math.ceil((V0 + h) / sy) + 2, c0 = Math.floor(U0 / sx) - 2, c1 = Math.ceil((U0 + w) / sx) + 2;
        for (let cv = r0; cv < r1; cv++) for (let cu = c0; cu < c1; cu++) {
          const r = hash(cu * 3 + 1, cv * 5 + 2);
          const u = cu * sx + (cv & 1) * (sx >> 1) + Math.floor(r * 3) - 1, v = cv * sy + Math.floor(hash(cv, cu) * 2.4) - 1;
          const i = u - U0, j = v - V0; if (i < 0 || j < 0 || i >= w || j >= h) continue;
          const k = j * w + i; if (!isF[k] || gC[k] !== sp || r > 0.97) continue;
          const t0 = tn[k], rm = RM[gR[k]];
          const col = { a: snowCrown || rm[Math.min(4, t0 + 2)], b: rm[Math.min(4, t0 + 1)], c: rm[Math.max(0, t0 - 1)] };
          // Mediterranean and dry forest: crowns sparser, ground shows between them.
          stamp(i, j + (rows.length >> 1), rows, col);
        }
        void g0;
      }
      // Cast shadow: open ground just under a forest's lower edge darkens by two tones.
      for (let j = 1; j < h; j++) for (let i = 0; i < w; i++) {
        const k = j * w + i; if (isF[k] || cls[k] <= 4 || cls[k] === 255) continue;
        if (isF[k - w] || (covered[k - w] && isF[Math.max(0, k - 2 * w)])) { base[k] = tone(k, -2); if (tier >= 2 && j + 1 < h && !isF[k + w] && cls[k + w] > 4 && ((U0 + i) & 1)) base[k + w] = tone(k + w, -1); }
      }
    }

    TM.push(performance.now());
    // 9. Open-ground detail on a jittered world grid: dune crescents, desert mesas, steppe tufts, acacias, tundra ponds,
    // reeds, crevasses. None at world zoom (calm first); denser as you come in.
    if (tier >= 1) {
      const cs = [0, 6, 7, 8][tier], cv0 = Math.floor(V0 / cs) - 1, cv1 = Math.ceil((V0 + h) / cs) + 2, cu0 = Math.floor(U0 / cs) - 1, cu1 = Math.ceil((U0 + w) / cs) + 1;
      for (let cv = cv0; cv < cv1; cv++) for (let cu = cu0; cu < cu1; cu++) {
        const r = hash(cu * 17 + 5, cv * 31 + 9), r2 = hash(cv * 13 + 3, cu * 7 + 11);
        const u = cu * cs + Math.floor(r * cs), v = cv * cs + Math.floor(r2 * cs), i = u - U0, j = v - V0;
        if (i < 1 || j < 1 || i >= w - 1 || j >= h - 1) continue;
        const k = j * w + i, g = gC[k], c = cls[k]; if (c <= 4 || c === 255 || covered[k]) continue;
        const p = hash(u, v), rm = RM[gR[k]], t0 = tn[k];
        const col = { a: rm[Math.min(4, t0 + 2)], b: rm[Math.min(4, t0 + 1)], c: rm[Math.max(0, t0 - 2)], t: RM[ID.cliff][0] };
        if (c >= 16) continue;
        if (g === 12) { if (tier >= 2 && p < 0.85 && gC[k - 1] === 12 && gC[k + 1] === 12) stamp(i, j, DUNE[tier], { a: rm[4], b: rm[Math.min(4, t0 + 1)], c: rm[Math.max(0, t0 - 2)] }); }
        else if (g === 13) { if (p < (tier === 1 ? 0.3 : 0.4)) stamp(i, j, MESA[tier], { a: rm[4], b: rm[Math.min(4, t0 + 1)], c: rm[Math.max(0, t0 - 2)] }); }
        else if (g === 11) {
          const sav = gR[k] === ID.savanna || gR[k] === ID.steppe_outback;
          if (sav && tier >= 2 && p < 0.3) { const tr = RM[ID.savanna === gR[k] ? ID.forest : ID.forest_med]; stamp(i, j, ACACIA[tier], { a: tr[3], b: tr[2], c: tr[0], t: RM[ID.cliff][0] }); }
          else if (p < 0.55) stamp(i, j, TUFT[tier], { a: rm[Math.max(0, t0 - 1)] });
        }
        else if (g === 10) { if (tier >= 2 && p < 0.35) stamp(i, j, TUFT[tier - 1], { a: rm[Math.max(0, t0 - 1)] }); }
        else if (g === 6) {
          if (p < 0.4) stamp(i, j, POND[tier], { a: RM[ID.lake][4], b: RM[ID.lake][2] });
          else if (p < 0.7) stamp(i, j, ["a.b"], { a: rm[4], b: rm[1] });
        }
        else if (g === 14) {
          if (p < 0.5) stamp(i, j, POND[tier], { a: RM[ID.lake][3], b: RM[ID.lake][1] });
          else stamp(i, j, tier >= 2 ? ["a.a.a", "a.a.a"] : ["a.a"], { a: rm[Math.max(0, t0 - 2)] });
        }
        else if (g === 5 && tier >= 2 && p < 0.3) stamp(i, j, ["a..", ".a.", "..b"], { a: RM[ID.ice][0], b: RM[ID.ice][1] });
      }
    }

    TM.push(performance.now());
    // 10. Terraces: on hill slopes in the rice and Andean regions, contour stripes from the elevation, once close in.
    if (tier >= 2 && elev) {
      const step = tier === 3 ? 18 : 35;
      for (let j = 1; j < h; j++) for (let i = 0; i < w; i++) {
        const k = j * w + i, c = cls[k];
        if (!(c === 15 || c === 10 || c === 8 || c === 9 || c === 16) || gC[k] === 16 || gC[k] === 17 || covered[k] || isF[k] && c !== 15) continue;
        const e = elev[k]; if (e < 30 || e > 3000 || Math.abs(lit[k]) < 5) continue;
        if (mn[k] < -0.12 || !inReg(REG.terraces, lonA[k], latA[k], D(i, j) * edgeDeg)) continue;
        const q = Math.floor(e / step), qa = Math.floor(elev[k - w] / step);
        base[k] = q !== qa ? RM[ID.paddy][1] : RM[ID.paddy][(q & 1) ? 3 : 2];
      }
    }

    TM.push(performance.now());
    // 11. Rivers: drawn lines (riv) and raster rivers; great rivers lighter in the channel. Banks darken a little.
    for (let k = 0; k < N; k++) if (cls[k] === 4) { base[k] = RM[ID.river][riv && riv[k] === 2 ? 3 : 2]; anim[k] = 3; }

    TM.push(performance.now());
    // 12. Wave glyphs on open water, sparse, on a world grid (the motion layer may cycle them).
    {
      const g = WAVE[tier], cw = [26, 30, 34, 40][tier], ch = [15, 17, 20, 24][tier], col = { a: RM[ID.sea][4] };
      for (let cv = Math.floor(V0 / ch) - 1; cv < Math.ceil((V0 + h) / ch) + 1; cv++) for (let cu = Math.floor(U0 / cw) - 1; cu < Math.ceil((U0 + w) / cw) + 1; cu++) {
        const r = hash(cu * 5 + 7, cv * 3 + 1); if (r > 0.6) continue;
        const u = cu * cw + Math.floor(hash(cv, cu * 9) * cw), v = cv * ch + Math.floor(r * ch / 0.6), i = u - U0, j = v - V0;
        if (i < 2 || j < 2 || i >= w - 6 || j >= h - 2) continue;
        const k = j * w + i; if (cls[k] > 1 || dist[k] < 6) continue;
        const deepc = cls[k] === 0 ? RM[ID.deep][3] : RM[ID.sea][4];
        stamp(i, j, g, { a: deepc }, true);
        for (let y = 0; y < g.length; y++) for (let x = 0; x < g[0].length; x++) if (g[y][x] !== ".") { const ii = i + x - (g[0].length >> 1), jj = j + y - g.length + 1; if (ii >= 0 && jj >= 0 && ii < w && jj < h) anim[jj * w + ii] = 2; }
        void col;
      }
    }

    TM.push(performance.now());
    // 13. Mountains: one peak per world cell at the cell's highest mountain pixel (so ranges follow real ridgelines),
    // sized by height, snow by the latitude's snowline, drawn back to front so ranges overlap like an illustration.
    const marks = [];
    for (const L of LANDMARKS) {
      if (tier < L.tier || !L.h[tier]) continue;
      const p = S.toPx(L.lon, L.lat); if (!p || p[0] < -20 || p[1] < -10 || p[0] >= w + 20 || p[1] >= h + 30) continue;
      marks.push({ L, i: p[0], j: p[1] });
    }
    const PW = [6, 8, 11, 14][tier], PH = [5, 6, 8, 10][tier], PROM = [380, 380, 300, 250][tier];
    const peaks = [], hills = [];
    const cu0 = Math.floor(U0 / PW) - 1, cu1 = Math.ceil((U0 + w) / PW) + 1, cv0 = Math.floor(V0 / PH) - 1, cv1 = Math.ceil((V0 + h) / PH) + 2;
    for (let cv = cv0; cv < cv1; cv++) for (let cu = cu0; cu < cu1; cu++) {
      let best = -1, be = -1, nM = 0, sum = 0, n = 0, hb = -1, he = -1, nH = 0;
      const ia = cu * PW - U0, ja = cv * PH - V0;
      for (let y = Math.max(0, ja); y < Math.min(h, ja + PH); y++) for (let x = Math.max(0, ia); x < Math.min(w, ia + PW); x++) {
        const k = y * w + x, c = cls[k]; if (c === 255 || c <= 3) continue;
        // Summit heights from the unblurred elevation; the cell's mean from the smoothed one.
        const e = elev ? elev[k] : band[k] * 25; sum += el[k]; n++;
        if (c === 15) { nH++; if (e > he) { he = e; hb = k; } continue; }
        if (c !== 16 && c !== 17) continue;
        nM++; if (e > be) { be = e; best = k; }
      }
      if (best < 0 || nM < PW * PH * 0.2) {
        // Hill country: a rounded, lit hill in the ground's own colours where at least a third of the cell is hills.
        if (hb >= 0 && nH >= PW * PH * 0.33 && hash(cu * 5 + 1, cv * 3 + 2) < 0.85) {
          const hi = hb % w, hj = (hb / w) | 0, Hh = [2, 3, 4, 5][tier] + (hash(cu, cv) < 0.4 ? 1 : 0);
          hills.push({ i: hi, j: hj + (Hh >> 1), spr: hill(Math.round(Hh * 2.2) | 1, Hh, (cu * 13 + cv * 7) & 255), k: hb });
        }
        continue;
      }
      const bi = best % w, bj = (best / w) | 0, u = bi + U0, v = bj + V0, lat = latA[best], sl = snowline(lat);
      // Summits that stand out from their cell (or carry permanent snow) get a peak; flat high plateaus mostly don't.
      const prom = be - sum / n;
      if (prom < PROM && be < sl + 300 && hash(u, v) > 0.1) continue;
      if (marks.some(m => Math.abs(m.i - bi) < m.L.h[tier] * 1.7 && Math.abs(m.j - bj) < m.L.h[tier])) continue;
      // Size by height and by how far the summit stands above its surroundings.
      const big = Math.min(1, Math.max(0, (be - 800) / 4500)) * 0.55 + Math.min(1, Math.max(0, prom / 1600)) * 0.45;
      const H = Math.max(3, Math.round(PH * (0.6 + 0.85 * big)) + (hash(u, v * 7) < 0.3 ? 1 : 0));
      const W = Math.max(5, Math.round(H * (1.35 + hash(v, u) * 0.45)) | 1);
      const snowRows = be > sl - 200 ? Math.max(1, Math.round(H * Math.min(0.6, 0.3 + (be - sl) / 2000))) : winter && Math.abs(lat) > 35 ? Math.round(H * 0.4) : 0;
      const apex = (W >> 1) + (hash(u, 3 * v) < 0.3 ? -1 : hash(u, 3 * v) > 0.7 ? 1 : 0);
      peaks.push({ i: bi, j: bj + (H >> 1), spr: peak(W, H, apex, snowRows, (u * 7 + v * 13) & 1023) });
    }
    peaks.sort((a, b) => a.j - b.j);
    const RK = RM[ID.rock], SN = RM[ID.snow], CL = RM[ID.cliff], RED = RM[ID.rock_outback];
    function drawSprite(i0, j0, spr, rockR, lineR) {
      for (let q = 0; q < spr.length; q += 4) {
        const ii = i0 + spr[q], jj = j0 + spr[q + 1]; if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
        const k = jj * w + ii, kind = spr[q + 3], t = spr[q + 2];
        if (cls[k] === 255) continue;
        if (kind === 3) { base[k] = SN[t]; anim[k] = 4; continue; }
        if (kind === 5) { base[k] = SN[4]; continue; }
        if (cls[k] <= 3 && kind !== 2) continue;
        base[k] = kind === 1 ? SN[t] : kind === 2 ? (lineR ? lineR[0] : CL[0]) : kind === 4 ? RED[t] : rockR[t];
        covered[k] = 1;
      }
    }
    for (const hl of hills) { if (!covered[hl.k]) drawSprite(hl.i, hl.j, hl.spr, RM[gR[hl.k]], RM[gR[hl.k]]); }
    for (const pk of peaks) drawSprite(pk.i, pk.j, pk.spr, RK);
    TM.push(performance.now());
    // 14. Landmarks last, in front of their range.
    marks.sort((a, b) => a.j - b.j);
    for (const m of marks) { const spr = landmark(m.L, tier); if (spr) drawSprite(m.i, m.j, spr, RK); }

    TM.push(performance.now());
    return { anim, tier, peaks: peaks.length, marks: marks.map(m => m.L.name), ms: TM.slice(1).map((t, i) => +(t - TM[i]).toFixed(1)) };
  }

  global.PixelTerrainArt = { paint, LANDMARKS, GREEN, REG, snowline, vnoise, noiseTile, peak, landmark };
})(typeof window !== "undefined" ? window : globalThis);
