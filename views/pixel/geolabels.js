// Geographic names for the pixel map: seas, rivers, ranges, deserts, lakes, straits and peaks, lettered along their
// label lines in the pixel font, like the place names on a classic RPG world map. Data: TERRAIN.labels / .points
// (views/terrain/export.py: {name, t, tier, line, water} and {name, t, tier, at}); tiers say from which zoom a name shows.
//   const G = PixelGeoLabels(container, projection, TERRAIN)
//   G.render(transform, W, H)   on zoom end: places names for this view, thinned by tier, budget and collisions
//   G.move(transform)           on every zoom frame: shifts the last layout with CSS until the next render
//   G.clear()                   hide all names (e.g. when the terrain toggle is off)
//   G.setMood(m)                day | dusk | night | winter | chronicle
(function (global) {
  const NS = "http://www.w3.org/2000/svg";
  const TIER_K = { 1: 1, 2: 1.6, 3: 2.5, 4: 4, 5: 6, 6: 9 };
  const SIZE = { 1: 17, 2: 14, 3: 12.5, 4: 11.5, 5: 11, 6: 10.5 };
  const WATER = new Set(["ocean", "sea", "gulf", "bay", "strait", "channel", "sound", "fjord", "lake", "river"]);
  const HIGH = new Set(["mountain_range", "plateau", "peak", "gorge", "valley"]);
  const STYLE = `
svg.pixel-geo { position: absolute; left: 0; top: 0; pointer-events: none; overflow: visible; transform-origin: 0 0; }
svg.pixel-geo text { font-family: "Pixelify Sans", "Silkscreen", ui-monospace, monospace; font-weight: 600; paint-order: stroke; stroke-linejoin: round; }
svg.pixel-geo .w { fill: #dff1f4; stroke: rgba(22, 52, 70, .85); stroke-width: 2.6px; letter-spacing: .14em; }
svg.pixel-geo .w.big { fill: #eaf6f7; stroke: rgba(22, 52, 70, .55); letter-spacing: .5em; font-weight: 500; }
svg.pixel-geo .w.river { fill: #cfe9f1; stroke: rgba(20, 52, 72, .9); letter-spacing: .06em; font-weight: 500; }
svg.pixel-geo .h { fill: #3a2414; stroke: rgba(240, 228, 196, .8); stroke-width: 2.8px; letter-spacing: .22em; }
svg.pixel-geo .l { fill: #5a3a12; stroke: rgba(246, 236, 206, .75); stroke-width: 2.6px; letter-spacing: .18em; font-weight: 500; }
svg.pixel-geo .pk { fill: #2a1a10; stroke: rgba(246, 240, 220, .85); stroke-width: 2.4px; font-weight: 500; }
svg.pixel-geo.night .h, svg.pixel-geo.night .l, svg.pixel-geo.night .pk { fill: #efe2c0; stroke: rgba(16, 20, 36, .8); }
svg.pixel-geo.chronicle .w { fill: #f4e8cc; stroke: rgba(70, 44, 20, .7); }
`;

  function PixelGeoLabels(container, projection, data) {
    const doc = container.ownerDocument;
    if (!doc.getElementById("pixel-geo-style")) { const st = doc.createElement("style"); st.id = "pixel-geo-style"; st.textContent = STYLE; doc.head.appendChild(st); }
    const svg = doc.createElementNS(NS, "svg"); svg.setAttribute("class", "pixel-geo");
    const defs = doc.createElementNS(NS, "defs"), g = doc.createElementNS(NS, "g");
    svg.append(defs, g);
    // Above the pixel canvas, below any svg the page already draws (city names, click targets).
    container.insertBefore(svg, container.querySelector(":scope > svg"));
    const uid = "pg" + Math.random().toString(36).slice(2, 7);
    const items = [];
    for (const l of (data && data.labels) || []) if (l.name && l.line && l.line.length > 1) items.push({ ...l, kind: "line" });
    for (const p of (data && data.points) || []) if (p.name && p.at) items.push({ ...p, kind: "point" });
    // Bigger, older names first; within a tier, water before land so seas claim their space.
    items.sort((a, b) => a.tier - b.tier || (b.t === "ocean") - (a.t === "ocean") || (WATER.has(b.t) - WATER.has(a.t)));
    let last = null;

    const classOf = d => d.kind === "point" ? "pk" : d.t === "river" ? "w river" : WATER.has(d.t) ? (d.t === "ocean" || (d.t === "sea" && d.tier <= 2) ? "w big" : "w") : HIGH.has(d.t) ? "h" : "l";
    const caps = d => d.kind === "line" && d.t !== "river" && d.t !== "lake";

    function render(t, W, H) {
      last = t;
      svg.style.transform = ""; svg.setAttribute("width", W); svg.setAttribute("height", H);
      defs.textContent = ""; g.textContent = "";
      // Few, well-spaced names zoomed out (like the sprites), more as you come in.
      const k = t.k, boxes = [], max = Math.round(5 + 6 * Math.pow(k, 0.85)), pad = k < 2 ? 10 : 5;
      const hit = b => boxes.some(o => b[0] - pad <= o[2] && b[2] + pad >= o[0] && b[1] - pad <= o[3] && b[3] + pad >= o[1]);
      let n = 0;
      for (const d of items) {
        if (n >= max) break;
        if (k < (TIER_K[d.tier] || 9)) continue;
        let fs = SIZE[d.tier] || 10.5;
        if (d.t === "ocean") fs = 20; else if (d.t === "river") fs = Math.min(fs, 12);
        const text = caps(d) ? d.name.toUpperCase() : d.name;
        const spacing = /big/.test(classOf(d)) ? 0.5 : caps(d) ? 0.2 : 0.08;
        const tw = text.length * fs * (0.6 + spacing);
        if (d.kind === "point") {
          const p = projection(d.at); if (!p) continue;
          const x = p[0] * k + t.x, y = p[1] * k + t.y;
          if (x < 0 || y < 0 || x > W || y > H) continue;
          const b = [x - 4, y - fs, x + 8 + tw, y + 4];
          if (hit(b)) continue;
          boxes.push(b); n++;
          const tri = doc.createElementNS(NS, "path");
          tri.setAttribute("d", `M${Math.round(x) - 4},${Math.round(y) + 2}h8l-4,-7z`); tri.setAttribute("fill", "#2a1a10"); tri.setAttribute("stroke", "#f4ecd8"); tri.setAttribute("stroke-width", "1.2");
          const tx = doc.createElementNS(NS, "text"); tx.setAttribute("class", "pk"); tx.setAttribute("x", x + 7); tx.setAttribute("y", y + 2); tx.style.fontSize = fs + "px"; tx.textContent = text;
          g.append(tri, tx);
          continue;
        }
        // Project the label line to screen, left to right, and keep the part that fits on screen.
        let pts = d.line.map(c => projection(c)).filter(Boolean).map(p => [p[0] * k + t.x, p[1] * k + t.y]);
        if (pts.length < 2) continue;
        for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i][0] - pts[i - 1][0]) > W * 0.5) { pts = null; break; } // antimeridian
        if (!pts) continue;
        if (pts[0][0] > pts[pts.length - 1][0]) pts.reverse();
        let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        const mid = pts[Math.floor(pts.length / 2)];
        if (mid[0] < 0 || mid[1] < 0 || mid[0] > W || mid[1] > H) continue;
        const curved = len >= tw * 0.95;
        let b;
        if (curved) {
          // Box of the stretch of line the text covers (centred), padded by the font size.
          let s = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
          const from = (len - tw) / 2, to = (len + tw) / 2;
          for (let i = 0; i < pts.length; i++) {
            if (i) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
            if (s >= from - fs && s <= to + fs) { x0 = Math.min(x0, pts[i][0]); x1 = Math.max(x1, pts[i][0]); y0 = Math.min(y0, pts[i][1]); y1 = Math.max(y1, pts[i][1]); }
          }
          if (!isFinite(x0)) continue;
          b = [x0 - 2, y0 - fs, x1 + 2, y1 + 4];
        } else {
          if (d.t === "river") continue; // a river name needs its river
          b = [mid[0] - tw / 2, mid[1] - fs, mid[0] + tw / 2, mid[1] + 4];
        }
        if (b[0] < -20 || b[2] > W + 20 || b[1] < 0 || b[3] > H) continue;
        if (hit(b)) continue;
        boxes.push(b); n++;
        const tx = doc.createElementNS(NS, "text"); tx.setAttribute("class", classOf(d)); tx.style.fontSize = fs + "px";
        if (curved) {
          const id = uid + n, path = doc.createElementNS(NS, "path");
          path.setAttribute("id", id); path.setAttribute("d", "M" + pts.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join("L"));
          defs.appendChild(path);
          const tp = doc.createElementNS(NS, "textPath");
          tp.setAttribute("href", "#" + id); tp.setAttribute("startOffset", "50%"); tp.setAttribute("text-anchor", "middle");
          tp.textContent = text; tx.appendChild(tp);
        } else {
          tx.setAttribute("x", mid[0]); tx.setAttribute("y", mid[1]); tx.setAttribute("text-anchor", "middle"); tx.textContent = text;
        }
        g.appendChild(tx);
      }
    }
    return {
      render,
      move(t) { if (!last) return; const s = t.k / last.k; svg.style.transform = `translate(${t.x - last.x * s}px,${t.y - last.y * s}px) scale(${s})`; },
      clear() { last = null; defs.textContent = ""; g.textContent = ""; },
      setMood(m) { svg.setAttribute("class", "pixel-geo " + (m || "day")); },
      remove() { svg.remove(); },
    };
  }
  global.PixelGeoLabels = PixelGeoLabels;
})(typeof window !== "undefined" ? window : globalThis);
