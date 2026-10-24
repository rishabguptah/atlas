// Terrain layer for any d3 + SVG view on d3.geoNaturalEarth1 (unrotated).
//
//   drawRelief(group, path, href)            the painted relief image, at the sphere's bounds
//   const t = drawTerrain(group, projection, path, data, k, {onSelect})
//   t.update(k)                              call on zoom (k = zoom scale) to show, space and declutter labels
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

  global.drawTerrain = drawTerrain;
  global.drawRelief = drawRelief;
})(typeof window !== 'undefined' ? window : globalThis);
