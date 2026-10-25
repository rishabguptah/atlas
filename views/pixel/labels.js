// One label engine for the whole map: every name from every layer (realms, seas, rivers, provinces, cities, lens
// marks) goes into one priority queue with collision boxes and one budget per zoom; the highest priority wins, the
// rest wait for more room. Winners are lettered in the pixel font in one SVG layer; labels drawn elsewhere (the
// page's SVG lens labels) take part through `extra` and are shown or hidden in place.
//
// Sources register once and are asked for their labels on every layout pass (zoom end, pan end, year, toggles):
//   ATLAS.labels.add(id, view => items, { base: true })   base: a basemap source, which steps back when a lens has focus
//   ATLAS.labels.refresh()                                  a source's data changed (arrived async, new year): lay out again
//   view = { k, year, W, H, focus, project(lon, lat) -> [x, y] screen px or null }
//   item = { text, pri: 0-100, style, size?: px, spacing?: em, fill?, minK?,
//            at: [lon, lat] | line: [[lon, lat], ...] (lettered along it) | path: [[x, y], ...] (screen px, lettered along it) }
//          or { block: [x0, y0, x1, y1] } (screen px): space a base source's terrain names keep off (town and army sprites)
// Realm names are background lettering on their own plane: they keep clear of each other and of terrain names, and the
// labels of marks (cities, battles, people) sit on top of them, as on a strategy map; everything else never overlaps.
//   styles: realm, province, ocean, sea, river, high (ranges, plateaus), land (deserts, plains), peak, place
// Priorities: selected 100; focused-lens labels about 75-85, always-on ones 72; realm names 64-84 by area; oceans and big seas
// 60-70; cities 44-60 by size; provinces 52-58; ranges, rivers, deserts 25-50 by tier; people 20-35.
//
// The page owns the engine:
//   const L = ATLAS.labels.mount(container, projection, beforeEl)
//   L.layout(t, W, H, { year, focus, extra: [{ pri, box: [x0, y0, x1, y1], show(on), note? }] })   note: a lens annotation
//   L.move(t)          on every zoom frame: shift the drawn labels with CSS until the next layout
//   L.setMood(m)       day | dusk | night | winter | chronicle
//   L.measure(text, size, weight) -> width in px
// Standalone (the pixel preview): const L = MapLabels(container, projection); L.add(id, fn); L.layout(t, W, H).
(function (global) {
  const NS = "http://www.w3.org/2000/svg";
  const FONT = '"Pixelify Sans", "Silkscreen", ui-monospace, monospace';
  const STYLES = {
    realm: { size: 16, weight: 700, caps: true, spacing: 0.3 },
    province: { size: 12, weight: 500, caps: true, spacing: 0.16 },
    ocean: { size: 16, weight: 500, caps: true, spacing: 0.5 },
    sea: { size: 12, weight: 600, caps: true, spacing: 0.3 },
    river: { size: 12, weight: 500, caps: false, spacing: 0.1 },
    high: { size: 12, weight: 600, caps: true, spacing: 0.22 },
    land: { size: 12, weight: 500, caps: true, spacing: 0.18 },
    peak: { size: 12, weight: 500, caps: false, spacing: 0 },
    place: { size: 12, weight: 600, caps: false, spacing: 0.02 },
  };
  // Art direction (D2, D5): Pixelify at 12/16/24/32/48 px only; colour lives on the glyph, never on the text.
  const SCALE = [12, 16, 24, 32, 48];
  const snap = fs => { let v = SCALE[0]; for (const s of SCALE) if (s <= fs) v = s; return v; };
  const STYLE = `
svg.map-labels { position: absolute; left: 0; top: 0; pointer-events: none; overflow: visible; transform-origin: 0 0; }
svg.map-labels text { font-family: ${FONT}; paint-order: stroke; stroke-linejoin: round; stroke-width: 2.6px; }
svg.map-labels .lb-realm { fill: #221f1a; stroke: rgba(246, 240, 220, .55); stroke-width: 3.5px; opacity: .8; }
svg.map-labels .lb-province { fill: #5a3a1a; stroke: rgba(246, 240, 220, .7); }
svg.map-labels .lb-ocean, svg.map-labels .lb-sea, svg.map-labels .lb-river { fill: #d6eef0; stroke: rgba(18, 46, 64, .85); }
svg.map-labels .lb-ocean { stroke: rgba(18, 46, 64, .55); }
svg.map-labels .lb-high, svg.map-labels .lb-land, svg.map-labels .lb-peak { fill: #5a3a1a; stroke: rgba(246, 240, 220, .8); stroke-width: 2.8px; }
svg.map-labels .lb-place { fill: #f6f0dc; stroke: #221f1a; stroke-width: 3px; }
svg.map-labels.m-night .lb-realm, svg.map-labels.m-night .lb-province, svg.map-labels.m-night .lb-high, svg.map-labels.m-night .lb-land,
svg.map-labels.m-night .lb-peak { fill: #efe2c0; stroke: rgba(16, 20, 36, .8); }
svg.map-labels.m-chronicle .lb-sea, svg.map-labels.m-chronicle .lb-ocean { fill: #f4e8cc; stroke: rgba(70, 44, 20, .7); }
svg.map-labels.quiet .base { opacity: .5; }
svg.map-labels g { transition: opacity .3s; }
`;
  const measureCtx = (typeof document !== "undefined" ? document.createElement("canvas") : null)?.getContext("2d");
  const widths = new Map();
  function measure(text, size, weight = 600) {
    const key = weight + "|" + size + "|" + text;
    let v = widths.get(key);
    if (v == null) {
      if (measureCtx) { measureCtx.font = `${weight} ${size}px ${FONT}`; v = measureCtx.measureText(text).width; }
      else v = text.length * size * 0.6;
      if (widths.size > 20000) widths.clear();
      widths.set(key, v);
    }
    return v;
  }
  // Cumulative lengths of a screen polyline, and the point and direction at a distance along it.
  function arc(pts) { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return c; }
  function at(pts, c, s) {
    let i = 1; while (i < pts.length - 1 && c[i] < s) i++;
    const a = pts[i - 1], b = pts[i], L = c[i] - c[i - 1] || 1, f = Math.max(0, Math.min(1, (s - c[i - 1]) / L));
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, (b[0] - a[0]) / L, (b[1] - a[1]) / L];
  }

  function MapLabels(container, projection, opts = {}) {
    const doc = container.ownerDocument;
    if (!doc.getElementById("map-labels-style")) { const st = doc.createElement("style"); st.id = "map-labels-style"; st.textContent = STYLE; doc.head.appendChild(st); }
    const svg = doc.createElementNS(NS, "svg"); svg.setAttribute("class", "map-labels m-day");
    const defs = doc.createElementNS(NS, "defs"), g = doc.createElementNS(NS, "g");
    svg.append(defs, g);
    if (opts.before && opts.before.parentNode === container) container.insertBefore(svg, opts.before); else container.appendChild(svg);
    const sources = opts.sources || [];
    const uid = "ml" + Math.random().toString(36).slice(2, 7);
    let last = null, mood = "day", debug = null;
    // Shapes depend only on the view, so while the year scrubs they are reused; the drawing is redone only when the
    // set of winners changes.
    let shapes = new WeakMap(), shapeKey = "", drawnList = [];

    // Screen geometry for one item: its collision boxes and how to draw it, or null if it cannot be placed here.
    function shape(it, view) {
      const st = STYLES[it.style] || STYLES.place;
      const fs = snap(it.size || st.size), sp = it.spacing != null ? it.spacing : st.spacing, wt = it.weight || st.weight;
      const text = st.caps ? String(it.text).toUpperCase() : String(it.text);
      const tw = measure(text, fs, wt) + text.length * sp * fs;
      const { W, H } = view, base = { text, fs, sp, wt, st, cls: "lb-" + (STYLES[it.style] ? it.style : "place") + (it.base ? " base" : ""), fill: it.fill };
      if (it.at) {
        const p = view.project(it.at[0], it.at[1]); if (!p) return null;
        const [x, y] = p;
        if (x < 0 || y < 0 || x > W || y > H) return null;
        const peak = it.style === "peak";
        const box = peak ? [x - 4, y - fs, x + 8 + tw, y + 4] : [x - tw / 2, y - fs * 0.85, x + tw / 2, y + fs * 0.3];
        if (box[0] < -20 || box[2] > W + 20 || box[1] < 0 || box[3] > H) return null;
        return { ...base, boxes: [box], x, y, peak };
      }
      let pts = it.path;
      if (!pts && it.line) {
        pts = [];
        for (const c of it.line) { const p = view.project(c[0], c[1]); if (p) pts.push(p); }
        for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i][0] - pts[i - 1][0]) > W * 0.5) return null; // antimeridian
        if (pts.length > 1 && pts[0][0] > pts[pts.length - 1][0]) pts.reverse();
      }
      if (!pts || pts.length < 2) return null;
      const c = arc(pts), len = c[c.length - 1];
      const mid = at(pts, c, len / 2);
      if (mid[0] < 0 || mid[1] < 0 || mid[0] > W || mid[1] > H) return null;
      if (len >= tw * 0.95) {
        // A box per glyph-sized step along the stretch the text covers, lifted above the baseline.
        const boxes = [], h = fs * 0.55, step = Math.max(4, fs * 0.8);
        for (let s = (len - tw) / 2; s <= (len + tw) / 2 + 0.1; s += step) {
          const [x, y, dx, dy] = at(pts, c, s), cx = x + dy * fs * 0.35, cy = y - dx * fs * 0.35;
          boxes.push([cx - h, cy - h, cx + h, cy + h]);
        }
        for (const b of boxes) if (b[0] < -20 || b[2] > W + 20 || b[1] < 0 || b[3] > H) return null;
        return { ...base, boxes, pts };
      }
      if (it.style === "river" || it.path) return null; // a river name needs its river; a realm name its room
      const box = [mid[0] - tw / 2, mid[1] - fs * 0.85, mid[0] + tw / 2, mid[1] + fs * 0.3];
      if (box[0] < -20 || box[2] > W + 20 || box[1] < 0 || box[3] > H) return null;
      return { ...base, boxes: [box], x: mid[0], y: mid[1] };
    }

    function draw(c, n) {
      const tx = doc.createElementNS(NS, "text");
      tx.setAttribute("class", c.cls);
      tx.style.fontSize = c.fs + "px"; tx.style.fontWeight = c.wt;
      if (c.sp) tx.style.letterSpacing = c.sp + "em";
      if (c.fill) tx.style.fill = c.fill;
      if (c.pts) {
        const id = uid + n, path = doc.createElementNS(NS, "path");
        path.setAttribute("id", id); path.setAttribute("d", "M" + c.pts.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join("L"));
        defs.appendChild(path);
        const tp = doc.createElementNS(NS, "textPath");
        tp.setAttribute("href", "#" + id); tp.setAttribute("startOffset", "50%"); tp.setAttribute("text-anchor", "middle");
        tp.textContent = c.text; tx.appendChild(tp);
      } else if (c.peak) {
        const tri = doc.createElementNS(NS, "path");
        tri.setAttribute("d", `M${Math.round(c.x) - 4},${Math.round(c.y) + 2}h8l-4,-7z`); tri.setAttribute("fill", "#2a1a10"); tri.setAttribute("stroke", "#f4ecd8"); tri.setAttribute("stroke-width", "1.2");
        g.appendChild(tri);
        tx.setAttribute("x", c.x + 7); tx.setAttribute("y", c.y + 2); tx.textContent = c.text;
      } else {
        tx.setAttribute("x", c.x); tx.setAttribute("y", c.y); tx.setAttribute("text-anchor", "middle"); tx.textContent = c.text;
      }
      g.appendChild(tx);
    }

    function layout(t, W, H, o = {}) {
      last = t;
      svg.style.transform = ""; svg.setAttribute("width", W); svg.setAttribute("height", H);
      svg.classList.toggle("quiet", !!o.focus);
      const key = [t.k, t.x, t.y, W, H].join();
      if (key !== shapeKey) { shapeKey = key; shapes = new WeakMap(); drawnList = null; }
      const view = { k: t.k, year: o.year, W, H, focus: o.focus || null,
        project: (lon, lat) => { const p = projection([lon, lat]); return p ? [p[0] * t.k + t.x, p[1] * t.k + t.y] : null; } };
      const cands = [], blocks = [];
      for (const s of sources) {
        let items;
        try { items = s.fn(view) || []; } catch (err) { console.error("labels " + s.id, err); continue; }
        for (const it of items) {
          if (it && it.block) { blocks.push(it.block); continue; }
          if (!it || !it.text || (it.minK && t.k < it.minK)) continue;
          let c = shapes.get(it);
          if (c === undefined) { c = shape(s.base ? { ...it, base: true } : it, view); if (c) c.base = s.base; shapes.set(it, c); }
          if (!c) continue;
          c.pri = (it.pri == null ? 40 : it.pri) - (s.base && view.focus ? 25 : 0);
          cands.push(c);
        }
      }
      for (const e of o.extra || []) cands.push({ pri: e.pri, boxes: [e.box], ext: e });
      cands.sort((a, b) => b.pri - a.pri);
      // Collision grid of 64 px cells; a few px of air around every label, more when zoomed out.
      // Three planes, as on a strategy map: realm names (R) are big background lettering that only keeps clear of other
      // realm names and the terrain names (G); marks' labels (P) sit on top of realm names but never on a terrain name.
      const CELL = 64, grids = { R: new Map(), G: new Map(), P: new Map() }, pad = t.k < 2 ? 6 : 4;
      const AGAINST = { R: ["R", "G"], G: ["R", "G", "P"], P: ["G", "P"] };
      // One budget per zoom for everything but realm names, which are limited only by room.
      const max = Math.round(20 + 14 * Math.pow(t.k, 0.85));
      const cellsOf = b => { const out = []; for (let cy = Math.floor((b[1] - pad) / CELL); cy <= Math.floor((b[3] + pad) / CELL); cy++) for (let cx = Math.floor((b[0] - pad) / CELL); cx <= Math.floor((b[2] + pad) / CELL); cx++) out.push(cx + "," + cy); return out; };
      const hit = (b, planes) => { for (const key of cellsOf(b)) for (const pl of planes) for (const o2 of grids[pl].get(key) || []) if (b[0] - pad <= o2[2] && b[2] + pad >= o2[0] && b[1] - pad <= o2[3] && b[3] + pad >= o2[1]) return true; return false; };
      const blocked = b => blocks.some(o => b[0] <= o[2] && b[2] >= o[0] && b[1] <= o[3] && b[3] >= o[1]);
      let n = 0; const notes = new Set(), won = [];
      debug = api.debug ? [] : null;
      for (const c of cands) {
        const plane = c.st === STYLES.realm ? "R" : c.ext || !(c.base || c.st === STYLES.province) ? "P" : "G";
        // Lens annotations (not settlements): at most one per 120 px cell, so marks never turn into a wall of words.
        const cell = c.ext && c.ext.note && c.pri < 100 ? Math.floor((c.boxes[0][0] + c.boxes[0][2]) / 240) + "," + Math.floor((c.boxes[0][1] + c.boxes[0][3]) / 240) : null;
        const ok = (plane === "R" || n < max || c.pri >= 100) && !(cell && notes.has(cell)) && !c.boxes.some(b => hit(b, AGAINST[plane])) && !(plane === "G" && c.base && c.boxes.some(blocked));
        if (ok && cell) notes.add(cell);
        if (ok) { if (plane !== "R") n++; const g2 = grids[plane]; for (const b of c.boxes) for (const key of cellsOf(b)) { const l = g2.get(key); if (l) l.push(b); else g2.set(key, [b]); } }
        if (debug) debug.push({ text: c.text || (c.ext && c.ext.text), pri: c.pri, ok, plane, boxes: c.boxes });
        if (c.ext) { try { c.ext.show(ok); } catch (err) { console.error(err); } }
        else if (ok) won.push(c);
      }
      if (!drawnList || won.length !== drawnList.length || won.some((c, i) => c !== drawnList[i])) {
        defs.textContent = ""; g.textContent = "";
        won.forEach((c, i) => draw(c, i + 1));
        drawnList = won;
      }
      return n;
    }

    const api = {
      layout, measure,
      debug: false, get placed() { return debug; },  // set debug = true to keep every candidate of the last pass
      add(id, fn, o = {}) { const i = sources.findIndex(s => s.id === id); const s = { id, fn, base: !!o.base }; if (i >= 0) sources[i] = s; else sources.push(s); },
      remove(id) { const i = sources.findIndex(s => s.id === id); if (i >= 0) sources.splice(i, 1); },
      move(t) { if (!last) return; const s = t.k / last.k; svg.style.transform = `translate(${t.x - last.x * s}px,${t.y - last.y * s}px) scale(${s})`; },
      clear() { last = null; drawnList = null; defs.textContent = ""; g.textContent = ""; },
      setMood(m) { mood = m || "day"; svg.setAttribute("class", "map-labels m-" + mood + (svg.classList.contains("quiet") ? " quiet" : "")); },
      get mood() { return mood; },
      remove() { svg.remove(); },
    };
    return api;
  }

  // The page-wide registry: sources may register before the page mounts the engine.
  const registry = {
    sources: [], engine: null, onRefresh: null,
    add(id, fn, o = {}) { const i = this.sources.findIndex(s => s.id === id); const s = { id, fn, base: !!o.base }; if (i >= 0) this.sources[i] = s; else this.sources.push(s); this.refresh(); },
    remove(id) { const i = this.sources.findIndex(s => s.id === id); if (i >= 0) { this.sources.splice(i, 1); this.refresh(); } },
    refresh() { if (this.onRefresh) this.onRefresh(); },
    mount(container, projection, before) { this.engine = MapLabels(container, projection, { sources: this.sources, before }); return this.engine; },
    measure,
  };
  // Fonts arrive after first paint; measure again once they are in.
  if (typeof document !== "undefined" && document.fonts && document.fonts.ready) document.fonts.ready.then(() => { widths.clear(); registry.refresh(); });
  MapLabels.STYLES = STYLES;
  MapLabels.measure = measure;
  global.MapLabels = MapLabels;
  if (global.ATLAS && !global.ATLAS.labels) global.ATLAS.labels = registry;
})(typeof window !== "undefined" ? window : globalThis);
