// Terrain layer for any d3 + SVG view on d3.geoNaturalEarth1 (unrotated).
//
//   drawRelief(group, path, href)            the painted relief image, at the sphere's bounds
//   const t = drawTerrain(group, projection, path, data, k, {onSelect})
//   t.update(k)                              call on zoom (k = zoom scale) to show, space and declutter labels
//   const r = drawRealms(group, projection, path, borderFeatures, k, {colorOf, nameOf, onSelect})
//   r.update(k)                              strategy-game political look: flat colours (multiply) over the
//                                            relief-political image, dark borders, one curved name per realm
//
// data is terrain.json from views/terrain/export.py. Both calls are safe to repeat on resize: they clear
// what they drew before. Stroke widths and font sizes use calc(Npx / var(--k)), so set --k on an ancestor
// when zooming, the same way the other layers do.
(function (global) {
  const MIN_K = { 1: 0, 2: 1.6, 3: 2.5, 4: 4, 5: 6, 6: 9 };
  const LAND_SIZE = { 1: 13.5, 2: 11.5, 3: 10, 4: 9, 5: 8.5, 6: 8 };
  const STYLE = `
.terrain text { font-family: var(--terrain-font, "Cormorant Garamond", "EB Garamond", Georgia, serif); paint-order: stroke;
  stroke: var(--terrain-halo, rgba(247, 242, 230, .75)); stroke-width: calc(2.6px / var(--k, 1)); stroke-linejoin: round; cursor: pointer; }
.terrain .tl { text-transform: uppercase; letter-spacing: .18em; font-weight: 600; }
.terrain .tl-mountain_range { fill: #5e3a24; font-weight: 700; letter-spacing: .24em; }
.terrain .tl-desert { fill: #8c6427; font-style: italic; }
.terrain .tl-plain, .terrain .tl-plateau, .terrain .tl-basin, .terrain .tl-valley, .terrain .tl-lowland, .terrain .tl-region,
.terrain .tl-tundra, .terrain .tl-peninsula, .terrain .tl-isthmus, .terrain .tl-delta, .terrain .tl-depression,
.terrain .tl-gorge, .terrain .tl-wetland { fill: #6d6845; font-weight: 500; }
.terrain .tw { fill: #2e5e72; font-style: italic; letter-spacing: .12em; font-weight: 500; stroke: rgba(222, 235, 230, .7); }
.terrain .tw-ocean { letter-spacing: .6em; text-transform: uppercase; fill: #4d7584; }
.terrain .tw-sea, .terrain .tw-gulf, .terrain .tw-bay, .terrain .tw-strait, .terrain .tw-channel { text-transform: uppercase; }
.terrain .tw-river, .terrain .tw-lake { letter-spacing: .06em; }
.terrain .river { fill: none; stroke: #5d8fa3; stroke-linecap: round; stroke-linejoin: round; opacity: .85; pointer-events: none; }
.terrain .pt text { font-size: 10px; stroke-width: 2.6px; }
.terrain .pt-peak path { fill: #6a4630; }
.terrain .pt-peak text { fill: #4e3323; font-style: italic; }
.terrain .pt-strait path, .terrain .pt-pass path { fill: none; stroke: #7a2e1f; stroke-width: 1.6; stroke-linecap: round; }
.terrain .pt-strait text, .terrain .pt-pass text { fill: #6b2416; font-weight: 600; letter-spacing: .04em; }
.terrain .sel { fill: #b03a1e !important; }
`;
  // within a tier, which names win a collision
  const PRI = { mountain_range: 0, ocean: 1, desert: 2, sea: 3, river: 4 };
  const RIVER_W = { 1: 1.5, 2: 1.25, 3: 1, 4: .8, 5: .65, 6: .5 };

  function size(d) {
    if (d.t === 'ocean') return 17;
    if (d.water && (d.t === 'river' || d.t === 'lake')) return d.tier <= 2 ? 11 : 9.5;
    if (d.water) return { 1: 12, 2: 10.5, 3: 9.5 }[d.tier] || 9;
    return LAND_SIZE[d.tier] || 8;
  }

  function drawRelief(group, path, href) {
    group.selectAll('image.terrain-relief').remove();
    const [[x0, y0], [x1, y1]] = path.bounds({ type: 'Sphere' });
    return group.insert('image', ':first-child').attr('class', 'terrain-relief').attr('href', href)
      .attr('x', x0).attr('y', y0).attr('width', x1 - x0).attr('height', y1 - y0)
      .attr('preserveAspectRatio', 'none').style('pointer-events', 'none');
  }

  function drawTerrain(group, projection, path, data, k = 1, opts = {}) {
    const doc = group.node().ownerDocument;
    if (!doc.getElementById('terrain-style')) {
      const st = doc.createElement('style'); st.id = 'terrain-style'; st.textContent = STYLE; doc.head.appendChild(st);
    }
    group.selectAll('g.terrain').remove();
    const root = group.append('g').attr('class', 'terrain');
    const uid = 't' + Math.random().toString(36).slice(2, 7);
    const line = d3.line().curve(d3.curveCatmullRom.alpha(.5));
    const select = d => opts.onSelect && opts.onSelect(d);

    // rivers
    const rivers = root.append('g').attr('class', 'rivers').selectAll('path').data(data.rivers).join('path')
      .attr('class', 'river').attr('d', d => path({ type: 'MultiLineString', coordinates: d.lines }))
      .style('stroke-width', d => `calc(${RIVER_W[d.tier] || .5}px / var(--k, 1))`);

    // area, sea and river labels on curved paths
    const defs = root.append('defs');
    const labels = data.labels.map((d, i) => {
      const pts = d.line.map(c => projection(c)).filter(Boolean);
      const id = `${uid}-${i}`;
      const len = defs.append('path').attr('d', line(pts)).remove().node().getTotalLength();
      // a textPath drops glyphs that run past its ends, so extend both ends straight on
      const ext = (a, b) => { const dx = a[0] - b[0], dy = a[1] - b[1], n = Math.hypot(dx, dy) || 1, e = Math.max(len, 60) * 2;
        return [a[0] + dx / n * e, a[1] + dy / n * e]; };
      const n = pts.length;
      defs.append('path').attr('id', id).attr('d', n > 1
        ? 'M' + ext(pts[0], pts[1]).join(',') + 'L' + line(pts).slice(1) + 'L' + ext(pts[n - 1], pts[n - 2]).join(',')
        : line(pts));
      return Object.assign({}, d, { pid: id, len });
    });
    const text = root.append('g').attr('class', 'labels').selectAll('text').data(labels).join('text')
      .attr('class', d => d.water ? `tw tw-${d.t}` : `tl tl-${d.t}`)
      .style('font-size', d => `calc(${size(d)}px / var(--k, 1))`)
      .on('click', (e, d) => select(d));
    text.append('textPath').attr('href', d => '#' + d.pid).attr('startOffset', '50%').attr('text-anchor', 'middle')
      .text(d => d.name);
    text.append('title').text(d => d.why ? `${d.name}: ${d.why}` : d.name);

    // peaks, straits and passes
    const pts = data.points.map(d => Object.assign({}, d, { xy: projection(d.at) })).filter(d => d.xy);
    const pg = root.append('g').attr('class', 'points').selectAll('g').data(pts).join('g')
      .attr('class', d => `pt pt-${d.t}`).on('click', (e, d) => select(d));
    pg.append('path').attr('d', d => d.t === 'peak' ? 'M0,-4L3.6,2.4H-3.6Z'
      : d.t === 'pass' ? 'M-3,-4.5Q-.5,0-3,4.5M3,-4.5Q.5,0 3,4.5' : 'M-4.5,-2.5Q0,0 4.5,-2.5M-4.5,2.5Q0,0 4.5,2.5');
    pg.append('text').attr('x', 6).attr('y', 3.5).text(d => d.t === 'peak' && d.elevation_m
      ? `${d.name} ${d.elevation_m.toLocaleString('en')} m` : d.name);
    pg.append('title').text(d => d.why ? `${d.name}: ${d.why}` : d.name);

    function update(k) {
      rivers.style('display', d => k >= (MIN_K[d.tier - 1] ?? 0) ? null : 'none');
      pg.attr('transform', d => `translate(${d.xy[0]},${d.xy[1]}) scale(${1 / k})`)
        .style('display', d => d.t === 'peak' && k < MIN_K[d.tier] ? 'none' : null);
      pg.select('text').style('display', d => k >= MIN_K[d.tier] ? null : 'none');
      const kept = [];
      const hit = b => kept.some(o => b.x < o.x + o.width && o.x < b.x + b.width && b.y < o.y + o.height && o.y < b.y + b.height);
      text.each(function (d) {
        const el = d3.select(this);
        if (k < MIN_K[d.tier]) return el.style('display', 'none');
        const fs = size(d) / k, natural = d.name.length * fs * (d.water ? .62 : .78);
        const fits = natural <= d.len * 1.3 || d.len < 1e-6 || d.t === 'ocean';
        if (!fits && d.tier > 1 && (d.t === 'river' || d.t === 'mountain_range')) return el.style('display', 'none');
        el.style('display', null);
        if (d.len > natural * 1.15) el.attr('textLength', Math.min(d.len * .92, natural * 2.4)).attr('lengthAdjust', 'spacing');
        else el.attr('textLength', null);
      });
      // greedy declutter: big area names first, then straits, passes and peaks, then everything else;
      // a name that would overlap one already placed is dropped (a point keeps its marker)
      const place = (el, box) => { if (hit(box)) { el.style.display = 'none'; return false; } kept.push(box); return true; };
      const boxOf = el => { const b = el.getBBox(), pad = 2 / k; return { x: b.x - pad, y: b.y - pad, width: b.width + 2 * pad, height: b.height + 2 * pad }; };
      const shown = text.filter(function () { return this.style.display !== 'none'; })
        .sort((a, b) => a.tier - b.tier || (PRI[a.t] ?? 5) - (PRI[b.t] ?? 5) || b.len - a.len);
      shown.filter(d => d.tier === 1).each(function () { place(this, boxOf(this)); });
      pg.filter(d => k >= MIN_K[d.tier]).select('text').each(function (d) {
        const fs = 10 / k, w = (d.name.length + (d.elevation_m ? 7 : 0)) * fs * .5;
        place(this, { x: d.xy[0] - 5 / k, y: d.xy[1] - fs * .8, width: w + 11 / k, height: fs * 1.3 });
      });
      shown.filter(d => d.tier > 1).each(function () { place(this, boxOf(this)); });
    }
    update(k);
    return { update, root, highlight: id => text.classed('sel', d => d.id === id) };
  }

  // ---- Political map in the strategy-game style: flat colours over the relief, dark borders, big curved names ----
  const REALM_STYLE = `
.realms .realm-fill { mix-blend-mode: multiply; cursor: pointer; fill-opacity: var(--realm-op, .82); }
.realms .realm-fill.unclaimed { fill: none; }
.political-map .terrain .tl { display: none !important; }
.political-map .terrain .tw { fill: #eef4f1; stroke: rgba(28, 56, 70, .55); }
.political-map .terrain .tw-river, .political-map .terrain .tw-lake { fill: #1f4b5e; stroke: rgba(240, 234, 216, .6); }
.political-map .terrain .river { stroke: #3f7590; }
.realms .realm-band { fill: none; mix-blend-mode: multiply; stroke-width: calc(3.4px / var(--k, 1)); stroke-opacity: .55; stroke-linejoin: round; pointer-events: none; }
.realms .realm-line { fill: none; stroke: var(--realm-border, rgba(30, 20, 12, .8)); stroke-width: calc(1.1px / var(--k, 1)); stroke-linejoin: round; pointer-events: none; }
.realms text { font-family: var(--realm-font, "Cinzel", "Cormorant Garamond", Georgia, serif); font-weight: 700; text-transform: uppercase;
  fill: var(--realm-ink, rgba(26, 16, 8, .74)); pointer-events: none; }
.realms .realm-fill.sel { stroke: #fff6dc; stroke-width: calc(2.4px / var(--k, 1)); }
`;

  function solve3(A, b) {  // Gaussian elimination for the quadratic fit
    const m = A.map((r, i) => [...r, b[i]]);
    for (let c = 0; c < 3; c++) {
      let p = c; for (let r = c + 1; r < 3; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
      [m[c], m[p]] = [m[p], m[c]];
      if (Math.abs(m[c][c]) < 1e-12) return [0, 0, 0];
      for (let r = 0; r < 3; r++) if (r !== c) { const f = m[r][c] / m[c][c]; for (let j = c; j < 4; j++) m[r][j] -= f * m[c][j]; }
    }
    return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
  }
  const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

  // Where to letter a realm's name: a gentle curve along the territory's long axis, in map units.
  function realmLabel(f, name, path, projection) {
    const [[x0, y0], [x1, y1]] = path.bounds(f), w = x1 - x0, h = y1 - y0, N = 22, pts = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const x = x0 + (i + .5) / N * w, y = y0 + (j + .5) / N * h, ll = projection.invert([x, y]);
      if (ll && d3.geoContains(f, ll)) pts.push([x, y]);
    }
    if (pts.length < 5) return null;
    const mx = d3.mean(pts, p => p[0]), my = d3.mean(pts, p => p[1]);
    let sxx = 0, syy = 0, sxy = 0;
    for (const [x, y] of pts) { sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my); }
    let ang = .5 * Math.atan2(2 * sxy, sxx - syy);
    ang = Math.max(-.6, Math.min(.6, ang));  // stay readable: never steeper than about 35 degrees
    const ax = [Math.cos(ang), Math.sin(ang)], nx = [-ax[1], ax[0]];
    const t = pts.map(([x, y]) => (x - mx) * ax[0] + (y - my) * ax[1]);
    const n = pts.map(([x, y]) => (x - mx) * nx[0] + (y - my) * nx[1]);
    const cell = Math.max(w, h) / N;
    const lo = pct(t, .04) - cell / 2, hi = pct(t, .96) + cell / 2, chord = hi - lo;
    const thick = pct(n, .9) - pct(n, .1) + cell;
    let A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], b = [0, 0, 0];
    t.forEach((tt, i) => { const v = [tt * tt, tt, 1]; for (let r = 0; r < 3; r++) { b[r] += v[r] * n[i]; for (let c = 0; c < 3; c++) A[r][c] += v[r] * v[c]; } });
    const q = pts.length > 8 ? solve3(A, b) : [0, 0, 0];
    const lim = thick * .22;
    const line = d3.range(9).map(i => {
      const tt = lo + chord * i / 8, off = Math.max(-lim, Math.min(lim, q[0] * tt * tt + q[1] * tt + q[2]));
      return [mx + ax[0] * tt + nx[0] * off, my + ax[1] * tt + nx[1] * off];
    });
    const fs = Math.min(thick * .5, chord * .9 / (name.length * .82 + .5));
    return { line, fs, chord };
  }

  function drawRealms(group, projection, path, features, k = 1, opts = {}) {
    const doc = group.node().ownerDocument;
    if (!doc.getElementById('realm-style')) {
      const st = doc.createElement('style'); st.id = 'realm-style'; st.textContent = REALM_STYLE; doc.head.appendChild(st);
    }
    const colorOf = opts.colorOf || (() => '#c9a66b'), nameOf = opts.nameOf || (f => f.properties.NAME || f.properties.SUBJECTO);
    group.selectAll('g.realms').remove();
    const root = group.append('g').attr('class', 'realms');
    // colorOf may return null for land nobody holds: it stays bare parchment, with no name
    const items = features.map(f => ({ f, name: nameOf(f), color: colorOf(f), d: path(f), area: path.area(f) })).filter(d => d.d);
    root.append('g').selectAll('path').data(items).join('path').attr('class', d => d.color ? 'realm-fill' : 'realm-fill unclaimed')
      .attr('d', d => d.d).attr('fill', d => d.color || null)
      .on('click', (e, d) => { opts.onSelect && opts.onSelect(d.f); root.selectAll('.realm-fill').classed('sel', x => x.name === d.name); });
    root.append('g').selectAll('path').data(items.filter(d => d.color)).join('path').attr('class', 'realm-band')
      .attr('d', d => d.d).attr('stroke', d => d3.color(d.color).darker(.9));
    root.append('g').selectAll('path').data(items).join('path').attr('class', 'realm-line').attr('d', d => d.d);

    // one name per realm, on its largest piece
    const best = new Map();
    const [[sx0], [sx1]] = path.bounds({ type: 'Sphere' }), maxW = (sx1 - sx0) * .45;
    for (const d of items) if (d.name && d.color && (path.bounds(d.f)[1][0] - path.bounds(d.f)[0][0]) < maxW && (!best.has(d.name) || best.get(d.name).area < d.area)) best.set(d.name, d);
    const labels = [...best.values()].sort((a, b) => b.area - a.area);
    const lg = root.append('g'), defs = root.append('defs');
    const uid = 'r' + Math.random().toString(36).slice(2, 7);
    let n = 0;

    function update(k) {
      for (const d of labels) {
        if (d.lab === undefined && d.area * k * k > 900) {
          d.lab = realmLabel(d.f, d.name, path, projection);
          if (d.lab) {
            const L = d.lab.line, e = d.lab.chord * 2, id = `${uid}-${n++}`;
            const dx = (L[1][0] - L[0][0]), dy = (L[1][1] - L[0][1]), m = Math.hypot(dx, dy) || 1;
            const ex = (L[8][0] - L[7][0]), ey = (L[8][1] - L[7][1]), me = Math.hypot(ex, ey) || 1;
            defs.append('path').attr('id', id).attr('d', 'M' + [L[0][0] - dx / m * e, L[0][1] - dy / m * e] + 'L'
              + d3.line().curve(d3.curveCatmullRom)(L).slice(1) + 'L' + [L[8][0] + ex / me * e, L[8][1] + ey / me * e]);
            const natural = d.name.length * d.lab.fs * .82;
            d.el = lg.append('text').style('font-size', d.lab.fs + 'px')
              .attr('textLength', Math.min(d.lab.chord * .86, natural * 2.6)).attr('lengthAdjust', 'spacing');
            d.el.append('textPath').attr('href', '#' + id).attr('startOffset', '50%').attr('text-anchor', 'middle').text(d.name);
          }
        }
        if (d.el) { const px = d.lab.fs * k; d.el.style('display', px >= 7 && px <= 80 ? null : 'none').style('opacity', px > 48 ? .55 : null); }
      }
    }
    update(k);
    return { update, root };
  }

  global.drawRealms = drawRealms;
  global.drawTerrain = drawTerrain;
  global.drawRelief = drawRelief;
})(typeof window !== 'undefined' ? window : globalThis);
