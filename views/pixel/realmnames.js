// Realm names for the pixel map, curved along each realm and sized by its area, like the names on a strategy-game
// map, at every zoom: a realm is named across the largest piece of it on screen, so zoomed in on Bohemia in 1348 you
// still read HOLY ROMAN EMPIRE across the view. Placement is the label engine's (labels.js); this file finds the curve.
//   PixelRealmNames(grid) -> label items { text, pri, style: "realm", size, spacing, path: screen px }
//   grid = pm.labelGrid(): { ids, cls, w, h, PX, left, top, realms } from the last pixel-map frame
(function (global) {
  const MAX_FS = 48, MIN_FS = 12, MIN_PX = 80;
  // Pixelify at the art direction's sizes only (12/16/24/32/48 px).
  const snap = fs => fs >= 48 ? 48 : fs >= 32 ? 32 : fs >= 24 ? 24 : fs >= 16 ? 16 : fs >= 12 ? 12 : 0;
  const SUFFIX = /\s+(minor states|commonwealth|empire|sultanate|khanate|khaganate|dynasty|confederation|confederacy|republic|caliphate|kingdom|principality|monarchy|state|states)$/i;
  const TITLE = /^(the\s+)?((grand|great|holy|high|united|federal|imperial|royal|serene|most serene)\s+)*(kingdom|empire|sultanate|caliphate|khanate|khaganate|emirate|duchy|archduchy|principality|republic|county|margraviate|landgraviate|electorate|despotate|tsardom|shogunate|beylik|imamate|confederation|state|realm|dominion|lordship|bishopric|prince-bishopric|patriarchate|exarchate|satrapy|chiefdom|polity|territory)\s+of\s+(the\s+)?/i;
  const measure = (text, fs) => (global.MapLabels ? global.MapLabels.measure(text, fs, 700) : text.length * fs * 0.62);

  // Year steps inside one border frame give the same grid: the names are reused, not found again (a hash of the frame).
  let lastKey = null, lastOut = [];
  function PixelRealmNames(grid) {
    if (!grid || !grid.ids) return [];
    const { ids, cls, w, h, PX, left, top, realms } = grid, N = w * h;
    let hsh = 2166136261;
    for (let k = 0; k < N; k++) hsh = Math.imul(hsh ^ (ids[k] * 31 + cls[k]), 16777619);
    const key = [hsh, w, h, PX, left, top, realms.map(r => r && r.name).join("|")].join();
    if (key === lastKey) return lastOut;
    lastKey = key; lastOut = findNames(grid);
    return lastOut;
  }
  function findNames(grid) {
    const { ids, cls, w, h, PX, left, top, realms } = grid, N = w * h;
    // Land pixels of each realm, split into connected pieces; keep each realm's largest piece.
    const comp = new Int32Array(N).fill(-1), order = new Int32Array(N), stack = new Int32Array(N);
    let dist = null;
    const best = new Map(); // realm index -> {c, start, n}
    let pos = 0, nc = 0;
    const land = k => cls[k] > 2 && cls[k] !== 255;
    for (let k0 = 0; k0 < N; k0++) {
      const id = ids[k0];
      if (id <= 0 || comp[k0] >= 0 || !land(k0)) continue;
      const start = pos; let sp = 0;
      stack[sp++] = k0; comp[k0] = nc;
      while (sp) {
        const k = stack[--sp]; order[pos++] = k;
        const i = k % w;
        if (i > 0 && comp[k - 1] < 0 && ids[k - 1] === id && land(k - 1)) { comp[k - 1] = nc; stack[sp++] = k - 1; }
        if (i < w - 1 && comp[k + 1] < 0 && ids[k + 1] === id && land(k + 1)) { comp[k + 1] = nc; stack[sp++] = k + 1; }
        if (k >= w && comp[k - w] < 0 && ids[k - w] === id && land(k - w)) { comp[k - w] = nc; stack[sp++] = k - w; }
        if (k < N - w && comp[k + w] < 0 && ids[k + w] === id && land(k + w)) { comp[k + w] = nc; stack[sp++] = k + w; }
      }
      const n = pos - start, b = best.get(id);
      if (n >= MIN_PX && (!b || n > b.n)) best.set(id, { c: nc, start, n });
      nc++;
    }
    // The largest realms in view lead the hierarchy: never smaller than 16 px when the name fits along them.
    const lead = new Set([...best.values()].sort((a, b) => b.n - a.n).slice(0, 8));
    const out = [];
    for (const [id, p] of best) {
      const r = realms[id - 1]; if (!r) continue;
      // The full name if it fits, else the short one a strategy map would use (Kingdom of France -> France,
      // Polish-Lithuanian Commonwealth -> Polish-Lithuanian). A name wholly in brackets is Cliopatria's mark for a
      // loosely held realm, "(Habsburg Monarchy)": keep the name, drop the brackets.
      const raw = String(r.name || "").trim(), full = (/^\(.*\)$/.test(raw) ? raw.slice(1, -1) : raw).replace(/\s*\(.*?\)\s*/g, " ").trim();
      if (!full) continue;
      const names = [full, full.replace(TITLE, "").trim()];
      names.push(names[1].replace(SUFFIX, "").trim());
      let name = null, it = null;
      for (const nm of names.filter((x, i, a) => x && a.indexOf(x) === i)) { it = place(p, nm.toUpperCase()) || deep(p, nm.toUpperCase()); if (it) { name = nm; break; } }
      if (!it) continue;
      out.push({ ...it, text: name, style: "realm",
        pri: 64 + Math.min(20, 6 * Math.log10(p.n / MIN_PX)), realm: r.id });
    }
    return out;

    // The pixel of a piece farthest from its edge (breadth-first from the edge), and the local axis and extent there.
    function deepest(p) {
      if (!dist) dist = new Int16Array(N);
      const queue = new Int32Array(p.n), c = p.c;
      let qh = 0, qt = 0, bk = order[p.start];
      for (let q = p.start; q < p.start + p.n; q++) {
        const k = order[q], i = k % w;
        const edge = i === 0 || i === w - 1 || k < w || k >= N - w || comp[k - 1] !== c || comp[k + 1] !== c || comp[k - w] !== c || comp[k + w] !== c;
        dist[k] = edge ? 1 : 0; if (edge) queue[qt++] = k;
      }
      while (qh < qt) {
        const k = queue[qh++], dk = dist[k];
        if (dk > dist[bk]) bk = k;
        if (comp[k - 1] === c && !dist[k - 1]) { dist[k - 1] = dk + 1; queue[qt++] = k - 1; }
        if (comp[k + 1] === c && !dist[k + 1]) { dist[k + 1] = dk + 1; queue[qt++] = k + 1; }
        if (comp[k - w] === c && !dist[k - w]) { dist[k - w] = dk + 1; queue[qt++] = k - w; }
        if (comp[k + w] === c && !dist[k + w]) { dist[k + w] = dk + 1; queue[qt++] = k + w; }
      }
      const d = dist[bk], cx = bk % w, cy = (bk / w) | 0, R = Math.max(6, d * 3);
      let sxx = 0, syy = 0, sxy = 0;
      for (let q = p.start; q < p.start + p.n; q++) { const k = order[q], x = k % w - cx, y = ((k / w) | 0) - cy; if (x * x + y * y > R * R) continue; sxx += x * x; syy += y * y; sxy += x * y; }
      const th = Math.max(-0.88, Math.min(0.88, 0.5 * Math.atan2(2 * sxy, sxx - syy))), ux = Math.cos(th), uy = Math.sin(th);
      const inside = u => { const i = Math.round(cx + u * ux), j = Math.round(cy + u * uy); return i >= 0 && j >= 0 && i < w && j < h && comp[j * w + i] === c; };
      let a = 0, b = 0; while (inside(a - 1)) a--; while (inside(b + 1)) b++;
      return { cx, cy, d, ux, uy, a, b };
    }
    // For a ragged or ring-shaped piece (Sweden around the Gulf of Bothnia): a straight name through its deepest point,
    // the pixel farthest from any edge, along the local axis there.
    function deep(p, text) {
      if (!p.deep) p.deep = deepest(p);
      const { cx, cy, d, ux, uy, a, b } = p.deep;
      if (d < 3) return null;
      const half = Math.min(-a, b) * 0.95, Lf = half * 2, n = text.length, a1 = measure(text, 100) / 100;
      const fit = (0.9 * Lf * PX) / (a1 + n * 0.1);
      let fs = Math.min(MAX_FS, d * PX, fit);
      if (fs < MIN_FS) return null;
      if (fs < 16 && fit >= 16 && lead.has(p)) fs = 16;
      fs = snap(fs);
      const spacing = Math.max(0.1, Math.min(0.9, (Math.min(0.82 * Lf * PX, (a1 + n * 0.9) * fs) / fs - a1) / n));
      const drop = (fs * 0.34) / PX, path = [];
      for (let s = 0; s <= 4; s++) {
        const u = -half + (2 * half * s) / 4, i = cx + u * ux - drop * uy, j = cy + u * uy + drop * ux;
        path.push([left + (i + 0.5) * PX, top + (j + 0.5) * PX]);
      }
      return { size: fs, spacing, path };
    }

    // The main axis of a piece (PCA) and the curve through the middle of slices across it; the same for every name tried.
    function geometry(p) {
      let mx = 0, my = 0;
      for (let q = p.start; q < p.start + p.n; q++) { const k = order[q]; mx += k % w; my += (k / w) | 0; }
      mx /= p.n; my /= p.n;
      let sxx = 0, syy = 0, sxy = 0;
      for (let q = p.start; q < p.start + p.n; q++) { const k = order[q], x = k % w - mx, y = ((k / w) | 0) - my; sxx += x * x; syy += y * y; sxy += x * y; }
      // Steep realms (Chile, Italy) lean their names, but never past about 50 degrees.
      const th = Math.max(-0.88, Math.min(0.88, 0.5 * Math.atan2(2 * sxy, sxx - syy)));
      const ux = Math.cos(th), uy = Math.sin(th);
      const U = new Float32Array(p.n), V = new Float32Array(p.n);
      let umin = Infinity, umax = -Infinity;
      for (let q = 0; q < p.n; q++) {
        const k = order[p.start + q], x = k % w - mx, y = ((k / w) | 0) - my;
        U[q] = x * ux + y * uy; V[q] = -x * uy + y * ux;
        if (U[q] < umin) umin = U[q]; if (U[q] > umax) umax = U[q];
      }
      // Trim 4% at each end so a thin cape does not stretch the name into the sea.
      const HB = 64, hist = new Int32Array(HB), span = umax - umin || 1;
      for (let q = 0; q < p.n; q++) hist[Math.min(HB - 1, ((U[q] - umin) / span * HB) | 0)]++;
      let acc = 0, lo = 0, hi = HB - 1;
      for (let b = 0; b < HB; b++) { acc += hist[b]; if (acc >= p.n * 0.04) { lo = b; break; } }
      acc = 0; for (let b = HB - 1; b >= 0; b--) { acc += hist[b]; if (acc >= p.n * 0.04) { hi = b; break; } }
      const ulo = umin + lo / HB * span, uhi = umin + (hi + 1) / HB * span, L = uhi - ulo;
      if (L < 6) return null;
      // Slices across the axis: the centre line runs through each slice's mean, thickness is area over length.
      const NB = 10, sv = new Float64Array(NB), sn = new Float64Array(NB);
      for (let q = 0; q < p.n; q++) { if (U[q] < ulo || U[q] > uhi) continue; const b = Math.min(NB - 1, ((U[q] - ulo) / L * NB) | 0); sv[b] += V[q]; sn[b]++; }
      const thick = p.n / L;
      // Weighted least squares for v = a u^2 + b u + c through the slice means.
      let S0 = 0, S1 = 0, S2 = 0, S3 = 0, S4 = 0, T0 = 0, T1 = 0, T2 = 0;
      for (let b = 0; b < NB; b++) {
        if (!sn[b]) continue;
        const u = ulo + (b + 0.5) / NB * L, v = sv[b] / sn[b], wt = sn[b];
        S0 += wt; S1 += wt * u; S2 += wt * u * u; S3 += wt * u * u * u; S4 += wt * u * u * u * u; T0 += wt * v; T1 += wt * u * v; T2 += wt * u * u * v;
      }
      const det3 = (a, b, c, d, e, f, g, h2, i) => a * (e * i - f * h2) - b * (d * i - f * g) + c * (d * h2 - e * g);
      const D = det3(S4, S3, S2, S3, S2, S1, S2, S1, S0);
      let qa = 0, qb = 0, qc = 0;
      if (Math.abs(D) > 1e-6) {
        qa = det3(T2, S3, S2, T1, S2, S1, T0, S1, S0) / D;
        qb = det3(S4, T2, S2, S3, T1, S1, S2, T0, S0) / D;
        qc = det3(S4, S3, T2, S3, S2, T1, S2, S1, T0) / D;
      } else if (S0) qc = T0 / S0;
      return { mx, my, ux, uy, ulo, uhi, L, thick, qa, qb, qc };
    }
    // The curve through one piece: its main axis (PCA), bent through the middle of slices across that axis.
    function place(p, text) {
      const G = p.geo === undefined ? (p.geo = geometry(p)) : p.geo;
      if (!G) return null;
      const { mx, my, ux, uy, ulo, uhi, L, thick, qa, qb, qc } = G;
      // Size: as big as the realm is thick, as long as it fits; letters spread to fill most of its length. A ragged
      // realm that the full-length curve leaves (Habsburg lands, a C-shaped coast) gets a shorter name at its middle.
      const a1 = measure(text, 100) / 100, n = text.length, curve0 = u => qa * u * u + qb * u + qc;
      for (const [frac, uc] of [[1, (ulo + uhi) / 2], [0.7, (ulo + uhi) / 2], [0.7, 0], [0.5, 0]]) {
        const Lf = L * frac;
        const fit = (0.9 * Lf * PX) / (a1 + n * 0.1);
        let fs = Math.min(MAX_FS, thick * PX * 0.5, fit);
        if (fs < MIN_FS) return null;
        if (fs < 16 && fit >= 16 && lead.has(p)) fs = 16;
        fs = snap(fs);
        const spacing = Math.max(0.1, Math.min(0.9, (Math.min(0.82 * Lf * PX, (a1 + n * 0.9) * fs) / fs - a1) / n));
        const tw = (a1 + n * spacing) * fs, half = Math.min(Lf / 2, (tw / PX) * 0.56);
        // Keep the bend gentle: the sagitta over the text at most a sixth of its length.
        const lim = (2 * half / 6) / (half * half), k = Math.abs(qa) > lim ? lim / Math.abs(qa) : 1;
        const curve = u => curve0(uc) + (curve0(u) - curve0(uc)) * k;
        const inPiece = bend => {
          let ok = 0;
          for (let s = 0; s <= 8; s++) {
            const u = uc - half + (2 * half * s) / 8, v = bend ? curve(u) : curve0(uc);
            const i = Math.round(mx + u * ux - v * uy), j = Math.round(my + u * uy + v * ux);
            if (i >= 0 && j >= 0 && i < w && j < h && comp[j * w + i] === p.c) ok++;
          }
          return ok >= 8;
        };
        const bend = inPiece(true) ? true : inPiece(false) ? false : null;
        if (bend == null) continue;
        // The text sits on its baseline, so lower the path by a third of the size to centre the letters on the curve.
        const drop = (fs * 0.34) / PX, path = [];
        for (let s = 0; s <= 16; s++) {
          const u = uc - half * 1.08 + (2.16 * half * s) / 16, v = (bend ? curve(u) : curve0(uc)) + drop;
          const i = mx + u * ux - v * uy, j = my + u * uy + v * ux;
          path.push([left + (i + 0.5) * PX, top + (j + 0.5) * PX]);
        }
        return { size: fs, spacing, path };
      }
      return null;
    }
  }
  global.PixelRealmNames = PixelRealmNames;
})(typeof window !== "undefined" ? window : globalThis);
