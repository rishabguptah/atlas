// Era map styles for the pixel map. Each era is a grade, a frame and an accent (art direction D9), not a new renderer.
//   PixelEras.LIST                    [{id, name, family, from, to, region?}] in time order (regional variants carry a box)
//   PixelEras.pick(year, view?)       -> style id for that year; view {lon, lat, k} lets a regional variant (al-Idrisi,
//                                        silk scroll) take over when the view is settled over its region and zoomed in
//   PixelEras.style(id)               -> compiled style for pm.setEra(style); null for "now" (today's look, no grade)
//   PixelEras.setYear(y)              the year shown on the frame's title plate (in the era's own numerals)
//   PixelEras.chrome(root, id)        sets data-era and the --era-accent / --era-ink / --era-paper / --era-frame-* CSS vars
//
// How a style draws (pixelmap.js calls these):
//   grade(g)  once per cached border-frame raster. The graded terrain depends only on the view, so it is built once per
//             render and copied for every border frame; per frame only the realm pass runs (about 2 ms at 1440x900).
//             Each pixel's colour is the style's tint for its terrain class and elevation band, plus the pixel's own
//             luminance offset from its class mean (trees, peaks, hills and dither survive as texture), plus the style's
//             paper or surface texture; then coasts, water lines, rhumb lines, grid and compass rose, then realms.
//   over(g)   each paint, after sprites and lens marks: sea creatures, the shared neatline in era colours, the title plate.
//             Creatures only sit in open water, never on sprites or lens marks, at most two at a time.
// Lens mark colours are never touched (D4): marks paint after grade and before over. Letters are drawn as pixels from a
// 3x5 font below (plus Arabic-Indic digits and two seal glyphs), so the frame needs no other typeface (D2).
// Below 3x zoom realms are drawn as solid 1-px edges between groups (part_of / subject_of), so colonial sub-units merge
// and the world view stays calm; dashes and ribbons come in from 3x.
(function (global) {
  const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const pack = ([r, g, b]) => (255 << 24 | b << 16 | g << 8 | r) >>> 0;
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const hash = (u, v) => { let h = (u * 374761393 + v * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  // Engraving: horizontal lines come in first (every 4th row), then every 2nd, then the gaps fill.
  const HATCH = [0.12, 0.12, 0.12, 0.12, 0.62, 0.82, 0.66, 0.86, 0.34, 0.34, 0.34, 0.34, 0.72, 0.92, 0.76, 0.96];
  // Offset print: a clustered dot screen.
  const DOTS = [12, 5, 6, 13, 4, 0, 1, 7, 11, 3, 2, 8, 15, 10, 9, 14].map(v => (v + 0.5) / 16);
  const sstep = t => t * t * (3 - 2 * t);
  function vnoise(u, v, s) {
    const x = u / s, y = v / s, xi = Math.floor(x), yi = Math.floor(y), fx = sstep(x - xi), fy = sstep(y - yi);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  const WATER = c => c <= 3;
  const clamp = v => v < 0 ? 0 : v > 255 ? 255 : v;
  const ramp = (stops, b) => { for (const [lim, hex] of stops) if (b < lim) return hex; return stops[stops.length - 1][1]; };
  const P_ = h => pack(rgb(h));

  // ---------- numerals ----------
  const ROMAN = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  const roman = n => { let s = ""; n = Math.max(1, Math.round(n)); for (const [v, r] of ROMAN) while (n >= v) { s += r; n -= v; } return s; };
  const yearCE = y => y < 0 ? `${-y} BC` : `AD ${y}`;
  // Roman years count from the founding of the city (ab urbe condita, 753 BC); there is no year 0.
  const auc = y => y < 0 ? 754 + y : 753 + y;
  // Hijri (AH) years from CE, the usual approximation for lunar years.
  const hijri = y => Math.round((y - 622) * 33 / 32);
  const ARABIC = "٠١٢٣٤٥٦٧٨٩";
  const arabic = n => String(n).replace(/\d/g, d => ARABIC[d]);

  // ---------- 3x5 pixel font ----------
  const F = {
    A: [".#.", "#.#", "###", "#.#", "#.#"], B: ["##.", "#.#", "##.", "#.#", "##."], C: [".##", "#..", "#..", "#..", ".##"], D: ["##.", "#.#", "#.#", "#.#", "##."],
    E: ["###", "#..", "##.", "#..", "###"], F: ["###", "#..", "##.", "#..", "#.."], G: [".##", "#..", "#.#", "#.#", ".##"], H: ["#.#", "#.#", "###", "#.#", "#.#"],
    I: ["###", ".#.", ".#.", ".#.", "###"], J: ["..#", "..#", "..#", "#.#", ".#."], K: ["#.#", "#.#", "##.", "#.#", "#.#"], L: ["#..", "#..", "#..", "#..", "###"],
    M: ["#...#", "##.##", "#.#.#", "#...#", "#...#"], N: ["#..#", "##.#", "#.##", "#..#", "#..#"], O: [".#.", "#.#", "#.#", "#.#", ".#."], P: ["##.", "#.#", "##.", "#..", "#.."],
    Q: [".#.", "#.#", "#.#", "##.", ".##"], R: ["##.", "#.#", "##.", "#.#", "#.#"], S: [".##", "#..", ".#.", "..#", "##."], T: ["###", ".#.", ".#.", ".#.", ".#."],
    U: ["#.#", "#.#", "#.#", "#.#", "###"], V: ["#.#", "#.#", "#.#", "#.#", ".#."], W: ["#...#", "#...#", "#.#.#", "##.##", "#...#"], X: ["#.#", "#.#", ".#.", "#.#", "#.#"],
    Y: ["#.#", "#.#", ".#.", ".#.", ".#."], Z: ["###", "..#", ".#.", "#..", "###"],
    0: ["###", "#.#", "#.#", "#.#", "###"], 1: [".#.", "##.", ".#.", ".#.", "###"], 2: ["##.", "..#", ".#.", "#..", "###"], 3: ["##.", "..#", ".#.", "..#", "##."],
    4: ["#.#", "#.#", "###", "..#", "..#"], 5: ["###", "#..", "##.", "..#", "##."], 6: [".##", "#..", "###", "#.#", "###"], 7: ["###", "..#", ".#.", ".#.", ".#."],
    8: ["###", "#.#", "###", "#.#", "###"], 9: ["###", "#.#", "###", "..#", "##."],
    ".": [".", ".", ".", ".", "#"], "·": [".", ".", "#", ".", "."], " ": ["..", "..", "..", "..", ".."], "-": ["...", "...", "###", "...", "..."],
    // Arabic-Indic digits.
    "٠": ["...", "...", ".#.", "...", "..."], "١": [".#.", ".#.", ".#.", ".#.", ".#."], "٢": ["#.#", "##.", "#..", "#..", "#.."], "٣": ["#.#.#", "#####", "#....", "#....", "#...."],
    "٤": [".##", "#..", ".#.", "#..", ".##"], "٥": [".#.", "#.#", "#.#", "#.#", ".#."], "٦": ["###", "..#", "..#", "..#", "..#"], "٧": ["#.#", "#.#", "#.#", ".#.", ".#."],
    "٨": [".#.", ".#.", "#.#", "#.#", "#.#"], "٩": ["###", "#.#", "###", "..#", "..#"],
  };
  const textWidth = s => [...s].reduce((a, ch) => a + ((F[ch] || F[" "])[0].length + 1), -1);
  // 天下 ("all under heaven"), for the silk scroll's seal.
  const SEAL = [["#######", "...#...", "#######", "...#...", "..#.#..", ".#...#.", "#.....#"], ["#######", "...#...", "...##..", "...#.#.", "...#...", "...#...", "...#..."]];
  const STAR8 = ["...#...", ".#.#.#.", "..###..", "#######", "..###..", ".#.#.#.", "...#..."];

  // ---------- sea creatures (k = ink outline, a = body, b = belly, r = fin, w = white) ----------
  const CREATURES = {
    serpent: [
      ".......kk...........",
      "......kaak..........",
      ".....kawrak.........",
      "....kaak.kak...kkk..",
      "...kaak...kak.kaaak.",
      "..kaak.....kakaak.k.",
      ".kbbk.......kbbk....",
    ],
    whale: [
      "....w.w.........",
      ".....w..........",
      "..kkkwkkk.......",
      ".kaaaaaaakk..kk.",
      "kawaaaaaaaakkak.",
      "kaaaaaaaaaaaak..",
      ".kbbbbbbbbkk....",
      "..kkkkkkkk......",
    ],
  };

  // ---------- the styles ----------
  // tint(c, band) -> "#rrggbb" for terrain class c (SPEC.md ids, 255 = outside the globe) and band (land: elevation/25 m,
  // water: depth/40 m). detail [land, water, outside]: how much of each pixel's own light and dark survives.
  // shade(P): optional per-pixel touch (texture, hatching), once per view. realm: how political realms are drawn.
  // frame: colours for the shared neatline {ink, paper, a, b, c?, corner}: rule, a 3-px band of alternating blocks, rule,
  // gap, fine rule, the same geometry in every era (art direction: one frame, era colours).
  const STYLES = {}, LIST = [];
  const def = (id, s) => { s.id = id; STYLES[id] = s; LIST.push(s); };
  // Vellum and parchment: soft stains, grain and the odd foxing spot.
  const vellum = (P, amt) => { const n = (vnoise(P.u, P.v, 70) - 0.5) * amt + (hash(P.u, P.v) - 0.5) * 5; P.r += n; P.g += n; P.b += n * 0.9; if (hash(P.u >> 2, P.v >> 2) < 0.0015) { P.r -= 26; P.g -= 30; P.b -= 30; } };

  // ===== Antiquity =====
  // Bronze Age: the world pressed into a clay tablet, like the Babylonian Map of the World. Coasts and borders are incised
  // grooves (shadow on one side, a lit lip on the other), cracks run through it, and the sea carries rows of wedge marks.
  def("clay", {
    name: "Clay tablet", family: "Antiquity", from: -3500, to: -1200,
    note: "Babylonian Imago Mundi: the world incised in clay, the ocean a ring of wedge writing.",
    accent: "#9a5a32", ink: "#4a3020", paper: "#cfa77c", plate: "#c49a70", plateInk: "#4a3020",
    tint(c, b) {
      // The sea is darker, wetter clay, at least 25 L* below the lowland so the coast still reads at world zoom.
      if (c === 255) return "#b48e68";
      if (WATER(c)) return c === 0 ? "#74523a" : c === 3 ? "#82603f" : "#7e5a3b";
      if (c === 4) return "#74523a";
      return ramp([[12, "#cba37a"], [40, "#d2ab82"], [100, "#d9b48c"], [256, "#e0bd96"]], b);
    },
    detail: [0.55, 0.12, 0.6],
    shade(P) {
      const n = (hash(P.u, P.v) - 0.5) * 12 + (vnoise(P.u, P.v, 9) - 0.5) * 10; P.r += n; P.g += n * 0.9; P.b += n * 0.8;
      const cr = Math.abs(vnoise(P.u + 913, P.v, 48) - 0.5);
      // Cracks: thin dark lines that only run where a slower noise allows, so they break off instead of looping.
      const live = vnoise(P.u + 51, P.v + 17, 110);
      if (cr < 0.008 && live > 0.62) { P.r -= 46; P.g -= 44; P.b -= 38; }
      else if (cr < 0.016 && live > 0.62) { P.r += 10; P.g += 9; P.b += 7; }
      // Wedge marks pressed in rows across open water: a triangle head and a short tail.
      if (WATER(P.c) && P.d > 2) {
        const cu = Math.floor(P.u / 7), cv = Math.floor(P.v / 6), x = P.u - cu * 7, y = P.v - cv * 6;
        if (hash(cu, cv) < 0.34 && ((y === 1 && x <= 2) || (y === 2 && x === 1) || (y === 1 && x === 3 && hash(cv, cu) < 0.5))) { P.r -= 38; P.g -= 34; P.b -= 30; }
      }
    },
    coast: "#4a3020", coastLand: "#e8cba4",
    realm: { fill: 0.05, band: 0.12, bandW: 1, edge: "#7a5438", lip: "#e2c39c", pastel: 0.3 },
    glint: null, frame: { ink: "#4a3020", paper: "#c49a70", a: "#8a6444", b: "#d8b48a" },
    title: y => ({ glyphs: "cuneiform", sub: yearCE(y) }),
  });

  // Iron Age to Hellenistic: ink on papyrus, a reddish grid of parallels and meridians as Eratosthenes and Ptolemy drew,
  // the sheet's fibres and glued seams showing through.
  def("papyrus", {
    name: "Papyrus", family: "Antiquity", from: -1200, to: -27,
    note: "Greek geography on papyrus: ink coasts, Eratosthenes' and Ptolemy's grid in red ochre.",
    accent: "#a0503a", ink: "#3e2e1e", paper: "#e6d3a0", plate: "#e6d3a0", plateInk: "#3e2e1e",
    tint(c, b) {
      if (c === 255) return "#e0cc96";
      if (c === 4) return "#5a6a6a";
      // The sea is a grey-green ink wash, at least 25 L* below the lowland so the coast still reads at world zoom.
      if (WATER(c)) return c === 2 ? "#8a8460" : c === 3 ? "#847e5a" : "#7c7854";
      if (c >= 7 && c <= 9) return ramp([[30, "#d8c78e"], [256, "#cdb880"]], b);
      return ramp([[16, "#e4cf9a"], [48, "#dbc28a"], [110, "#cdae76"], [256, "#bc9862"]], b);
    },
    detail: [0.5, 0.15, 0.4],
    shade(P) {
      // Two layers of fibre at right angles, glued sheets every 90 pixels, and soft stains.
      const n = (hash(3, P.v) - 0.5) * 12 + (hash(P.u, 11) - 0.5) * 5 + (vnoise(P.u, P.v, 60) - 0.5) * 16;
      P.r += n; P.g += n; P.b += n * 0.8;
      const s = ((P.u % 90) + 90) % 90; if (s === 0) { P.r -= 16; P.g -= 16; P.b -= 14; } else if (s === 1) { P.r += 6; P.g += 6; P.b += 4; }
      if (WATER(P.c) && P.d > 3 && ((P.v + Math.round(Math.sin(P.u * 0.45) * 1.2)) % 9 === 0) && hash(P.u >> 3, P.v) < 0.35) { P.r -= 40; P.g -= 38; P.b -= 30; }
    },
    coast: "#3e2e1e", coast2: "#b4a67a",
    realm: { fill: 0.05, band: 0.3, bandW: 1, edge: "#5a3e28", pastel: 0.15 },
    graticule: { step: 15, color: "#a0503a", land: 0.12, sea: 0.38 },
    glint: null, frame: { ink: "#3e2e1e", paper: "#e6d3a0", a: "#a0503a", b: "#e6d3a0" },
    title: y => ({ text: "OIKOYMENH", sub: yearCE(y) }),
  });

  // Rome: the Tabula Peutingeriana. Pale parchment land, seas and rivers as green bands, mountains as pinkish ridges,
  // red rubric lines for frontiers, and the creases of a long scroll.
  def("peutinger", {
    name: "Peutinger table", family: "Antiquity", from: -27, to: 476,
    note: "The Roman road map: green seas, pink mountains, red rubric, a scroll folded into sheets.",
    accent: "#b03a2a", ink: "#3a2a1e", paper: "#efe0b0", plate: "#efe0b0", plateInk: "#b03a2a",
    tint(c, b) {
      if (c === 255) return "#e9d8a6";
      if (c === 4) return "#5f8e78";
      if (c === 2) return "#a9c4ac";
      if (WATER(c)) return c === 0 ? "#86a690" : "#94b29c";
      if (c >= 16 || b > 60) return b > 120 ? "#c48a74" : "#d6a28a";
      if (c === 15 || b > 28) return "#e2c8a2";
      return "#ecdeb0";
    },
    detail: [0.4, 0.2, 0.4],
    shade(P) {
      vellum(P, 14);
      const s = ((P.u % 180) + 180) % 180; if (s === 0) { P.r -= 18; P.g -= 18; P.b -= 16; } else if (s === 1) { P.r += 8; P.g += 8; P.b += 6; }
    },
    coast: "#4f6f5c",
    realm: { fill: 0.04, band: 0.22, bandW: 1, edge: "#b03a2a", pastel: 0.2 },
    glint: null, frame: { ink: "#3a2a1e", paper: "#efe0b0", a: "#b03a2a", b: "#efe0b0" },
    title: y => ({ text: "ORBIS TERRARVM", sub: "A·V·C· " + roman(auc(y)) }),
  });

  // ===== Medieval =====
  // Mappa mundi (Hereford, Ebstorf): vellum, green-blue seas, the Red Sea painted red, gilded borders, gold roundels
  // on the frame, and a sea creature or two in the outer ocean.
  def("mappa", {
    name: "Mappa mundi", family: "Medieval", from: 476, to: 1300,
    note: "Hereford-style mappa mundi: vellum, gilded borders, green seas, a red Red Sea.",
    accent: "#b8322a", ink: "#2e2018", paper: "#ecdcb8", plate: "#2e4f8f", plateInk: "#e8c060",
    tint(c, b) {
      if (c === 255) return "#e6d4ae";
      if (c === 4) return "#3f7a74";
      if (c === 2) return "#86aa9c";
      if (WATER(c)) return c === 0 ? "#5c8a80" : "#6c988c";
      if (c >= 16 || b > 70) return b > 130 ? "#b08a64" : "#c4a07a";
      if (c >= 7 && c <= 9) return "#d6caa0";
      return ramp([[30, "#ead9b2"], [256, "#e0c9a0"]], b);
    },
    detail: [0.45, 0.25, 0.4],
    shade(P) {
      vellum(P, 18);
      if (WATER(P.c) && P.d > 3 && (P.v % 7 === 0) && ((P.u + (P.v / 7 | 0) * 5) % 11) < 3 && hash(P.u >> 4, P.v) < 0.5) { P.r -= 14; P.g -= 10; P.b -= 8; }
    },
    redSea: "#b8322a",
    coast: "#2e2018",
    realm: { fill: 0.06, band: 0.32, bandW: 2, edge: "#c8962a", edge2: "#7a5418", pastel: 0 },
    glint: null, creatures: true,
    frame: { ink: "#2e2018", paper: "#ecdcb8", a: "#b8322a", b: "#d8a32c", c: "#2e4f8f", corner: "roundel" },
    title: y => ({ text: "MAPPA MVNDI", sub: "ANNO DNI " + roman(y) }),
  });

  // Late medieval: the Catalan Atlas (1375). Bright vellum, seas in regular blue wave strokes, rhumb lines in black,
  // green and red from wind roses, a red Red Sea and a gilt compass rose.
  def("catalan", {
    name: "Catalan atlas", family: "Medieval", from: 1300, to: 1450,
    note: "Cresques' Catalan Atlas: portolan rhumb lines, gilt rose, blue wave strokes, vivid realms.",
    accent: "#c8962a", ink: "#2a2220", paper: "#f1e4c0", plate: "#b8322a", plateInk: "#f6e6a8",
    tint(c, b) {
      if (c === 255) return "#ecdcb4";
      if (c === 4) return "#3c6ea8";
      if (WATER(c)) return c === 2 ? "#d6e2d2" : "#c8d8cc";
      if (c >= 16 || b > 70) return b > 130 ? "#b89060" : "#ccaa7a";
      if (c === 12 || c === 13) return "#ecd9a6";
      return "#eee2c0";
    },
    detail: [0.42, 0.12, 0.4],
    shade(P) {
      vellum(P, 12);
      if (WATER(P.c) && P.d > 2 && (P.v % 6 === 0) && ((P.u + (P.v / 6 | 0) * 3) % 8) < 3) { P.r = P.r * 0.45 + 60 * 0.55; P.g = P.g * 0.45 + 110 * 0.55; P.b = P.b * 0.45 + 168 * 0.55; }
    },
    redSea: "#c0392b",
    coast: "#2a2220",
    rhumb: { roses: [[-22, 31], [17, 37]], sea: 0.45, land: 0.08 },
    rose: [[-22, 31]],
    realm: { fill: 0.08, band: 0.45, bandW: 2, edge: "#c8962a", edge2: "#6a4a18", pastel: 0 },
    glint: null, frame: { ink: "#2a2220", paper: "#f1e4c0", a: "#d8a32c", b: "#c0392b", c: "#2e4f8f" },
    title: y => ({ text: "MAPAMUNDI", sub: "ANY " + roman(y) }),
  });

  // Regional, the Islamic world 750-1500: al-Idrisi's Tabula Rogeriana. Lapis seas laced with white waves, gold land,
  // mountains in banded ochre and plum, gold stars on the frame, the year in Arabic-Indic digits with its Hijri year.
  def("idrisi", {
    name: "al-Idrisi", family: "Medieval", from: 750, to: 1500, region: [-12, 8, 75, 44],
    note: "Tabula Rogeriana (1154): lapis seas with white waves, gilded land, banded mountains.",
    accent: "#d8a32c", ink: "#1e2a4a", paper: "#efd9a0", plate: "#1e3a7a", plateInk: "#f2d27a",
    tint(c, b) {
      if (c === 255) return "#ead2a0";
      if (c === 4) return "#3f8f8a";
      if (c === 2) return "#4c6eae";
      if (WATER(c)) return c === 0 ? "#2a4a8a" : "#33569a";
      if (c >= 16 || b > 60) return ["#a0603a", "#8a4a6a", "#b0704a"][((b / 40) | 0) % 3];
      if (c === 15 || b > 30) return "#d8a860";
      if (c >= 7 && c <= 9) return "#c8b46a";
      return ramp([[12, "#ebcf88"], [256, "#e3c27a"]], b);
    },
    detail: [0.38, 0.1, 0.4],
    shade(P) {
      vellum(P, 10);
      if (WATER(P.c) && P.d > 1 && ((P.v + Math.round(Math.sin(P.u * 0.5) * 1.3)) % 7 === 0) && vnoise(P.u, P.v, 14) > 0.42) { P.r += 64; P.g += 68; P.b += 64; }
    },
    coast: "#e8c060",
    realm: { fill: 0.05, band: 0.3, bandW: 1, edge: "#6a3a28", pastel: 0.1 },
    glint: null, frame: { ink: "#1e2a4a", paper: "#efd9a0", a: "#1e3a7a", b: "#e8c060", corner: "star" },
    title: y => ({ text: arabic(Math.max(1, y)), sub: arabic(Math.max(1, hijri(y))), star: true }),
  });

  // Regional, East Asia 221 BC-1912: ink and blue-green colour on a silk scroll. The silk's weave and age stains, ink-wash
  // mountains in the qinglu (blue-green) manner, fish-scale wave strokes, brocade colours on the frame and a red seal.
  def("silk", {
    name: "Silk scroll", family: "Medieval", from: -221, to: 1912, region: [95, 15, 145, 50],
    note: "Chinese scroll map: ink and blue-green colour on silk, brocade mount, a red seal.",
    accent: "#b8322a", ink: "#2e2e2a", paper: "#e6d6b2", plate: "#e6d6b2", plateInk: "#2e2e2a",
    tint(c, b) {
      if (c === 255) return "#e0cea6";
      if (c === 4) return "#4a5a5a";
      if (WATER(c)) return c === 2 ? "#e2d8b8" : "#dcd2b2";
      if (c >= 16 || b > 50) return b > 120 ? "#4f7468" : "#6f9484";
      if (c === 15 || b > 24) return "#a8b494";
      if (c >= 7 && c <= 9) return "#b8bc98";
      return ramp([[10, "#e2d4ae"], [256, "#d8c9a2"]], b);
    },
    detail: [0.6, 0.12, 0.4],
    shade(P) {
      const n = (((P.u & 1) ^ (P.v & 1)) ? 3 : -3) + (hash(5, P.v) - 0.5) * 6 + (vnoise(P.u, P.v, 50) - 0.5) * 14;
      P.r += n; P.g += n * 0.95; P.b += n * 0.8;
      // Fish-scale waves: small ink arcs on a staggered grid, only some cells, so the water stays quiet.
      if (WATER(P.c) && P.d > 2) {
        const cv = Math.floor(P.v / 5), cu = Math.floor((P.u + (cv & 1) * 4) / 8), x = P.u + (cv & 1) * 4 - cu * 8, y = P.v - cv * 5;
        if (hash(cu, cv) < 0.42 && ((y === 1 && x >= 2 && x <= 4) || (y === 2 && (x === 1 || x === 5)))) { P.r -= 60; P.g -= 58; P.b -= 52; }
      }
    },
    coast: "#2e2e2a",
    realm: { fill: 0.03, band: 0.18, bandW: 1, edge: "#2e2e2a", dash: 3, pastel: 0.2 },
    glint: null, seal: true, frame: { ink: "#2e2e2a", paper: "#e6d6b2", a: "#2e4a6a", b: "#c8a050" },
    title: y => ({ sub: yearCE(y) }),
  });

  // ===== Early modern =====
  // Age of Sail (1450-1650): an engraved, hand-coloured world map in the manner of Ortelius and Blaeu. Stippled sea,
  // water-lining along coasts, rhumb lines from wind roses, a compass rose, sea monsters, and hand-coloured outlines.
  def("sail", {
    name: "Age of Sail", family: "Early modern", from: 1450, to: 1650,
    note: "Ortelius and Blaeu: engraved, hand-coloured outlines, stippled seas, compass roses and sea monsters.",
    accent: "#9a3a24", ink: "#2a2018", paper: "#efe6cf", plate: "#efe6cf", plateInk: "#2a2018",
    tint(c, b) {
      if (c === 255) return "#ebe1c6";
      if (c === 4) return "#4a6a8a";
      if (WATER(c)) return "#e6e3d2";
      if (c >= 16 || b > 70) return "#cfbe98";
      if (c >= 7 && c <= 9) return "#d9d2ac";
      return ramp([[30, "#ece2c4"], [256, "#e2d4b0"]], b);
    },
    detail: [0.7, 0.05, 0.4],
    shade(P) {
      vellum(P, 10);
      if (WATER(P.c)) {
        const pd = 0.03 + 0.3 * Math.exp(-P.d / 2.5);
        if (hash(P.u * 3 + 1, P.v * 5 + 2) < pd) { P.r -= 70; P.g -= 72; P.b -= 66; }
      }
    },
    waterlines: { at: [2, 4], color: "#5a4a3a", alpha: 0.55, dot: 2 },
    coast: "#2a2018",
    rhumb: { roses: [[-30, 22], [72, -18], [-150, 8]], sea: 0.32, land: 0.05 },
    rose: [[-30, 22], [72, -18]],
    realm: { fill: 0.03, band: 0.62, bandW: 3, edge: "#2a2018", low: "#8a7660", dash: 2, pastel: 0.05 },
    glint: null, creatures: true, frame: { ink: "#2a2018", paper: "#efe6cf", a: "#2a2018", b: "#efe6cf", corner: "strap" },
    title: y => ({ text: "NOVVS ORBIS", sub: "ANNO " + roman(y) }),
  });

  // 1650-1789: the copperplate world of the Enlightenment. Sepia hatching for relief, many water lines, fine rules.
  def("copper", {
    name: "Copperplate", family: "Early modern", from: 1650, to: 1789,
    note: "Engraved sepia: relief in hatching, coasts in concentric water lines, hand-tinted frontiers.",
    accent: "#7a4a2a", ink: "#3a2e24", paper: "#f0e8d6", plate: "#f0e8d6", plateInk: "#3a2e24",
    tint(c, b) {
      if (c === 255) return "#ece3cf";
      if (c === 4) return "#5a6a7a";
      if (WATER(c)) return "#ebe8dc";
      return "#efe6d2";
    },
    detail: [0, 0, 0.3],
    shade(P) {
      const n = (hash(P.u, P.v) - 0.5) * 4 + (vnoise(P.u, P.v, 80) - 0.5) * 8; P.r += n; P.g += n; P.b += n;
      if (!WATER(P.c) && P.c !== 255 && P.c !== 4) {
        const dark = (128 - P.hs) / 95 + P.band / 800 + (P.c >= 7 && P.c <= 9 ? 0.08 : 0) - P.dl * 0.004;
        if (dark > HATCH[(P.v & 3) * 4 + (P.u & 3)]) { P.r = 92; P.g = 74; P.b = 58; }
      }
    },
    waterlines: { at: [2, 4, 7, 11], color: "#6a5a48", alpha: 0.7, fade: true },
    coast: "#3a2e24",
    realm: { fill: 0.02, band: 0.5, bandW: 2, edge: "#3a2e24", low: "#9a8a72", dash: 2, pastel: 0.15 },
    graticule: { step: 30, color: "#8a7a62", land: 0.12, sea: 0.4 },
    glint: null, rose: [[-35, 30]], frame: { ink: "#3a2e24", paper: "#f0e8d6", a: "#3a2e24", b: "#f0e8d6" },
    title: y => ({ text: "MAPPE MONDE", sub: roman(y) }),
  });

  // ===== Long 19th century =====
  // John Bartholomew's layer system (hypsometric tints from his 1880s atlases), pale layered seas, hand-tinted boundary
  // ribbons, a fine blue graticule and a degree-ladder neatline.
  const BARTH_LAND = [[8, "#a3c58e"], [20, "#cbd99d"], [40, "#e8dfab"], [80, "#e2c38c"], [120, "#cf9e6c"], [200, "#b37b52"], [256, "#efe9df"]];
  def("bartholomew", {
    name: "Bartholomew layers", family: "Long 19th century", from: 1789, to: 1914,
    note: "John Bartholomew's layer colouring: a new tint at 200, 500, 1000, 2000 and 3000 m, seas paler where shallow.",
    accent: "#a5302a", ink: "#23303c", paper: "#f1ead8", plate: "#f1ead8", plateInk: "#23303c",
    tint(c, b) {
      if (c === 255) return "#f1ead8";
      if (c === 4) return "#4a86b8";
      if (c === 3) return "#a9d0e3";
      if (c === 2) return "#d3e7ee";
      if (c === 1) return b < 25 ? "#bddbe8" : "#a9cfe2";
      if (c === 0) return b < 100 ? "#95c2da" : "#84b5d2";
      if (c === 5) return "#f6f7f4";
      return ramp(BARTH_LAND, b);
    },
    bandDither: 3, detail: [0.3, 0.18, 1],
    shade(P) { const n = (hash(P.u, P.v) - 0.5) * 4 + (vnoise(P.u, P.v, 23) - 0.5) * 6; P.r += n; P.g += n; P.b += n; },
    coast: "#3c6c9c",
    realm: { fill: 0.12, band: 0.62, bandW: 2, edge: "#a8463a", low: "#7e4a44", dash: 4, pastel: 0 },
    graticule: { step: 15, color: "#6f9ec2", land: 0.12, sea: 0.7 },
    glint: "#93c0d8", frame: { ink: "#23303c", paper: "#f1ead8", a: "#23303c", b: "#f1ead8" },
  });

  // ===== 20th century =====
  // Flat offset print, mid-century school atlas: a few flat inks, bold flat realm colours slightly off register,
  // white frontiers, relief and depth in a clustered dot screen, registration marks and a colour bar in the margin.
  const MCM = ["#e0a83a", "#3f8f8a", "#e07a5f", "#8a9a4a", "#5f7f9f", "#c96f8a", "#d8c25a", "#7a6aa0", "#4f9a6a", "#d0885a"];
  def("offset", {
    name: "Offset print", family: "20th century", from: 1914, to: 1991,
    note: "Mid-century offset printing: flat inks, a dot screen for relief, registration slightly off.",
    accent: "#e07a5f", ink: "#1e2a33", paper: "#f3ead6", plate: "#1e2a33", plateInk: "#f3ead6",
    tint(c, b) {
      if (c === 255) return "#f3ead6";
      if (c === 4) return "#5d97b0";
      if (c === 2) return "#a8cdd8";
      if (WATER(c)) return c === 0 ? "#6fa6bc" : "#7fb2c6";
      if (c === 5) return "#f8f6f0";
      return b > 120 ? "#d8c8a8" : "#efe3c2";
    },
    detail: [0, 0, 0],
    shade(P) {
      const scr = DOTS[(P.v & 3) * 4 + (P.u & 3)];
      if (WATER(P.c)) { if (P.c <= 2 && P.band > 60 && scr < 0.2) { P.r -= 16; P.g -= 14; P.b -= 8; } }
      else if (P.c !== 255 && (128 - P.hs) / 64 > scr + 0.15) { P.r -= 34; P.g -= 30; P.b -= 26; }
    },
    coast: "#3f7f9a",
    realm: { fill: 0.55, band: 0.55, bandW: 0, edge: "#fbf6ea", low: "#fbf6ea", palette: MCM, shift: true },
    graticule: { step: 30, color: "#f8f4ea", land: 0.35, sea: 0.6 },
    glint: null, frame: { ink: "#1e2a33", paper: "#f3ead6", a: "#e07a5f", b: "#3f8f8a", c: "#e0a83a", corner: "register" },
    title: y => ({ text: "THE WORLD", sub: String(y) }),
  });

  // ---------- picking a style for a year ----------
  const timeline = LIST.filter(s => !s.region).sort((a, b) => a.from - b.from);
  function pick(year, view) {
    if (view && view.k >= 2.5) for (const s of LIST) {
      if (!s.region || year < s.from || year >= s.to) continue;
      const [lo0, la0, lo1, la1] = s.region;
      if (view.lon >= lo0 && view.lon <= lo1 && view.lat >= la0 && view.lat <= la1) return s.id;
    }
    for (const s of timeline) if (year >= s.from && year < s.to) return s.id;
    return year < timeline[0].from ? timeline[0].id : "now";
  }
  let curYear = 1900;

  // ---------- per-view caches ----------
  // dist[k]: for water pixels the 4-neighbour steps to the nearest land (1 = touching), for land the steps to water,
  // up to 15, 16 = further; 0 off the globe. Rebuilt only when the view is re-rendered (g.rv changes).
  let viewKey = -1, dist = null;
  function viewCache(g) {
    if (viewKey === g.rv && dist && dist.length === g.w * g.h) return;
    viewKey = g.rv;
    const { cls, w, h } = g, n = w * h;
    dist = new Uint8Array(n);
    const q = new Int32Array(n);
    let qh = 0, qt = 0;
    const other = (k, m, wa) => cls[m] !== 255 && WATER(cls[m]) !== wa;
    for (let k = 0; k < n; k++) {
      const c = cls[k]; if (c === 255) continue;
      const wa = WATER(c), i = k % w;
      if ((i > 0 && other(k, k - 1, wa)) || (i < w - 1 && other(k, k + 1, wa)) || (k >= w && other(k, k - w, wa)) || (k + w < n && other(k, k + w, wa))) { dist[k] = 1; q[qt++] = k; }
    }
    while (qh < qt) {
      const k = q[qh++], d = dist[k]; if (d >= 15) continue;
      const wa = WATER(cls[k]), i = k % w;
      const visit = m => { if (!dist[m] && cls[m] !== 255 && WATER(cls[m]) === wa) { dist[m] = d + 1; q[qt++] = m; } };
      if (i > 0) visit(k - 1); if (i < w - 1) visit(k + 1); if (k >= w) visit(k - w); if (k + w < n) visit(k + w);
    }
    for (let k = 0; k < n; k++) if (!dist[k] && cls[k] !== 255) dist[k] = 16;
  }

  // Fill a GeoJSON geometry into a mask aligned with the art-pixel grid (used for the red Red Sea).
  let maskCanvas = null;
  function areaMask(g, geom) {
    const { w, h, k, PX, U0, V0, projection } = g;
    if (!maskCanvas) maskCanvas = document.createElement("canvas");
    maskCanvas.width = w; maskCanvas.height = h;
    const x = maskCanvas.getContext("2d", { willReadFrequently: true });
    x.setTransform(k / PX, 0, 0, k / PX, -U0, -V0);
    // d3 wants clockwise outer rings; a ring wound the other way would fill the rest of the globe.
    if (d3.geoArea(geom) > 2 * Math.PI) geom = { type: geom.type, coordinates: geom.coordinates.map(p => p.map(r => r.slice().reverse())) };
    x.fillStyle = "#fff"; x.beginPath(); d3.geoPath(projection, x)(geom); x.fill();
    return x.getImageData(0, 0, w, h).data;
  }
  // The Red Sea and the Persian Gulf, as the mappae mundi and the Catalan Atlas paint them.
  const RED_SEA = { type: "MultiPolygon", coordinates: [
    [[[32.2, 30.2], [32.6, 29.4], [34.6, 25.6], [36.6, 21.6], [38.6, 17.8], [41.4, 13.6], [43.2, 12.2], [43.6, 12.4], [42.6, 16.2], [38.4, 22.4], [35.6, 27.6], [35.2, 28.6], [32.2, 30.2]]],
    [[[47.6, 30.6], [48.4, 28.2], [50.0, 26.0], [51.4, 24.2], [54.0, 24.0], [56.4, 26.0], [56.6, 27.2], [52.6, 27.8], [50.4, 30.4], [47.6, 30.6]]],
  ] };

  // ---------- compile a style ----------
  const compiled = {};
  function style(id) {
    if (!id || id === "now" || !STYLES[id]) return null;
    if (compiled[id]) return compiled[id];
    const s = STYLES[id];
    // Tint lookup: 19 classes (18 = outside) x 256 bands, as separate channels for the detail maths.
    const LR = new Uint8Array(19 * 256), LG = new Uint8Array(19 * 256), LB = new Uint8Array(19 * 256);
    for (let c = 0; c < 19; c++) for (let b = 0; b < 256; b++) {
      const [r, g, bl] = rgb(s.tint(c === 18 ? 255 : c, b)); const o = c * 256 + b; LR[o] = r; LG[o] = g; LB[o] = bl;
    }
    const [dLand, dSea, dOut] = s.detail;
    const DET = new Float32Array(19).map((_, c) => c === 18 ? dOut : WATER(c) ? dSea : dLand);
    const R = s.realm, edgeC = rgb(R.edge), edge2 = R.edge2 && rgb(R.edge2), lip = R.lip && rgb(R.lip);
    const lowC = R.low ? rgb(R.low) : mix(edgeC, rgb(s.paper), 0.3);
    const tintCache = new WeakMap(), groupCache = new WeakMap();
    const tintsOf = realms => {
      let t = tintCache.get(realms); if (t) return t;
      t = realms.map(r => {
        let c = r.color || "#888888";
        if (R.palette) { let hsh = 0; for (const ch of String(r.la || r.id || r.name || c)) hsh = (hsh * 31 + ch.charCodeAt(0)) | 0; c = R.palette[Math.abs(hsh) % R.palette.length]; }
        return mix(rgb(c), [255, 252, 240], R.pastel || 0);
      });
      tintCache.set(realms, t); return t;
    };
    // Realm groups for the world view: realms that are part of (or subject to) the same polity share a group.
    const groupsOf = realms => {
      let gr = groupCache.get(realms); if (gr) return gr;
      const first = new Map();
      gr = new Int32Array(realms.length + 1);
      realms.forEach((r, n) => {
        const p = (r.feature && r.feature.properties) || {}, key = r.la || p.part_of || r.subject || p.subject_of || p.SUBJECTO || r.name || r.id;
        if (!first.has(key)) first.set(key, n + 1);
        gr[n + 1] = first.get(key);
      });
      groupCache.set(realms, gr); return gr;
    };
    // Mean luminance of each class in the current terrain palette (the pixel world thread may repaint it).
    let meanFor = null; const meanL = new Float32Array(19);
    const means = () => {
      const T = global.PIXEL_PALETTE && global.PIXEL_PALETTE.TERRAIN; if (meanFor === T) return meanL;
      meanFor = T;
      for (let c = 0; c < 19; c++) {
        const [r, g, b] = rgb(c === 18 ? "#efe6cc" : T && T[c] ? T[c][1] : "#808080");
        meanL[c] = (r * 77 + g * 150 + b * 29) >> 8;
      }
      return meanL;
    };
    let graded = null, gradedKey = null;
    const P = { r: 0, g: 0, b: 0, c: 0, band: 0, hs: 0, d: 0, u: 0, v: 0, dl: 0 };
    function gradeTerrain(g) {
      const { terrain, base, cls, band, hs, w, h, U0, V0 } = g, ML = means(), bd = s.bandDither || 0, shade = s.shade;
      const view = new Uint8Array(base.buffer, base.byteOffset, base.length * 4);
      const red = s.redSea && typeof d3 !== "undefined" && areaMask(g, RED_SEA), redC = s.redSea && rgb(s.redSea);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const k = j * w + i, c = cls[k], ci = c === 255 ? 18 : c, u = U0 + i, v = V0 + j;
        let b = band[k];
        if (bd && ci < 18) { b += Math.round((BAYER[(v & 3) * 4 + (u & 3)] / 15 - 0.5) * bd); b = b < 0 ? 0 : b > 255 ? 255 : b; }
        const px = terrain[k], l = ((px & 255) * 77 + ((px >>> 8) & 255) * 150 + ((px >>> 16) & 255) * 29) >> 8;
        const dl = l - ML[ci], d = dl * DET[ci], o = ci * 256 + b;
        P.r = LR[o] + d; P.g = LG[o] + d; P.b = LB[o] + d;
        if (red && red[k * 4 + 3] > 127 && WATER(c)) { P.r = redC[0] + d * 0.5; P.g = redC[1] + d * 0.5; P.b = redC[2] + d * 0.5; }
        if (shade) { P.c = c; P.band = band[k]; P.hs = hs[k]; P.d = dist[k]; P.u = u; P.v = v; P.dl = dl; shade(P); }
        const q = k * 4;
        view[q] = clamp(P.r); view[q + 1] = clamp(P.g); view[q + 2] = clamp(P.b); view[q + 3] = 255;
      }
      const coast = s.coast && P_(s.coast), coast2 = s.coast2 && P_(s.coast2), coastLand = s.coastLand && rgb(s.coastLand);
      const WL = s.waterlines, wlc = WL && rgb(WL.color);
      for (let k = 0; k < w * h; k++) {
        const c = cls[k]; if (c === 255) continue;
        const dd = dist[k], i = k % w, j = (k / w) | 0;
        if (WATER(c)) {
          if (dd === 1 && coast) base[k] = coast;
          else if (coast2 && dd === 3 && ((i + j) & 1)) base[k] = coast2;
          else if (WL && WL.at.includes(dd) && (!WL.dot || ((U0 + i + V0 + j) % WL.dot) === 0)) blend(view, k, wlc, WL.fade ? WL.alpha * (1 - WL.at.indexOf(dd) / (WL.at.length + 1)) : WL.alpha);
        } else if (dd === 1 && coastLand) {
          const o = k * 4; view[o] = (view[o] + coastLand[0]) >> 1; view[o + 1] = (view[o + 1] + coastLand[1]) >> 1; view[o + 2] = (view[o + 2] + coastLand[2]) >> 1;
        }
      }
      if (s.rhumb) rhumbs(g, s.rhumb);
      if (s.graticule) graticule(g, s.graticule);
      if (s.rose) for (const ll of s.rose) rose(g, ll, s);
    }
    // Realms from the id buffer. Zoomed in: an edge in the style's ink (dashed if asked), a coloured ribbon just inside,
    // a light fill. World view (k < 3): solid edges between realm groups only, in a quieter colour, no ribbons.
    function realms(g, view) {
      const { ids, cls, w, h, U0, V0, k: zk } = g, tints = tintsOf(g.realms), low = zk < 3;
      const gid = low ? groupsOf(g.realms) : null, bw = low ? 0 : R.bandW || 0, dash = low ? 0 : R.dash;
      const land = m => cls[m] > 3 && cls[m] !== 255;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const k = j * w + i, n0 = ids[k]; if (n0 <= 0 || !land(k)) continue;
        const n = low ? gid[n0] : n0, idOf = m => { const x = ids[m]; return low && x > 0 ? gid[x] : x; };
        const other = m => idOf(m) !== n && land(m);
        const edge = (i + 1 < w && other(k + 1)) || (j + 1 < h && other(k + w)) || (i > 0 && other(k - 1)) || (j > 0 && other(k - w));
        // Off-register fill: the tint is taken from one pixel up and left, as if the colour plate slipped.
        const tn = R.shift && i > 0 && j > 0 && ids[k - w - 1] > 0 ? idOf(k - w - 1) : n, tc = tints[tn - 1]; if (!tc) continue;
        const o = k * 4;
        let a = R.fill;
        if (edge) {
          if (low) { view[o] = lowC[0]; view[o + 1] = lowC[1]; view[o + 2] = lowC[2]; continue; }
          if (!dash || ((U0 + i + V0 + j) % dash) !== dash - 1) {
            // Two-tone edges (gilding): the lower-right side of the line darker.
            const c = edge2 && ((i + 1 < w && other(k + 1)) || (j + 1 < h && other(k + w))) ? edge2 : edgeC;
            view[o] = c[0]; view[o + 1] = c[1]; view[o + 2] = c[2];
            if (lip && j + 1 < h && ids[k + w] === n0) blend(view, k + w, lip, 0.5);
            continue;
          }
          a = R.band;
        } else if (bw) {
          for (let d = 1; d <= bw; d++) if ((i + d < w && ids[k + d] !== n0) || (j + d < h && ids[k + d * w] !== n0) || (i >= d && ids[k - d] !== n0) || (j >= d && ids[k - d * w] !== n0)) { a = R.band; break; }
        }
        view[o] += (tc[0] - view[o]) * a; view[o + 1] += (tc[1] - view[o + 1]) * a; view[o + 2] += (tc[2] - view[o + 2]) * a;
      }
    }
    return compiled[id] = {
      id, name: s.name, family: s.family, accent: s.accent,
      glint: s.glint === null ? null : s.glint ? P_(s.glint) : undefined,
      grade(g) {
        viewCache(g);
        if (gradedKey !== g.key || !graded || graded.length !== g.base.length) { gradeTerrain(g); graded = g.base.slice(); gradedKey = g.key; }
        else g.base.set(graded);
        if (g.ids) realms(g, new Uint8Array(g.base.buffer, g.base.byteOffset, g.base.length * 4));
      },
      over(g) {
        if (s.creatures) creatures(g, s);
        frame(g, s.frame);
        plate(g, s);
      },
    };
  }

  // ---------- lines and marks drawn into the graded terrain ----------
  function blend(view, k, col, a) { const o = k * 4; view[o] += (col[0] - view[o]) * a; view[o + 1] += (col[1] - view[o + 1]) * a; view[o + 2] += (col[2] - view[o + 2]) * a; }
  function bres(x0, y0, x1, y1, put) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy, n = 0;
    for (;;) { put(x0, y0, n); if ((x0 === x1 && y0 === y1) || ++n > 8000) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
  }
  // Graticule: meridians and parallels every `step` degrees.
  function graticule(g, G) {
    const { base, cls, w, h, projection, at } = g, col = rgb(G.color), view = new Uint8Array(base.buffer, base.byteOffset, base.length * 4);
    const put = (i, j) => { if (i < 0 || j < 0 || i >= w || j >= h) return; const k = j * w + i, c = cls[k]; if (c !== 255) blend(view, k, col, WATER(c) ? G.sea : G.land); };
    const run = pts => {
      let prev = null;
      for (const ll of pts) {
        const p = projection(ll); if (!p) { prev = null; continue; }
        const q = at(p[0], p[1]), x = Math.floor(q[0]), y = Math.floor(q[1]);
        if (prev && Math.abs(x - prev[0]) < w * 0.5 && Math.abs(y - prev[1]) < h * 0.5) bres(prev[0], prev[1], x, y, put);
        prev = [x, y];
      }
    };
    const s = G.step, E = 179.999;
    for (let lon = -180; lon <= 180; lon += s) { const pts = []; for (let lat = -90; lat <= 90; lat += 1) pts.push([Math.max(-E, Math.min(E, lon)), lat]); run(pts); }
    for (let lat = -90 + s; lat < 90; lat += s) { const pts = []; for (let lon = -180; lon <= 180; lon += 1) pts.push([Math.max(-E, Math.min(E, lon)), lat]); run(pts); }
  }
  // Rhumb lines: 32 straight lines from each wind rose, 8 main winds in ink, 8 half winds in green, 16 quarter winds in red,
  // as on portolan charts. Strong over water, a whisper over land.
  const WINDS = [[42, 34, 28], [46, 120, 62], [176, 52, 40]];
  function rhumbs(g, Rh) {
    const { base, cls, w, h, projection, at } = g, view = new Uint8Array(base.buffer, base.byteOffset, base.length * 4), L = (w + h) * 2;
    for (const ll of Rh.roses) {
      const p = projection(ll); if (!p) continue;
      const [cx, cy] = at(p[0], p[1]);
      for (let d = 0; d < 32; d++) {
        const kind = d % 4 === 0 ? 0 : d % 2 === 0 ? 1 : 2, col = WINDS[kind], ang = d * Math.PI / 16;
        bres(cx, cy, cx + Math.sin(ang) * L, cy - Math.cos(ang) * L, (i, j, n) => {
          if (i < 0 || j < 0 || i >= w || j >= h || n < 6) return;
          const k = j * w + i, c = cls[k]; if (c === 255) return;
          blend(view, k, col, (WATER(c) ? Rh.sea : Rh.land) * (kind === 2 ? 0.75 : 1));
        });
      }
    }
  }
  // A compass rose: eight two-tone points (long cardinal, short intercardinal), a ring and a gilt north, at a world
  // position over open water. Drawn into the terrain so sprites and marks sit on top of it.
  function rose(g, ll, s) {
    const { base, cls, w, h, projection, at } = g, p = projection(ll); if (!p) return;
    const [fx, fy] = at(p[0], p[1]), cx = Math.round(fx), cy = Math.round(fy), Rr = 11;
    if (cx < -Rr || cy < -Rr || cx >= w + Rr || cy >= h + Rr) return;
    for (let j = -Rr; j <= Rr; j += 3) for (let i = -Rr; i <= Rr; i += 3) { const x = cx + i, y = cy + j; if (x >= 0 && y >= 0 && x < w && y < h && !WATER(cls[y * w + x])) return; }
    const ink = P_(s.ink), light = P_(s.paper), acc = P_(s.accent), gold = P_("#d8a32c");
    const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < w && y < h) base[y * w + x] = c; };
    for (let a = 0; a < 64; a++) { const t = a * Math.PI / 32; set(Math.round(cx + Math.cos(t) * 5.5), Math.round(cy + Math.sin(t) * 5.5), ink); }
    for (let d = 0; d < 8; d++) {
      const len = d % 2 ? 7 : Rr, ang = d * Math.PI / 4, ux = Math.sin(ang), uy = -Math.cos(ang), px = -uy, py = ux;
      for (let t = 0; t <= len; t++) {
        const half = Math.max(0, (1 - t / len) * 2.2);
        for (let q = -Math.ceil(half); q <= Math.ceil(half); q++) {
          if (Math.abs(q) > half + 0.25) continue;
          set(Math.round(cx + ux * t + px * q), Math.round(cy + uy * t + py * q), Math.abs(q) > half - 0.6 ? ink : q < 0 ? (d % 2 ? light : ink) : (d % 2 ? ink : light));
        }
      }
    }
    for (let t = Rr - 4; t <= Rr; t++) set(cx, cy - t, gold);
    set(cx, cy - Rr - 1, gold); set(cx - 1, cy - Rr, gold); set(cx + 1, cy - Rr, gold);
    set(cx, cy, acc); set(cx + 1, cy, acc); set(cx, cy + 1, acc); set(cx + 1, cy + 1, acc);
  }

  // ---------- drawn each paint ----------
  // Sea creatures in the outer ocean: at most two, only on open water (8+ pixels from any coast), never touching a
  // sprite or a lens mark (pixels the overlay changed), and not when zoomed in close.
  const LAIRS = [[-38, 46], [-22, -32], [82, -32], [-150, 2], [160, 30], [-125, -38]];
  function creatures(g, s) {
    const { out, pre, w, h, cls, sprite, projection, at, frame: fr, k } = g; if (k > 6 || !dist || dist.length !== w * h) return;
    const pal = { k: P_(s.ink), a: P_(s.id === "mappa" ? "#5a7a5a" : "#6a6a70"), b: P_(s.paper), r: P_(s.accent), w: P_("#f8f4ea") };
    let shown = 0;
    LAIRS.forEach((ll, n) => {
      if (shown >= 2) return;
      const p = projection(ll); if (!p) return;
      const art = CREATURES[n % 2 ? "whale" : "serpent"], aw = art[0].length, ah = art.length;
      const [fx, fy] = at(p[0], p[1]), x0 = Math.round(fx) - (aw >> 1), y0 = Math.round(fy) - ah + ((fr >> 1) & 1);
      if (x0 < 10 || y0 < 10 || x0 + aw >= w - 10 || y0 + ah >= h - 10) return;
      for (let y = -1; y <= ah; y++) for (let x = -1; x <= aw; x++) {
        const q = (y0 + y) * w + x0 + x;
        if (!WATER(cls[q]) || dist[q] < 8 || (sprite && sprite[q]) || (pre && pre[q] !== out[q])) return;
      }
      for (let y = 0; y < ah; y++) for (let x = 0; x < aw; x++) { const ch = art[y][x]; if (ch !== ".") out[(y0 + y) * w + x0 + x] = pal[ch]; }
      shown++;
    });
  }

  // The shared neatline at the edge of the visible map (g.vis = first and last art pixels fully on screen): ink rule,
  // a 3-px band of alternating blocks in the era's colours (Bartholomew's degree ladder), ink rule, paper gap, fine rule,
  // with an era corner piece. Same geometry in every era.
  const FRAME_W = 7;
  function framer(g) {
    const { out, w, h, vis } = g, [i0, j0, i1, j1] = vis;
    const set = (i, j, c) => { if (i >= 0 && j >= 0 && i < w && j < h) out[j * w + i] = c; };
    const ring = (d, fn) => {
      for (let i = i0 + d; i <= i1 - d; i++) { fn(i, j0 + d, i - i0); fn(i, j1 - d, i - i0); }
      for (let j = j0 + d + 1; j < j1 - d; j++) { fn(i0 + d, j, j - j0); fn(i1 - d, j, j - j0); }
    };
    const box = (x, y, bw, bh, edge, fill) => { for (let yy = 0; yy < bh; yy++) for (let xx = 0; xx < bw; xx++) set(x + xx, y + yy, xx === 0 || yy === 0 || xx === bw - 1 || yy === bh - 1 ? edge : fill); };
    const corners = (sz, fn) => { for (const [cx, cy] of [[i0, j0], [i1 - sz + 1, j0], [i0, j1 - sz + 1], [i1 - sz + 1, j1 - sz + 1]]) fn(cx, cy); };
    return { set, ring, box, corners, i0, j0, i1, j1, w, h, out };
  }
  const CORNERS = {
    box(f, x, y, c) { f.box(x, y, 5, 5, c.ink, c.paper); },
    roundel(f, x, y, c) { for (let yy = -3; yy <= 3; yy++) for (let xx = -3; xx <= 3; xx++) { const r = Math.hypot(xx, yy); if (r <= 3.4) f.set(x + 2 + xx, y + 2 + yy, r > 2.5 ? c.ink : r > 1.2 ? c.b : c.a); } },
    star(f, x, y, c) { f.box(x - 1, y - 1, 7, 7, c.ink, c.a); STAR8.forEach((row, yy) => [...row].forEach((ch, xx) => { if (ch === "#") f.set(x - 1 + xx, y - 1 + yy, c.b); })); },
    strap(f, x, y, c) { f.box(x - 1, y - 1, 7, 7, c.ink, c.paper); f.box(x + 1, y + 1, 3, 3, c.ink, c.paper); f.set(x + 2, y + 2, c.ink); },
    register(f, x, y, c) {
      f.box(x, y, 5, 5, c.paper, c.paper);
      for (let t = -2; t <= 2; t++) { f.set(x + 2 + t, y + 2, c.ink); f.set(x + 2, y + 2 + t, c.ink); }
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) f.set(x + 2 + dx * 2, y + 2 + dy, c.ink), f.set(x + 2 + dx, y + 2 + dy * 2, c.ink);
    },
  };
  const frameCols = new WeakMap();
  function frame(g, fr) {
    let c = frameCols.get(fr);
    if (!c) frameCols.set(fr, c = { ink: P_(fr.ink), paper: P_(fr.paper), a: P_(fr.a), b: P_(fr.b), c: fr.c ? P_(fr.c) : null });
    const f = framer(g), seq = c.c ? [c.a, c.b, c.c, c.b] : [c.a, c.b];
    f.ring(0, (i, j) => f.set(i, j, c.ink));
    for (let d = 1; d <= 3; d++) f.ring(d, (i, j, t) => f.set(i, j, seq[((t / 12) | 0) % seq.length]));
    f.ring(4, (i, j) => f.set(i, j, c.ink)); f.ring(5, (i, j) => f.set(i, j, c.paper)); f.ring(6, (i, j) => f.set(i, j, c.ink));
    f.corners(5, (x, y) => CORNERS[fr.corner || "box"](f, x, y, c));
  }

  // Title plate, centred on the top edge: the era's title and the year in its own numerals (and the silk scroll's seal).
  function plate(g, s) {
    const t = s.title ? s.title(curYear) : {};
    const lines = [];
    if (s.seal) lines.push({ seal: true });
    if (t.glyphs === "cuneiform") lines.push({ cune: 13 });
    else if (t.text) lines.push({ text: t.text });
    if (t.sub) lines.push({ text: t.sub });
    if (!lines.length) return;
    const f = framer(g), ink = P_(s.plateInk || s.ink), fill = P_(s.plate || s.paper), edge = P_(s.ink);
    const widthOf = l => l.cune ? l.cune * 4 - 1 : l.seal ? 18 : textWidth(l.text), heightOf = l => l.seal ? 10 : 5;
    const pw = Math.max(...lines.map(widthOf)) + (t.star ? 10 : 0) + 8, ph = lines.reduce((a, l) => a + heightOf(l) + 2, 0) + 4;
    const cx = Math.round((f.i0 + f.i1) / 2), x0 = cx - (pw >> 1) - (t.star ? 5 : 0), y0 = f.j0 + 2;
    if (pw > f.i1 - f.i0 - 40) return;
    f.box(x0, y0, pw, ph, edge, fill);
    let y = y0 + 3;
    for (const l of lines) {
      const x = cx - (widthOf(l) >> 1) - (t.star ? 5 : 0);
      if (l.text) {
        let xx = x;
        for (const ch of l.text) { const gl = F[ch] || F[" "]; gl.forEach((row, r) => [...row].forEach((p, q) => { if (p === "#") f.set(xx + q, y + r, ink); })); xx += gl[0].length + 1; }
      } else if (l.cune) for (let n = 0; n < l.cune; n++) {
        // Pseudo-cuneiform: wedge heads and tails, a different cluster for each sign.
        const r = hash(n, 7);
        const cells = r < 0.33 ? [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2], [1, 3]] : r < 0.66 ? [[0, 1], [1, 1], [2, 1], [0, 0], [0, 2], [2, 3]] : [[0, 0], [0, 1], [1, 1], [2, 2], [2, 3], [0, 3]];
        for (const [a, b] of cells) f.set(x + n * 4 + a, y + b, ink);
      } else if (l.seal) {
        // A square red seal with the two characters reserved in white (baiwen).
        const red = P_("#b8322a"), white = P_("#f2e6cc");
        f.box(x, y, 18, 10, red, red);
        SEAL.forEach((gl, n) => gl.forEach((row, yy) => [...row].forEach((ch, xx) => { if (ch === "#") f.set(x + 1 + n * 9 + xx, y + 1 + yy, white); })));
      }
      y += heightOf(l) + 2;
    }
    if (t.star) {
      const gold = P_("#e8c060"), sx = x0 + pw - 9, sy = y0 + (ph >> 1) - 3;
      STAR8.forEach((row, yy) => [...row].forEach((ch, xx) => { if (ch === "#") f.set(sx + xx, sy + yy, gold); }));
    }
  }

  function chrome(root, id) {
    const s = STYLES[id];
    root = root || document.documentElement;
    root.dataset.era = id || "now";
    const v = s ? { "--era-accent": s.accent, "--era-ink": s.ink, "--era-paper": s.paper, "--era-frame-a": s.frame.a, "--era-frame-b": s.frame.b } : {};
    for (const k of ["--era-accent", "--era-ink", "--era-paper", "--era-frame-a", "--era-frame-b"]) if (v[k]) root.style.setProperty(k, v[k]); else root.style.removeProperty(k);
  }

  global.PixelEras = { LIST, STYLES, FRAME_W, pick, style, chrome, setYear(y) { curYear = y; }, roman, hijri, arabic };
})(typeof window !== "undefined" ? window : globalThis);
