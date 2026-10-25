// Lens marks in the pixel grid (house rule 2: one world, one grid). Every mark a lens puts on the map, its pins,
// routes, the selection and the guide's pins, is painted as a pixel icon or a pixel dash into the PixelMap's own
// canvas, after the sprites, so nothing floats on top of the art as an SVG hairline.
//
//   const mk = PixelMarks(svgEl)       mk.set({points, lines}) to hand it records, or mk.fromSvg() to read the page's SVG
//   pm.overlay(mk.paint)               PixelMap calls paint(g) at the end of every paint
//
// Records (the same shape the scrubbing work's ATLAS.marks() gives):
//   points {lon, lat, kind, shape, color, hi, ghost, size, fade}
//     kind  city | person | hub | shock | reached | school | work | stop | order | broke | battle | choke | lens | sel | pin
//     shape circle | square | diamond | cross | triangle (kind "lens"); size is the old SVG radius in CSS px
//   lines  {poly: [[x, y], ...] projected, or pts: [[lon, lat], ...], color, kind, dash, arrow, ghost, fade}
// Colours are CSS colours; city and battle marks step aside where a sprite already stands for them.
(function (global) {
  const rgbOf = s => { const m = String(s).match(/[\d.]+/g); return m && m.length >= 3 ? [+m[0], +m[1], +m[2]] : [128, 128, 128]; };
  const pack = ([r, g, b]) => (255 << 24 | b << 16 | g << 8 | r) >>> 0;
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const INK = [34, 31, 26], PAPER = [246, 240, 220];

  // Icons: k ink outline, c the lens colour, d its shade, l its light, w paper. Anchored at the centre unless [ax, ay].
  const ICON = {
    dot3: [".k.", "kck", ".k."],
    dot5: [".kkk.", "kllck", "klcck", "kccdk", ".kkk."],
    dot7: ["..kkk..", ".kllck.", "kllccck", "klcccdk", "kcccddk", ".kcddk.", "..kkk.."],
    ring7: ["..kkk..", ".kccck.", "kcwwwck", "kcwwwck", "kcwwwdk", ".kcddk.", "..kkk.."],
    square: ["kkkkkk", "klllck", "klccck", "klccdk", "kcdddk", "kkkkkk"],
    diamond: ["...k...", "..klk..", ".klcck.", "klcccdk", ".kccdk.", "..kdk..", "...k..."],
    coin: ["...k...", "..klk..", ".klwck.", "klwwwdk", ".kcwdk.", "..kdk..", "...k..."],
    cross: ["kk...kk", "kck.kck", ".kckck.", "..kck..", ".kckck.", "kck.kck", "kk...kk"],
    triangle: ["...k...", "..klk..", "..kck..", ".klcck.", ".kccdk.", "klcccdk", "kkkkkkk"],
    hourglass: ["kkkkkkk", "kwcccdk", ".kccdk.", "..kck..", ".kclck.", "klcccdk", "kkkkkkk"],
    book: [".kk.kk.", "kwwkwwk", "kwwkwwk", "kwwkwwk", "kcckcdk", ".kk.kk."],
    page: ["kkkkk.", "kwwwkk", "kcccwk", "kwwwwk", "kccwwk", "kwwwwk", "kkkkkk"],
    swords: ["kk...kk", "kwk.kwk", ".kwkwk.", "..kwk..", ".kdkdk.", "kck.kck", "kk...kk"],
    flag: [["kk....", "kcck..", "kcccck", "kccck.", "kck...", "kk....", "k.....", "kk...."], 0, 7],
    arrow: [["kkkkkkk", "kwwwwwk", ".kwwwk.", "..kwk..", "...k..."], 3, 4],
  };
  for (const n in ICON) {
    const v = Array.isArray(ICON[n][0]) ? ICON[n] : [ICON[n]], rows = v[0], wd = rows[0].length;
    ICON[n] = { rows, ax: v[1] ?? (wd >> 1), ay: v[2] ?? (rows.length >> 1) };
  }
  const SHAPE_ICON = { circle: "dot5", square: "square", diamond: "diamond", cross: "cross", triangle: "triangle" };
  const KIND_ICON = { city: "dot5", hub: "coin", reached: "dot3", school: "book", work: "page", broke: "cross", battle: "swords", choke: "hourglass", pin: "flag", sel: "arrow" };
  // Dash patterns in art pixels [on, off]; marching ones move a pixel a frame in the direction of travel.
  const DASH = { trade: [4, 2, 1], mig: [2, 2, 1], bd: [1, 1, 0], leg: [3, 2, 1], lpath: [3, 2, 0], route: [5, 2, 1], ring: [2, 2, 0] };
  const ORDER = { city: 1, person: 2, school: 3, work: 3, stop: 3, hub: 4, reached: 4, lens: 5, broke: 6, choke: 6, battle: 6, pin: 9, sel: 10 };

  function PixelMarks(svg, projection) {
    let points = [], lines = [], dirty = true;
    const colorCache = new Map(), polyCache = new WeakMap();
    const probe = document.createElement("i");
    const tone = c => { // any CSS colour to [r, g, b] (var() and color-mix included), cached
      let v = colorCache.get(c);
      if (!v) {
        if (/^#[0-9a-f]{6}$/i.test(c)) v = [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
        else { probe.style.color = c; document.body.appendChild(probe); v = rgbOf(getComputedStyle(probe).color); probe.remove(); }
        colorCache.set(c, v);
      }
      return v;
    };
    // A d3.geoPath "d" (M, L, Z only) as projected polylines.
    function parseD(d) {
      const out = []; let cur = null;
      const re = /([MLZ])([^MLZ]*)/gi; let m;
      while ((m = re.exec(d))) {
        const c = m[1].toUpperCase(), n = m[2].match(/-?[\d.]+(?:e-?\d+)?/gi) || [];
        if (c === "Z") { if (cur && cur.length) cur.push(cur[0]); continue; }
        if (c === "M") { cur = []; out.push(cur); }
        for (let i = 0; i + 1 < n.length; i += 2) cur && cur.push([+n[i], +n[i + 1]]);
      }
      return out.filter(p => p.length > 1);
    }
    // Records with lon/lat points: great-circle resampled and clipped by d3, recorded as projected polylines.
    function project(pts) {
      const out = []; let cur = null;
      if (Array.isArray(pts) && pts.length > 1) d3.geoPath(projection, {
        moveTo(x, y) { out.push(cur = [[x, y]]); }, lineTo(x, y) { cur && cur.push([x, y]); }, closePath() {}, beginPath() {}, arc() {},
      })({ type: "LineString", coordinates: pts });
      return out.filter(p => p.length > 1);
    }
    const polysOf = el => { const d = el.getAttribute("d") || ""; let c = polyCache.get(el); if (!c || c.d !== d) polyCache.set(el, c = { d, polys: parseD(d) }); return c.polys; };

    // Adapter until the page hands over records: read what the SVG layers drew (d3 data, classes, computed colours).
    const PT_KINDS = ["city", "person", "hub", "shock", "reached", "school", "work", "stop", "order", "broke", "battle", "choke", "lp", "sel", "pin"];
    const LINE_KINDS = ["trade", "mig", "bd", "leg", "lpath", "route"];
    const STROKE = { stop: 1, school: 1, broke: 1, battle: 1, shock: 1, pin: 0 };
    const styleOf = new Map();
    function fromSvg() {
      points = []; lines = []; styleOf.clear();
      const layerFade = el => { const g = el.closest("g[data-layer]"); if (!g) return 1; let f = styleOf.get(g); if (f == null) { f = (+getComputedStyle(g).opacity || 0) * (g.classList.contains("dim") ? 0.4 : 1); styleOf.set(g, f); } return f; };
      for (const el of svg.querySelectorAll(".pt")) {
        if (el.closest(".g-terrain")) continue;
        const d = el.__data__; if (!d || !isFinite(d.lon) || !isFinite(d.lat)) continue;
        const cl = el.classList, k0 = PT_KINDS.find(k => cl.contains(k)); if (!k0) continue;
        const kind = k0 === "lp" ? "lens" : k0;
        let shp = el.firstElementChild; while (shp && (shp.tagName === "title" || shp.tagName === "text" || shp.classList.contains("ring") || shp.classList.contains("pulse"))) shp = shp.nextElementSibling;
        if (!shp || shp.tagName === "image") continue; // plugin sprites stay as they are
        const shape = kind !== "lens" ? null : shp.tagName === "circle" ? "circle" : shp.tagName === "rect" ? "square" : shp.classList.contains("x") ? "cross" : /^M0-5/.test(shp.getAttribute("d") || "") ? "triangle" : "diamond";
        const key = kind + "|" + (shape || "") + "|" + el.getAttribute("class") + "|" + (el.getAttribute("style") || "").replace(/opacity:[^;]*;?/, "") + "|" + (shp.getAttribute("class") || "");
        let col = styleOf.get(key);
        if (!col) { const cs = getComputedStyle(shp); col = (STROKE[kind] || shape === "cross") || cs.fill === "none" ? cs.stroke : cs.fill; styleOf.set(key, col); }
        const fade = (el.style.opacity ? +el.style.opacity : 1) * layerFade(el);
        points.push({ lon: d.lon, lat: d.lat, kind, shape, color: col, fade, size: +shp.getAttribute("r") || 0,
          hi: cl.contains("hi") || cl.contains("now") || (kind === "battle" && cl.contains("always")) || (kind === "person" && cl.contains("top")),
          ghost: cl.contains("ghost"), famine: cl.contains("famine"), critical: cl.contains("critical") });
      }
      for (const el of svg.querySelectorAll("path.line, path.route, path.selring")) {
        if (el.closest(".g-terrain")) continue;
        const cl = el.classList, kind = cl.contains("selring") ? "ring" : LINE_KINDS.find(k => cl.contains(k)); if (!kind) continue;
        const polys = polysOf(el); if (!polys.length) continue;
        const cs = getComputedStyle(el);
        lines.push({ polys, kind, color: kind === "ring" ? "#221f1a" : cs.stroke, arrow: !!el.getAttribute("marker-end"), ghost: cl.contains("ghost"),
          dashed: cl.contains("forced") || cl.contains("cut"), fade: Math.min(1, (+cs.strokeOpacity || 1) / 0.75) * layerFade(el) });
      }
      dirty = false;
    }

    // ---------- painting ----------
    let G = null, sk = null;
    const blend = (k, c, a) => { const o = G.out[k]; G.out[k] = a >= 0.99 ? c : pack(mix([o & 255, (o >> 8) & 255, (o >> 16) & 255], [c & 255, (c >> 8) & 255, (c >> 16) & 255], a)); };
    const put = (i, j, c, a) => { if (i >= 0 && j >= 0 && i < G.w && j < G.h) blend(j * G.w + i, c, a); };
    function tones(color) {
      const c = tone(color);
      return { k: pack(INK), c: pack(c), d: pack(mix(c, [20, 16, 14], 0.42)), l: pack(mix(c, [255, 255, 255], 0.38)), w: pack(PAPER) };
    }
    function icon(name, i, j, T, a = 1, ghost = false) {
      const I = ICON[name]; if (!I) return;
      I.rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) {
        const ch = row[x]; if (ch === ".") continue;
        // Speculative marks are drawn as a dotted outline only.
        if (ghost && (ch !== "k" || ((x + y) & 1))) continue;
        put(i + x - I.ax, j + y - I.ay, ghost ? T.c : T[ch], a);
      } });
    }
    // Corner brackets that blink: the highlighted mark.
    function brackets(i, j, r, a) {
      if (G.frame & 2) return;
      const c = pack(PAPER), k = pack(INK);
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) for (const [dx, dy] of [[0, 0], [-1, 0], [0, -1]]) {
        const x = i + sx * r + (sx < 0 ? -dx : dx), y = j + sy * r + (sy < 0 ? -dy : dy);
        put(x + sx, y, k, a); put(x, y + sy, k, a); put(x, y, c, a);
      }
    }
    function circle(ci, cj, R, T, o) {
      // A pixel circle: ink outside, colour ring, sparse checker fill; dotted when o.dotted.
      const R2o = (R + 0.5) ** 2, R2i = (R - 0.5) ** 2, R2k = (R + 1.5) ** 2, fill = o.fill || 0;
      for (let y = -R - 2; y <= R + 2; y++) for (let x = -R - 2; x <= R + 2; x++) {
        const q = x * x + y * y, i = ci + x, j = cj + y;
        if (q <= R2o && q >= R2i) { if (!o.dotted || ((Math.atan2(y, x) * R) | 0) % 3 !== 0) put(i, j, T.c, o.a); }
        else if (q > R2o && q <= R2k && !o.dotted && o.ink) put(i, j, T.k, o.a * 0.8);
        else if (q < R2i && fill && ((i + j) & 1) === 0 && (fill > 0.4 || ((i >> 1) + j) & 1)) put(i, j, T.c, o.a * 0.6);
      }
    }
    // Lines: a 1-px dash in the colour over a 1-px shadow, walked pixel by pixel; the pattern counter runs along the line.
    function line(L) {
      const T = tones(L.color), a = Math.max(0.25, L.fade ?? 1), dash = L.ghost ? [1, 3, 0] : L.dashed ? [3, 3, 1] : DASH[L.kind] || [3, 2, 0];
      const per = dash[0] + dash[1], march = dash[2] ? G.frame : 0, shadow = L.kind !== "ring";
      const pix = [];
      let s = 0, lastDir = null, end = null;
      for (const poly of L.polys) {
        let prev = null;
        for (const p of poly) {
          const q = G.at(p[0], p[1]), x = Math.floor(q[0]), y = Math.floor(q[1]);
          if (prev) {
            let x0 = prev[0], y0 = prev[1]; const dx = Math.abs(x - x0), dy = -Math.abs(y - y0), sx = x0 < x ? 1 : -1, sy = y0 < y ? 1 : -1;
            // Skip segments far off the frame.
            if (!((x0 < -50 && x < -50) || (y0 < -50 && y < -50) || (x0 > G.w + 50 && x > G.w + 50) || (y0 > G.h + 50 && y > G.h + 50) || dx > 4000 || -dy > 4000)) {
              let e = dx + dy;
              for (;;) {
                if (((s - march) % per + per) % per < dash[0]) pix.push(x0, y0);
                s++;
                if (x0 === x && y0 === y) break;
                const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; }
              }
              if (x !== prev[0] || y !== prev[1]) lastDir = [x - prev[0], y - prev[1]];
            }
          }
          prev = [x, y]; end = prev;
        }
      }
      if (shadow) for (let n = 0; n < pix.length; n += 2) put(pix[n], pix[n + 1] + 1, T.d, a * 0.9);
      for (let n = 0; n < pix.length; n += 2) put(pix[n], pix[n + 1], T.c, a);
      // Arrowhead: a pixel chevron at the end of the last segment.
      if (L.arrow && end && lastDir) {
        const len = Math.hypot(lastDir[0], lastDir[1]) || 1, ux = lastDir[0] / len, uy = lastDir[1] / len;
        for (const side of [-1, 1]) for (let t = 0; t <= 3; t++) {
          const x = Math.round(end[0] - ux * t + uy * side * t * 0.9), y = Math.round(end[1] - uy * t - ux * side * t * 0.9);
          put(x, y + 1, T.k, a); put(x, y, T.c, a);
        }
      }
    }
    // Is there a sprite drawn within r pixels of (i, j)?
    function covered(i, j, r) {
      for (let y = j - r - 3; y <= j + 1; y++) for (let x = i - r; x <= i + r; x++) if (x >= 0 && y >= 0 && x < G.w && y < G.h && G.sprite[y * G.w + x]) return true;
      return false;
    }
    function point(m, i, j) {
      const T = tones(m.color), a = Math.max(0.2, Math.min(1, m.fade ?? 1)), PX = G.px;
      switch (m.kind) {
        case "city": case "battle":
          if (!m.hi && covered(i, j, 2)) return; // the city or army sprite already marks it
          icon(KIND_ICON[m.kind], i, j, T, a); if (m.hi) brackets(i, j, 4, a); return;
        case "person": icon(m.size >= 4 ? "dot7" : "dot5", i, j, T, a); if (m.hi && m.size >= 5) brackets(i, j, 4, a); return;
        case "stop": icon(m.hi ? "dot7" : "ring7", i, j, T, a); if (m.hi) brackets(i, j, 4, a); return;
        case "order": circle(i, j, Math.max(2, Math.round(m.size / PX)), T, { a: a * 0.95, ink: true, fill: m.critical ? 0.5 : 0.25 }); return;
        case "shock": {
          const R = Math.max(2, Math.round(m.size / PX));
          circle(i, j, R, T, { a, ink: !m.famine, dotted: m.famine });
          // A ripple that spreads from the centre every few frames.
          const f = G.frame % 4; if (f) circle(i, j, R + f, T, { a: a * (0.6 - f * 0.12), dotted: true });
          icon("dot3", i, j, T, a); return;
        }
        case "lens": icon(SHAPE_ICON[m.shape] || "dot5", i, j, T, a, m.ghost); if (m.hi) brackets(i, j, 4, a); return;
        case "pin": icon("flag", i, j, { ...T, c: pack([200, 64, 48]), d: pack([124, 32, 24]) }, 1); return;
        case "sel": {
          // You are here: a bobbing cursor over the clicked spot, and a small cross on the spot itself.
          icon("arrow", i, j - 4 - (G.frame & 1), tones("#f6f0dc"), 1);
          put(i, j, pack(INK), 1); put(i - 1, j, pack(PAPER), 1); put(i + 1, j, pack(PAPER), 1); put(i, j - 1, pack(PAPER), 1); put(i, j + 1, pack(PAPER), 1);
          return;
        }
        default: icon(KIND_ICON[m.kind] || "dot5", i, j, T, a); if (m.hi) brackets(i, j, 4, a);
      }
    }

    function paint(g) {
      if (dirty && svg) fromSvg();
      G = g;
      for (const L of lines) { if (!L.polys) L.polys = project(L.pts); line(L); }
      const proj = projection;
      const list = [];
      for (const m of points) {
        const p = proj && proj([m.lon, m.lat]); if (!p) continue;
        const q = g.at(p[0], p[1]), i = Math.floor(q[0]), j = Math.floor(q[1]);
        if (i < -12 || j < -12 || i > g.w + 12 || j > g.h + 12) continue;
        list.push([m, i, j]);
      }
      // Big rings first, then small icons north to south, then the selection and guide pins on top.
      list.sort((A, B) => (ORDER[A[0].kind] || (A[0].kind === "order" || A[0].kind === "shock" ? 0 : 5)) - (ORDER[B[0].kind] || (B[0].kind === "order" || B[0].kind === "shock" ? 0 : 5)) || A[2] - B[2]);
      for (const [m, i, j] of list) point(m, i, j);
      G = null;
    }

    return {
      paint,
      fromSvg,
      // Hand over records instead of reading the SVG (lines keep their polys once projected).
      set(r) { points = (r && r.points) || []; lines = ((r && r.lines) || []).map(L => ({ ...L, polys: L.polys || null })); dirty = false; svg = null; },
      markDirty() { dirty = true; },
      get dirty() { return dirty; },
      get count() { return { points: points.length, lines: lines.length }; },
    };
  }
  PixelMarks.ICON = ICON;
  global.PixelMarks = PixelMarks;
})(typeof window !== "undefined" ? window : globalThis);
