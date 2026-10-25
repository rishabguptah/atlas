// Pixel map basemap for the one-page Atlas: a top-down 16-bit world, re-drawn from terrain data at every zoom.
// Renderer, palette and sprites live in views/pixel/ (see SPEC.md); this file wires them to the page.
// Data: PIXEL.tile0 (terrain L0 as a data URI), PIXEL.rivers; finer tiles load from tiles/ next to the page when published.
// Lens marks are painted into the pixel grid (views/pixel/marks.js) and a pixel HUD sits in the corners (views/pixel/hud.js).
(function () {
  if (typeof PixelMap !== "function" || typeof PixelBorders !== "function" || typeof PIXEL === "undefined" || !PIXEL.tile0) return;
  const STYLE = `@import url("https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@400;600;700&family=Silkscreen&display=swap");
.basemap canvas.pixelmap { image-rendering: pixelated; }
.basemap-on .pt.city .dot, .basemap-on .pt.city .ring, .basemap-on .pt.battle circle, .basemap-on .pt.battle path { opacity: 0; }
.basemap-on svg text { font-family: "Pixelify Sans", "Silkscreen", ui-monospace, monospace !important; font-style: normal !important; letter-spacing: .02em; }
.basemap-on .pt.city text, .basemap-on .pt.battle text { font-weight: 600; fill: #f6f0dc; stroke: #221f1a; stroke-width: 3px; paint-order: stroke; }
/* Marks drawn in the pixel grid: the SVG shapes stay as invisible click and hover targets, their labels stay visible. */
.pxmarks #svg .pt > :not(text):not(title):not(image), .pxmarks #svg path.line, .pxmarks #svg path.route, .pxmarks #svg .selring { opacity: 0 !important; }
`;
  const ERA = typeof PixelEra !== "undefined" ? PixelEra : null;
  const isOn = k => !window.ATLAS.isOn || ATLAS.isOn(k);
  const REALM = PIXEL_PALETTE.REALM;
  const hashC = s => { let h = 0; for (const c of s || "") h = (h * 31 + c.charCodeAt(0)) | 0; return REALM[Math.abs(h) % REALM.length]; };
  const interp = (series, y) => {
    if (!series || !series.length || y < series[0][0] || y > series[series.length - 1][0]) return null;
    for (let i = 1; i < series.length; i++) if (y <= series[i][0]) { const [a, va] = series[i - 1], [b, vb] = series[i]; return va + (vb - va) * (y - a) / (b - a || 1); }
    return series[series.length - 1][1];
  };
  const tierOf = (e, y) => {
    if (e.layer === "wonders") return /pyramid/i.test(e.name) ? "wonder_pyramid" : "wonder_temple";
    const p = typeof POP !== "undefined" ? interp(POP[e.id], y) : null;
    return p == null ? "city_town" : p > 400000 ? "city_metropolis" : p > 80000 ? "city_city" : p > 15000 ? "city_town" : "city_village";
  };
  const MIN_K = { city_metropolis: 1.4, city_city: 3, wonder_pyramid: 3, wonder_temple: 3, ruin: 4.5, city_town: 5, city_village: 8 };

  // Precise borders from borders/l0|l1|l2 next to the page; the page's own simplified borders until they arrive.
  // The page shares its own border loader (ATLAS.borders) so each chunk is fetched and parsed once; it re-renders the
  // basemap when a chunk arrives. Standalone, the basemap keeps its own.
  let own = null;
  const bordersOf = () => window.ATLAS.borders || own || (own = PixelBorders({ base: "borders/", onLoad: () => { if (pm && T && isOn("borders")) { if (pm.same(T)) pm.setRealms(own.realms(year, T.k)); else pm.render(T, { realms: own.realms(year, T.k) }); } } }));
  let geo = null, geoKey = "", el0 = null;
  // Zoom detail (roads, walls, fields, villages, ports, castles, province names) from detail/ next to the page.
  const detail = typeof PixelDetail === "function" ? PixelDetail({ base: "detail/", onLoad: () => {
    if (!pm || !T) return;
    const realms = isOn("borders") ? (bordersOf().realms(year, T.k) || realmsFor(year)) : NO_REALMS;
    if (pm.same(T)) pm.setRealms(realms); else pm.render(T, { realms });
    if (window.ATLAS.labels && ATLAS.labels.refresh) ATLAS.labels.refresh(); else provLabels();
  } }) : null;
  let provSvg = null;
  // Province names: through the shared label engine when the page has one, else a small layer of our own.
  function provLabels() {
    if (!detail || !el0 || (window.ATLAS.labels && ATLAS.labels.add)) return;
    if (!provSvg) { provSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); provSvg.setAttribute("class", "pixel-prov"); Object.assign(provSvg.style, { position: "absolute", left: 0, top: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible", transformOrigin: "0 0" }); el0.insertBefore(provSvg, el0.querySelector(":scope > svg")); }
    provSvg.style.transform = ""; provSvg.innerHTML = "";
    if (!T) return;
    const W = el0.clientWidth, H = el0.clientHeight, boxes = [];
    const items = detail.names({ k: T.k, year, W, H, project: (lon, lat) => { const p = proj([lon, lat]); return p && [p[0] * T.k + T.x, p[1] * T.k + T.y]; } }).sort((a, b) => b.pri - a.pri);
    for (const it of items.slice(0, 40)) {
      const p = proj(it.at); if (!p) continue;
      const x = p[0] * T.k + T.x, y = p[1] * T.k + T.y, txt = it.text.toUpperCase(), bw = txt.length * it.size * 0.72 + 8, b = [x - bw / 2, y - it.size, x + bw / 2, y + 4];
      if (boxes.some(o => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])) continue;
      boxes.push(b);
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("x", x); t.setAttribute("y", y); t.setAttribute("text-anchor", "middle");
      t.setAttribute("style", `font: 500 ${it.size}px "Pixelify Sans", "Silkscreen", monospace; letter-spacing: .16em; fill: #3a2a1c; stroke: rgba(246,238,214,.8); stroke-width: 2.6px; paint-order: stroke;`);
      t.textContent = txt; provSvg.appendChild(t);
    }
  }
  let pm = null, proj = null, T = null, year = null, snap = null, timer = 0, frame = 0, statics = [], movers = [];
  let marks = null, hud = null, watch = null, markTimer = 0;
  const realmCache = {}, NO_REALMS = [];
  let warmed = null;
  function realmsFor(y) {
    if (typeof POLITIES === "undefined") return [];
    const snaps = Object.keys(POLITIES).map(Number).sort((a, b) => a - b);
    let s = snaps[0]; for (const v of snaps) if (v <= y) s = v;
    snap = s;
    if (realmCache[s]) return realmCache[s];
    const t = POLITIES[s]; if (!t) return [];  // snapshot not inlined (it loads from borders/ beside the page)
    const fc = topojson.feature(t, Object.values(t.objects)[0]).features;
    return realmCache[s] = fc.map((f, i) => {
      const p = f.properties || {}, name = (p.NAME || p.SUBJECTO || "").trim(), subj = (p.SUBJECTO || "").trim();
      const emp = typeof EMPIRES !== "undefined" && EMPIRES.find(e => s >= e.start && s <= (e.end ?? 9999) && (e.match.includes(name) || e.match.includes(subj)));
      return { id: s + ":" + i, name: emp ? emp.name : name, color: hashC(emp ? emp.id : name || String(i)), feature: f };
    }).filter(r => r.name && d3.geoArea(r.feature) < 2 * Math.PI);
  }
  function collect(y, k) {
    statics = []; movers = [];
    if (typeof ENTRIES !== "undefined" && isOn("places")) for (const e of ENTRIES) {
      if (y < e.start) continue;
      if (ERA) {
        const p = ERA.place(e, y, typeof POP !== "undefined" ? interp(POP[e.id], y) : null);
        if (k >= p.minK) statics.push({ lon: e.lon, lat: e.lat, sprite: p.sprite, pri: p.pri });
        continue;
      }
      const sp = e.end != null && y >= e.end ? "ruin" : tierOf(e, y);
      if (k >= (MIN_K[sp] || 1)) statics.push({ lon: e.lon, lat: e.lat, sprite: sp });
    }
    if (typeof WAR !== "undefined" && isOn("war")) for (const b of WAR.battles) {
      if (Math.abs(b.start - y) > 3) continue;
      const a = hashC(b.sides && b.sides[0] && b.sides[0][0] && b.sides[0][0].name), c = hashC(b.sides && b.sides[1] && b.sides[1][0] && b.sides[1][0].name);
      // Era armies: hoplites, legions, knights, musket lines, tanks; the second side faces the first.
      const ar = ERA ? ERA.army(b.start, b.lon, b.lat) : "army";
      const grp = "b:" + b.name + b.start;
      statics.push({ lon: b.lon, lat: b.lat, sprite: ar, team: a, dx: -5, pri: 5, grp }, { lon: b.lon, lat: b.lat, sprite: ERA ? ar : "army_flip", flip: !!ERA, team: c, dx: 5, frame: 1, pri: 5, grp }, { lon: b.lon, lat: b.lat, sprite: "clash", dy: -7, pri: 5, grp });
    }
    if (typeof PLAGUE !== "undefined" && isOn("disease")) for (const s of PLAGUE.events) {
      if (s.lat == null || y < s.start - 1 || y > (s.end ?? s.start) + 3) continue;
      const sp = ERA ? ERA.shock(s.subtype) : /epidemic|pandemic|plague/.test(s.subtype) ? "plague" : s.subtype === "famine" ? "skull" : s.subtype === "eruption" ? "volcano" : "fire";
      statics.push({ lon: s.lon, lat: s.lat, sprite: sp, dy: -2, pri: 3.8 });
    }
    // Sprites other lenses ask for (ATLAS.pixelSprites: functions (year, k) -> [{lon, lat, sprite, ...}]).
    for (const f of ATLAS.pixelSprites || []) try { statics.push(...(f(y, k) || [])); } catch (err) { console.error("pixel sprites", err); }
    if (typeof MONEY !== "undefined" && isOn("money")) for (const t of MONEY.trade) {
      if (y < t.start || y > t.end || !t.line || t.line.length < 2) continue;
      const segs = []; let tot = 0;
      for (let i = 1; i < t.line.length; i++) { const d = d3.geoDistance(t.line[i - 1], t.line[i]); segs.push(d); tot += d; }
      // One traveller per route zoomed out, up to four along it as you come in.
      const n = k < 2 ? 1 : Math.max(1, Math.min(4, Math.round(tot / 0.6)));
      for (let q = 0; q < n; q++) movers.push({ line: t.line, segs, tot, phase: q / n });
    }
  }
  function moverAt(m) {
    let s = ((m.phase + frame * 0.004 / Math.max(0.2, m.tot)) % 1) * m.tot;
    for (let i = 0; i < m.segs.length; i++) { if (s <= m.segs[i]) return d3.geoInterpolate(m.line[i], m.line[i + 1])(s / (m.segs[i] || 1)); s -= m.segs[i]; }
    return m.line[m.line.length - 1];
  }
  function draw() {
    if (!pm) return;
    const list = statics.slice();
    for (const m of movers) {
      const [lon, lat] = moverAt(m), sea = pm.isWater(lon, lat);
      list.push({ lon, lat, sprite: ERA ? ERA.mover(year, lon, lat, sea) : sea ? "ship" : "caravan", pri: 0.5 });
    }
    list.sort((a, b) => b.lat - a.lat);
    pm.sprites(list, ERA && T ? ERA.budget(T.k) : undefined);
  }

  // Lens marks: the page's own records once it offers them (ATLAS.marks), else what its SVG layers drew.
  const svgEl = () => document.getElementById("svg");
  const mapOf = el => el && el.closest(".map") || (el && el.parentElement);
  function marksChanged() {
    if (markTimer || !pm || !T) return;
    markTimer = setTimeout(() => { markTimer = 0; if (!pm || mapOf(el0).classList.contains("moving")) return; pm.repaint(); }, 50);
  }
  function mountMarks(el, projection) {
    marks = PixelMarks(svgEl(), projection);
    pm.overlay(marks.paint);
    mapOf(el).classList.add("pxmarks");
    if (typeof ATLAS.marks === "function") {
      marks.set(ATLAS.marks());
      if (typeof ATLAS.onMarks === "function") ATLAS.onMarks(r => { if (marks) { marks.set(r); marksChanged(); } });
      return;
    }
    // Any change to what the SVG layers drew (not the per-frame zoom transforms) marks the list stale.
    watch = new MutationObserver(recs => { if (recs.some(r => r.target !== svgEl())) { marks.markDirty(); marksChanged(); } });
    watch.observe(svgEl(), { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style", "d", "r"] });
  }

  // The map key shows the same pixel marks the map draws (null keeps the page's own glyph).
  const KEY_MARK = { dot: { kind: "city" }, small: { kind: "person" }, line: { kind: "trade", line: true }, arrow: { kind: "mig", line: true, arrow: true },
    diamond: { kind: "lens", shape: "diamond" }, square: { kind: "lens", shape: "square" }, halo: { kind: "shock", size: 5 }, ring: { kind: "order", size: 6 },
    cross: { kind: "broke" }, battle: { kind: "battle" }, hourglass: { kind: "choke" } };
  const KEY_LAYER = { "money:diamond": { kind: "hub" }, "ideas:diamond": { kind: "work" }, "ideas:square": { kind: "school" }, "ideas:arrow": { kind: "leg", line: true, arrow: true } };
  ATLAS.keyGlyph = (g, layer, color) => {
    const r = pm && marks && (KEY_LAYER[layer + ":" + g] || KEY_MARK[g]);
    return r ? `<img src="${PixelMarks.swatch(r, color)}" width="22" height="16" alt="" style="image-rendering:pixelated;display:block">` : null;
  };

  // Lenses whose marks change within a year (the month cursor of a deep region) re-collect sprites without a re-render.
  ATLAS.pixelRefresh = () => { if (pm && T && year != null) { collect(year, T.k); draw(); } };
  ATLAS.basemap({
    id: "pixel", name: "Pixel map", paintsMarks: typeof PixelMarks === "function",
    mount(el, projection) {
      proj = projection; el0 = el;
      if (!document.getElementById("pixel-basemap-style")) { const st = document.createElement("style"); st.id = "pixel-basemap-style"; st.textContent = STYLE; document.head.appendChild(st); }
      const levels = [{ cell: 1 / 6, tdeg: 360, url: () => PIXEL.tile0 }, { cell: 1 / 15, tdeg: 30, url: (c, r) => `tiles/l1_${c}_${r}.png` }, { cell: 1 / 30, tdeg: 30, url: (c, r) => `tiles/l2_${c}_${r}.png` }];
      pm = PixelMap(el, projection, { px: 3, levels, land: topojson.feature(LAND, LAND.objects.land), rivers: PIXEL.rivers });
      if (detail) {
        pm.setDetail((G, phase) => detail.draw(G, phase, year, proj));
        if (window.ATLAS.labels && ATLAS.labels.add) ATLAS.labels.add("provinces", view => detail.names(view));
      }
      // Names of seas, rivers, ranges and deserts in the pixel font, under the Land lens's terrain toggle.
      if (typeof PixelGeoLabels === "function" && typeof TERRAIN !== "undefined" && TERRAIN) { geo = PixelGeoLabels(el, projection, TERRAIN); geoKey = ""; }
      if (typeof PixelMarks === "function" && svgEl()) mountMarks(el, projection);
      if (typeof PixelHUD === "function") hud = PixelHUD(mapOf(el), projection, { px: 3, tile: PIXEL.tile0, fly: (v, ms) => ATLAS.api && ATLAS.api.fly(v, ms ?? 600) });
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches) timer = setInterval(() => { if (document.hidden || !T) return; frame++; pm.setFrame(frame); draw(); }, 260);
    },
    render(t, y) {
      if (!pm) return;
      T = t; year = y;
      if (marks && !watch && typeof ATLAS.marks === "function") marks.set(ATLAS.marks()); else if (marks) marks.markDirty();
      if (hud) hud.update(t);
      const realms = isOn("borders") ? (bordersOf().realms(y, t.k) || realmsFor(y)) : NO_REALMS;
      if (pm.same(t)) pm.setRealms(realms); else pm.render(t, { realms });
      // Warm the outlines of every frame in this chunk while the browser is idle, so scrubbing on stays cheap.
      // Then the chunks either side (already prefetched by the border loader).
      const B = bordersOf(), all = isOn("borders") && B.chunkRealms && B.chunkRealms(y, t.k);
      if (all && all !== warmed && pm.warm) {
        warmed = all;
        const ix = B.timeline(), ci = ix ? ix.chunks.findIndex(c => c[0] <= y && y <= c[1]) : -1, near = ci >= 0 ? [ix.chunks[ci + 1], ix.chunks[ci - 1]] : [];
        const more = near.filter(Boolean).map(c => B.chunkRealms(c[0], t.k)).filter(Boolean);
        pm.warm([...more.flat(), ...all].map(r => r.feature));
      }
      if (geo) {
        const on = isOn("terrain"), key = on ? [t.k, t.x, t.y, el0.clientWidth, el0.clientHeight].join() : "off";
        if (key !== geoKey) { geoKey = key; if (on) geo.render(t, el0.clientWidth, el0.clientHeight); else geo.clear(); }
      }
      collect(y, t.k); draw();
      provLabels();
    },
    move(t) { if (pm) pm.move(t); if (geo) geo.move(t); if (hud) hud.update(t); if (provSvg && T) { const s = t.k / T.k; provSvg.style.transform = `translate(${t.x - T.x * s}px,${t.y - T.y * s}px) scale(${s})`; } },
    unmount() {
      clearInterval(timer); clearTimeout(markTimer); markTimer = 0;
      if (watch) watch.disconnect(); watch = null; marks = null;
      if (el0) mapOf(el0).classList.remove("pxmarks");
      if (hud) hud.remove(); hud = null;
      pm = null; if (geo) geo.remove(); geo = null;
      if (provSvg) provSvg.remove(); provSvg = null;
    },
    setMood(m) { if (pm) pm.setMood(m); if (geo) geo.setMood(m); },
  });
})();
