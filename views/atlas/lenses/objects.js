// Object journeys: famous objects and kinds of things on the move, who held them and how sure we are.
// Data from views/atlas/lenses/objects.py (data/objects/journeys/). A famous object sits where it was in the year on
// the slider (a ship, caravan or army while it travels); a kind of thing shows every place it had reached. Trails use
// the confidence grammar: documented is solid, likely is dashed, legend or an unknown route is dotted.
// The Objects tab follows one journey stop by stop on the map. ATLAS.objects lets other plugins (the life RPG) ask
// which object is where in a given year.
(() => {
  const ID = "objects", COLOR = "#9a5b2e";
  const CONF = { sure: "documented", likely: "likely", legend: "legend or tradition" };
  const FRESH = 60;  // a kind's newest stops are labelled and its legs drawn strong for this many years
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const first = s => { const m = String(s || "").match(/^.*?[.!?](\s|$)/); return (m ? m[0] : String(s || "")).trim(); };
  const fmtY = y => (window.ATLAS.api && ATLAS.api.fmtYear) ? ATLAS.api.fmtYear(y) : y < 0 ? -y + " BCE" : String(y);

  // ---------- pixel sprites for the objects (fills only; the dark outline is baked on, as in views/pixel) ----------
  const GRIDS = {
    obj_gem: ["..cvvvc..", ".cvvzvvc.", "cvzzvzzvc", ".vzvvvzv.", "..vzvzv..", "...vzv...", "....v...."],
    obj_gem_blue: ["..cbbbc..", ".cbbBbbc.", "cbBBbBBbc", ".bBbbbBb.", "..bBbBb..", "...bBb...", "....b...."],
    obj_codex: ["NNNNNNNw", "NRRRRRNw", "NRgRgRNw", "NRRgRRNw", "NRgRgRNw", "NRRRRRNw", "NNNNNNNw"],
    obj_marble: ["vvvvvvvvvv", "vzzzzzzzzv", "vzmzzzmzzv", "vmmmzmmmzv", "vzmzzzmzzv", "vzmmzzmmzv", "vzzzzzzzzv", "vvvvvvvvvv"],
    obj_stele: ["..dd....", ".dMMdd..", "dMmmmMd.", "dmMMMmMd", "dMmmmmmd", "dmMMMMmd", "dMmmmmmd", "dmMMMMmd", "dddddddd"],
    obj_ark: ["..y......y..", ".yyy....yyy.", "..gyy..yyg..", "nnnnnnnnnnnn", "..gggggggg..", "..gGyGGyGg..", "..gggggggg..", "...G....G..."],
    obj_relic: ["...y...", "..ggg..", ".gGGGg.", "ggyyygg", "gGrrrGg", "gGrrrGg", "ggggggg"],
    obj_bronze: ["...gggg...", "..gGggGg..", "..gkgkgg..", "..ggggGg..", "..gGGggg..", "..rgrgrg..", "..grgrgr..", "..rgrgrg..", ".GGGGGGGG."],
    obj_vase: ["...vv...", "..vbbv..", "...vv...", "..vvvv..", ".vbvbvv.", "vbbvvbbv", "vvbbbbvv", ".vbvvbv.", "..vvvv.."],
    obj_coin: ["..mmmm..", ".mzzzzm.", "mzmvzmzm", "mzvmmzzm", "mzzmmvzm", "mzmzvmzm", ".mzzzzm.", "..mmmm.."],
    obj_sack: ["...nn...", "..tnnt..", "...tt...", "..tttt..", ".tttttt.", "ttdtdttt", "tttdtdtt", ".tttttt."],
    obj_stirrup: ["..MM..", "..MM..", ".M..M.", "M....M", "M....M", "M....M", "MMMMMM", "mmmmmm"],
    obj_paper: ["wwwwwwww", "wKKKKwww", "wwwwwwww", "wKKKwKKw", "wwwwwwww", "wKKKKKww", "wwwwwwwW", ".WWWWWWW"],
    obj_potato: ["..nttn..", ".ttttttn", "ttntttnt", "tttttttn", ".nttnttn", "..nnnnn."],
  };
  const KEYS0 = { k: "#221f1a", K: "#4a4035", w: "#f6f0dc", W: "#d9cfb2", r: "#b8382a", R: "#7c2018", y: "#e8c050", g: "#c89a2a", G: "#8a6418",
    b: "#3a6a9a", B: "#25466a", c: "#7fc0d0", n: "#8a5a32", N: "#5e3a1e", t: "#c8a46a", m: "#9aa0a2", M: "#62686c", v: "#e8e4dc", d: "#3a3430", z: "#c8c8b0" };
  function bake(rows) {  // pad one pixel and outline every filled pixel in ink
    const h = rows.length + 2, w = rows[0].length + 2;
    const g = [".".repeat(w), ...rows.map(r => "." + r + "."), ".".repeat(w)].map(r => r.split(""));
    const solid = (x, y) => y >= 0 && y < h && x >= 0 && x < w && g[y][x] !== ".";
    return g.map((r, y) => r.map((c, x) => c === "." && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) ? "k" : c).join(""));
  }
  function uri(frame) {
    const K = (window.PIXEL_PALETTE && PIXEL_PALETTE.KEYS) || KEYS0, h = frame.length, w = frame[0].length;
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const c = cv.getContext("2d");
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ch = frame[y][x]; if (ch === ".") continue;
      c.fillStyle = ch === "x" ? "#b8382a" : ch === "X" ? "#7c2018" : K[ch] || "#888"; c.fillRect(x, y, 1, 1);
    }
    return cv.toDataURL();
  }
  // Each sprite goes to PIXEL_SPRITES (the pixel map paints it into its grid) and to ATLAS.sprites (the canvas marks layer).
  const ready = new Set();
  function sprite(name) {
    if (ready.has(name)) return name;
    const PS = (window.PIXEL_SPRITES = window.PIXEL_SPRITES || {});
    let S = PS[name];
    if (!S && GRIDS[name]) {
      const f = bake(GRIDS[name]);
      S = PS[name] = { kind: "object", label: name, era: [-9999, 2100], regions: ["any"], fps: 1, w: f[0].length, h: f.length, ax: f[0].length >> 1, ay: f.length - 1, frames: [f] };
    }
    if (!S || !S.frames) return null;
    try { ATLAS.sprite(name, { w: S.w, h: S.h, ax: S.ax, ay: S.ay, frames: [uri(S.frames[0])] }); } catch (err) { return null; }
    ready.add(name);
    return name;
  }
  // What carries an object along a leg: an army for loot, a ship by sea, a caravan by land, each picked for era and region.
  function carrier(s, lon, lat) {
    const E = window.PixelEra, y = s.y;
    const name = /looted|seized|tribute/.test(s.by) ? (E ? E.army(y, lon, lat) : "army_levy")
      : s.v === "sea" ? (E ? E.mover(y, lon, lat, true) : "ship_cog") : (E ? E.mover(y, lon, lat, false) : "caravan_mule");
    return sprite(name) || sprite(s.v === "sea" ? "ship_cog" : "caravan_mule");
  }

  // ---------- the data ----------
  let M = null;
  function prep(D) {
    if (M && M.D === D) return M;
    const src = i => ({ cite: D.src[i][0], url: D.src[i][1] || undefined });
    const objs = (D.objects || []).map(mk);
    return M = { D, src, objs, byId: Object.fromEntries(objs.map(o => [o.id, o])) };
  }
  function mk(o) {
    const ob = { ...o, stops: [] };
    // br: a branch stop (copies, or a part that left); the object itself stays where it was.
    ob.stops = o.st.map((s, i) => ({ ...s, i, owner: s.o || null, lon: s.at[0], lat: s.at[1], obj: ob, br: !!(s.cp || s.sp) }));
    ob.real = ob.stops.filter(s => !s.br);
    for (const s of ob.stops) s.prev = s.f != null ? ob.stops[s.f] : null;
    ob.y0 = ob.stops[0].y; ob.y1 = ob.stops[ob.stops.length - 1].y;
    // Geodesic length of each leg, for moving along it.
    for (const s of ob.stops) if (s.L) {
      s.seg = []; s.len = 0;
      for (let i = 1; i < s.L.length; i++) { const d = d3.geoDistance(s.L[i - 1], s.L[i]); s.seg.push(d); s.len += d; }
    }
    return ob;
  }
  // A point t (0-1) of the way along a leg, and the leg up to there.
  function along(s, t) {
    if (!s.L) return [s.lon, s.lat];
    let d = Math.max(0, Math.min(1, t)) * s.len;
    for (let i = 0; i < s.seg.length; i++) { if (d <= s.seg[i] || i === s.seg.length - 1) return d3.geoInterpolate(s.L[i], s.L[i + 1])(s.seg[i] ? Math.min(1, d / s.seg[i]) : 1); d -= s.seg[i]; }
    return s.L[s.L.length - 1];
  }
  function partial(s, t) {
    if (t >= 1) return s.L;
    const out = [s.L[0]]; let d = Math.max(0, t) * s.len;
    for (let i = 0; i < s.seg.length; i++) {
      if (d <= s.seg[i]) { out.push(d3.geoInterpolate(s.L[i], s.L[i + 1])(s.seg[i] ? d / s.seg[i] : 1)); break; }
      d -= s.seg[i]; out.push(s.L[i + 1]);
    }
    if (out.length < 2) out.push(out[0]);
    return out;
  }
  // A branch shows while it matters: a part that left stays on the map, copies for a generation.
  const branchOn = (s, y) => s.br && y >= s.y && (s.sp || y - s.y <= 40);
  // The last place the object itself had reached by stop i.
  const homeAt = (o, i) => { for (let j = i; j >= 0; j--) if (!o.stops[j].br) return o.stops[j]; return o.stops[0]; };
  // Where a famous object is in year y: the stop it is at, or the leg it is on. null before it exists or once lost.
  function where(o, y) {
    const st = o.real; if (y < st[0].y) return null;
    let i = 0; while (i + 1 < st.length && st[i + 1].y <= y) i++;
    const s = st[i], nx = st[i + 1];
    if (s.e && y > s.y + 40) return null;  // lost: a ghost for a generation, then gone until the next claim
    if (nx && nx.L && !nx.g && y > s.y && y >= nx.y - 1) { const p = along(nx, 0.5); return { s: nx, from: s, moving: true, lon: p[0], lat: p[1] }; }
    return { s, lon: s.lon, lat: s.lat, lost: !!s.e };
  }
  const srcOf = (C, o, s) => [...new Set([...(s && s.s || []), ...o.s])].map(C.src);
  function stopCard(C, s) {
    const o = s.obj;
    return { kick: `${o.t === "kind" ? "A kind of thing" : "Object journey"} · stop ${s.i + 1} of ${o.stops.length}`,
      title: `${o.n}${s.prev ? " → " : ": "}${s.p}`, year: s.y, lon: s.lon, lat: s.lat, line: s.L || undefined,
      meta: `${s.a ? "about " : ""}${fmtY(s.y)} · ${s.by}${s.owner ? " · " + s.owner : ""} · ${CONF[s.c]}${s.g ? " · route unknown" : ""}`,
      body: s.n, why: o.now ? "Today: " + o.now : o.why, sources: srcOf(C, o, s) };
  }

  // ---------- following one journey ----------
  // follow = {id, i, phase: rest | travel | dwell, t}. While it is set the lens draws only that object, from this state.
  const follow = { id: null, i: 0, phase: "dwell", t: 1, playing: false };
  let run = 0;
  const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wait = ms => new Promise(r => setTimeout(r, ms));

  // ---------- drawing ----------
  function legRec(s, pts, strong, arrow) {
    return { s, pts, conf: s.g || s.cp ? "legend" : s.c, strong, arrow };
  }
  function draw(ctx) {
    const C = prep(ctx.data), y = ctx.year, F = follow.id && C.byId[follow.id];
    const legs = [], rest = [], movers = [], dots = [];
    for (const o of F ? [F] : C.objs) {
      if (F) {
        // Everything before the current stop is done; the current leg is drawn as far as the traveller has got.
        const cur = o.stops[follow.i];
        for (const s of o.stops) {
          if (s.i > follow.i) break;
          if (o.t === "kind" && s.i < follow.i) dots.push({ s, lon: s.lon, lat: s.lat, old: false });
          if (!s.L) continue;
          if (s.i < follow.i) legs.push(legRec(s, s.L, s.i >= follow.i - 2, false));
          else if (follow.phase !== "rest") legs.push(legRec(s, partial(s, follow.phase === "travel" ? follow.t : 1), true, true));
        }
        for (const s of o.stops) if (s.br && s.i < follow.i) rest.push({ o, s, lon: s.lon, lat: s.lat, part: true, ghost: !!s.cp });
        const travel = follow.phase === "travel" && cur.L;
        if (travel) { const p = along(cur, follow.t); movers.push({ s: cur, lon: p[0], lat: p[1], sprite: cur.cp ? sprite("obj_paper") : cur.sp ? sprite(o.sp) : carrier(cur, p[0], p[1]), hi: true }); }
        if (cur.br) { const h = homeAt(o, cur.i); rest.push({ o, s: h, lon: h.lon, lat: h.lat, hi: !travel, ghost: h.c === "legend" }); if (follow.phase === "dwell") rest.push({ o, s: cur, lon: cur.lon, lat: cur.lat, part: true, hi: true, ghost: !!cur.cp }); }
        else if (!travel) { const s = follow.phase === "rest" && cur.prev ? homeAt(o, cur.prev.i) : cur; rest.push({ o, s, lon: s.lon, lat: s.lat, hi: true, ghost: s.c === "legend" || !!s.e }); }
        continue;
      }
      if (o.t === "single") {
        const w = where(o, y); if (!w) continue;
        const last = w.moving ? w.from : w.s;
        for (const s of o.stops) {
          if (s.br) { if (branchOn(s, y)) { if (s.L) legs.push(legRec(s, s.L, y - s.y <= FRESH, y - s.y <= FRESH)); rest.push({ o, s, lon: s.lon, lat: s.lat, part: true, ghost: !!s.cp }); } continue; }
          if (s.L && s.i <= last.i) legs.push(legRec(s, s.L, s.i >= last.i - 1, s.i === last.i && y - s.y <= FRESH));
        }
        if (w.moving) movers.push({ s: w.s, lon: w.lon, lat: w.lat, sprite: carrier(w.s, w.lon, w.lat) });
        else rest.push({ o, s: w.s, lon: w.lon, lat: w.lat, ghost: w.s.c === "legend" || w.lost });
      } else {
        const reached = o.stops.filter(s => s.y <= y); if (!reached.length) continue;
        let newest = reached[reached.length - 1];
        for (const s of reached) {
          const fresh = y - s.y <= FRESH;
          if (s.L) legs.push(legRec(s, s.L, fresh, fresh));
          if (s !== newest) dots.push({ s, lon: s.lon, lat: s.lat, old: !fresh });
        }
        rest.push({ o, s: newest, lon: newest.lon, lat: newest.lat, ghost: newest.c === "legend", kind: true });
      }
    }
    // Lines by confidence: strong legs at full weight, older ones faint.
    for (const conf of ["sure", "likely", "legend"]) for (const strong of [true, false]) for (const arrow of [true, false]) {
      const list = legs.filter(l => l.conf === conf && l.strong === strong && l.arrow === arrow); if (!list.length) continue;
      ctx.paths(list, { key: l => l.s.obj.id + ":" + l.s.i, coords: l => l.pts, conf, arrow, alpha: strong ? (F ? .95 : .8) : .3, width: strong ? (F ? 2.6 : 2) : 1.4,
        title: l => `${l.s.obj.n}: ${l.s.prev ? l.s.prev.p + " → " : ""}${l.s.p}, ${fmtY(l.s.y)} (${CONF[l.conf]})`, card: l => stopCard(C, l.s) });
    }
    ctx.pins(dots, { key: d => d.s.obj.id + ":" + d.s.i, shape: "circle", size: d => d.old ? 2.2 : 3, fade: d => d.old ? .45 : .9, ghost: d => d.s.c === "legend",
      label: d => d.old ? null : `${d.s.obj.n} · ${d.s.p}`, title: d => `${d.s.obj.n} in ${d.s.p} by ${fmtY(d.s.y)}`, card: d => stopCard(C, d.s) });
    ctx.pins(rest, { key: r => r.o.id + (r.part ? ":" + r.s.i : ""), shape: r => sprite(r.s.cp ? "obj_paper" : r.o.sp) || "diamond", hi: r => !!r.hi, ghost: r => !!r.ghost, always: !!F,
      label: r => r.kind ? `${r.o.n} · ${r.s.p}` : r.s.cp ? `copies of the ${r.o.n}` : r.part ? `${r.o.n} (part) · ${r.s.p}` : r.s.e && ctx.year > r.s.y ? `${r.o.n} (lost)` : r.o.n,
      title: r => `${r.o.n} · ${r.s.p}${r.s.owner ? ", " + r.s.owner : ""} · ${fmtY(r.s.y)}`, card: r => stopCard(C, r.s) });
    if (F && follow.quiz) {
      const q = follow.quiz;
      ctx.pins(q.opts.map(x => ({ ...x, lon: x.s.lon, lat: x.s.lat })), { key: x => "q" + x.k, shape: "diamond", size: 6, always: true, pri: 30, hi: x => !!q.picked && !!x.right,
        fade: x => q.picked && !x.right ? .35 : 1, label: x => `${x.k}  ${x.s.p}${q.picked && x.right ? "  ✓" : ""}`, title: x => `${x.k}: ${x.s.p}` });
    }
    ctx.pins(movers, { key: m => "m:" + m.s.obj.id, shape: m => m.sprite || "circle", hi: m => !!m.hi, always: true,
      label: m => `${m.s.obj.n} → ${m.s.p}`, title: m => `${m.s.obj.n} on its way to ${m.s.p} (${m.s.by})`, card: m => stopCard(C, m.s) });
  }

  // ---------- Here and This year ----------
  function hereRows(ctx, at) {
    const C = prep(ctx.data), y = ctx.year, out = [], km = (a, b) => ctx.km(a, b), r = Math.max(at.r || 300, 300);
    for (const o of C.objs) {
      if (o.t === "single") {
        const w = where(o, y);
        if (w && km([at.lon, at.lat], [w.lon, w.lat]) <= r) out.push({ title: w.moving ? `${o.n} is passing through` : `${o.n} is here`, year: w.s.y,
          why: `${w.s.p}${w.s.owner ? ", held by " + w.s.owner : ""}. ${first(w.s.n)}`, card: stopCard(C, w.s), tag: CONF[w.s.c] === "documented" ? null : CONF[w.s.c] });
      }
      for (const s of o.stops) {
        if (km([at.lon, at.lat], [s.lon, s.lat]) > r) continue;
        if (o.t === "single") { const w = where(o, y); if (w && w.s === s) continue; }
        out.push({ title: `${o.n}${o.t === "kind" ? (s.y <= y ? " reached " : " will reach ") : (s.y <= y ? " was in " : " will be in ")}${s.p}`, year: s.y,
          why: first(s.n), dim: s.y > y || y - s.y > 150, tag: s.y > y ? "not yet" : null, card: stopCard(C, s) });
      }
    }
    return out.sort((a, b) => (a.dim || 0) - (b.dim || 0) || Math.abs(a.year - y) - Math.abs(b.year - y)).slice(0, 8);
  }
  function nowRows(ctx) {
    const C = prep(ctx.data), y = ctx.year;
    const moves = C.objs.flatMap(o => o.stops.filter(s => s.L && Math.abs(s.y - y) <= 10)).sort((a, b) => Math.abs(a.y - y) - Math.abs(b.y - y)).slice(0, 4);
    return moves.map(s => ({ title: `${s.obj.n} → ${s.p}`, year: s.y, why: `${s.by}${s.owner ? ", " + s.owner : ""}. ${first(s.n)}`, dim: s.y > y, card: stopCard(C, s) }));
  }

  ATLAS.lens({
    id: ID, name: "Object journeys", family: "wealth", color: COLOR, on: false,
    guide: ["economy", "art"],
    desc: "Famous objects and kinds of things on the move",
    key: [["sprite", "A famous object where it was this year; a ship, caravan or army while it travels"],
      ["line", "Its path: solid = documented, dashed = likely, dots = legend or unknown route"],
      ["small", "Each place a kind of thing (porcelain, pepper, paper...) had reached"]],
    index: D => (D.objects || []).map(o => `${o.n} (${o.t === "kind" ? "kind of thing" : "object"}): ${o.st.map(s => `${s.p} ${s.y}${s.c !== "sure" ? " [" + s.c + "]" : ""}`).join(", ")}`).join("\n"),
    draw,
    here: hereRows,
    now: nowRows,
    strip: D => (D.objects || []).flatMap(o => o.st.map(s => s.y)),
  });

  // ---------- the Objects tab: pick a thing, follow it ----------
  const STYLE = `
.obj { display: grid; gap: 12px; }
.obj .lede { margin: 0; color: var(--ink-soft); }
.obj .grp { font: 600 11px/1.2 var(--mono, ui-monospace, monospace); text-transform: uppercase; letter-spacing: .06em; color: var(--ink-soft); margin: 6px 0 0; }
.obj .row { display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 6px 4px; border-top: 1px solid var(--rule, #ddd); cursor: pointer; background: none; border-left: 0; border-right: 0; border-bottom: 0; text-align: left; color: inherit; font: inherit; width: 100%; }
.obj .row:hover, .obj .row:focus-visible { background: color-mix(in srgb, ${COLOR} 10%, transparent); }
.obj .row img, .obj .hd img { width: 27px; height: auto; image-rendering: pixelated; }
.obj .row b { display: block; } .obj .row span { color: var(--ink-soft); font-size: 12.5px; }
.obj .row .yr { font-size: 12px; color: var(--ink-soft); white-space: nowrap; }
.obj .go { font: 600 13px/1 inherit; padding: 8px 12px; border-radius: 6px; border: 1px solid ${COLOR}; background: ${COLOR}; color: #fff; cursor: pointer; }
.obj .go.ghost { background: none; color: ${COLOR}; }
.obj .hd { display: grid; grid-template-columns: 30px minmax(0, 1fr); gap: 8px; align-items: start; }
.obj .hd h3 { margin: 0; font-size: 18px; }
.obj .ctl { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.obj .ctl button { min-width: 36px; }
.obj .stops { list-style: none; margin: 0; padding: 0; display: grid; gap: 0; }
.obj .stops li { display: grid; grid-template-columns: 12px minmax(0, 1fr); gap: 8px; padding: 6px 0; cursor: pointer; border-top: 1px dashed var(--rule, #ddd); }
.obj .stops li i { width: 9px; height: 9px; margin-top: 5px; border: 2px solid ${COLOR}; border-radius: 50%; }
.obj .stops li.likely i { border-style: dashed; } .obj .stops li.legend i { border-style: dotted; opacity: .7; }
.obj .stops li.on { background: color-mix(in srgb, ${COLOR} 12%, transparent); }
.obj .stops li.on i, .obj .stops li.done i { background: ${COLOR}; }
.obj .stops li .m { font-size: 12px; color: var(--ink-soft); }
.obj .stops li p { margin: 4px 0 0; font-size: 13.5px; display: none; }
.obj .stops li.on p { display: block; }
.obj .note { font-size: 13px; color: var(--ink-soft); margin: 0; }
.obj .quiz { display: grid; gap: 6px; padding: 10px; border: 2px solid ${COLOR}; border-radius: 8px; }
.obj .quiz .go { text-align: left; } .obj .quiz .dim { opacity: .45; }
.obj .quiz .yes { color: #2f7a4b; margin: 0; font-weight: 600; } .obj .quiz .no { color: #a33a2a; margin: 0; font-weight: 600; }
.obj .conf { display: flex; gap: 12px; flex-wrap: wrap; font-size: 12px; color: var(--ink-soft); }
.obj .conf span::before { content: ""; display: inline-block; width: 18px; margin-right: 5px; vertical-align: middle; border-top: 2px solid ${COLOR}; }
.obj .conf .likely::before { border-top-style: dashed; } .obj .conf .legend::before { border-top-style: dotted; }
`;
  let pane = null, api = null, openId = null;
  const thumb = name => { const n = sprite(name), S = n && ATLAS.sprites[n]; return S ? `<img src="${S.frames[0]}" alt="">` : ""; };
  const C0 = () => prep((typeof LENS_DATA !== "undefined" && LENS_DATA[ID]) || { objects: [], src: [] });

  function renderList() {
    const C = C0(), row = o => `<button type="button" class="row" data-id="${esc(o.id)}">${thumb(o.sp)}<div><b>${esc(o.n)}</b><span>${esc(first(o.w))}</span></div><span class="yr">${esc(fmtY(o.y0))} – ${esc(fmtY(o.y1))}</span></button>`;
    pane.innerHTML = `<div class="obj"><p class="lede">Follow a thing through time: who made it, who took it, how it travelled, and how sure we are of each step.</p>
      <div class="ctl"><button type="button" class="go" data-act="surprise">Follow something</button></div>
      <p class="grp">Famous objects</p>${C.objs.filter(o => o.t === "single").map(row).join("")}
      <p class="grp">Kinds of things</p>${C.objs.filter(o => o.t === "kind").map(row).join("")}
      <p class="note">Drafts written from the cited works, waiting for the judge. Routes between stops are drawn as likely paths, not tracks.</p></div>`;
  }
  function renderObj() {
    const C = C0(), o = C.byId[openId]; if (!o) return renderList();
    const on = follow.id === o.id;
    pane.innerHTML = `<div class="obj">
      <div class="ctl"><button type="button" class="go ghost" data-act="back">← All objects</button></div>
      <div class="hd">${thumb(o.sp)}<div><h3>${esc(o.n)}</h3><p class="note">${esc(fmtY(o.y0))} – ${esc(fmtY(o.y1))} · ${o.stops.length} stops</p></div></div>
      <p>${esc(o.w)}</p>${o.why ? `<p class="note">${esc(o.why)}</p>` : ""}
      <div class="ctl">${on ? `<button type="button" class="go ghost" data-act="prev" aria-label="Previous stop">◀</button>
        <button type="button" class="go" data-act="pause">${follow.playing ? "❚❚ Pause" : "▶ Play"}</button>
        <button type="button" class="go ghost" data-act="next" aria-label="Next stop">▶</button><button type="button" class="go ghost" data-act="stop">✕ Stop</button>`
        : `<button type="button" class="go" data-act="follow">▶ Follow its journey</button><button type="button" class="go ghost" data-act="play">🎲 Play: guess where it goes</button>`}</div>
      ${on ? quizHtml(o) : best(o.id) != null ? `<p class="note">Your best guessing game: ${best(o.id)} of ${rounds(o)}.</p>` : ""}
      <div class="conf"><span>documented</span><span class="likely">likely</span><span class="legend">legend or unknown route</span></div>
      <ol class="stops">${o.stops.map(s => `<li data-i="${s.i}" class="${s.c}${on && s.i === follow.i ? " on" : ""}${on && s.i < follow.i ? " done" : ""}"><i></i><div>
        <b>${esc(s.p)}</b> <span class="m">${s.a ? "about " : ""}${esc(fmtY(s.y))} · ${esc(s.by)}${s.owner ? " · " + esc(s.owner) : ""}${s.c !== "sure" ? " · " + esc(CONF[s.c]) : ""}</span>
        <p>${esc(s.n)}${s.m ? `<br><span class="m">You could have met it as ${esc(s.m)}.</span>` : ""}</p></div></li>`).join("")}</ol>
      ${o.now ? `<p class="note"><b>Today:</b> ${esc(o.now)}</p>` : ""}${o.dis ? `<p class="note"><b>Disputed:</b> ${esc(o.dis)}</p>` : ""}
      <p class="note">Sources: ${o.s.map(i => { const [c, u] = C.D.src[i]; return u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(c)}</a>` : esc(c); }).join("; ")}</p></div>`;
    const li = pane.querySelector("li.on"); if (li && li.scrollIntoView) li.scrollIntoView({ block: "nearest" });
  }
  function quizHtml(o) {
    const g = follow.game; if (!g) return "";
    const q = follow.quiz, head = `<p class="note"><b>Guessing game:</b> ${g.score} of ${g.n} right${g.done ? `. Finished! Best: ${best(o.id) ?? g.score} of ${rounds(o)}.` : ""}</p>`;
    if (!q) return head;
    const s = o.stops[q.i], prev = s.prev || o.stops[q.i - 1];
    return `${head}<div class="quiz"><b>${esc(fmtY(prev.y))}, ${esc(prev.p)}. Where does the ${esc(o.n)} go next${s.y !== prev.y ? `, by ${esc(fmtY(s.y))}` : ""}?</b>
      ${q.opts.map(x => `<button type="button" class="go ${q.picked ? (x.right ? "" : "ghost dim") : "ghost"}" data-act="pick${x.k}">${x.k} · ${esc(x.s.p)}</button>`).join("")}
      ${q.picked ? `<p class="${q.right ? "yes" : "no"}">${q.right ? "Right!" : `No: it went to ${esc(s.p)}.`} ${esc(s.by)}${s.owner ? ", " + esc(s.owner) : ""}.</p>` : ""}</div>`;
  }
  const render = () => { if (pane) openId ? renderObj() : renderList(); };

  // Frame a leg: the bounds of its path (or a region round the stop), wide enough to see where it came from.
  function viewFor(s) {
    let pts = s.L || (s.prev ? [s.prev.at, s.at] : [s.at]);
    // The map is cut at 180°: for a leg across the Pacific, frame the half it arrives in.
    const cut = pts.findIndex((p, i) => i && Math.abs(p[0] - pts[i - 1][0]) > 180);
    if (cut > 0) { const half = pts.filter(p => Math.sign(p[0]) === Math.sign(s.lon)); pts = half.length > 1 ? half : [s.at, s.at]; }
    if (pts.length < 2 || (pts.length === 2 && pts[0] === pts[1])) return { lon: s.lon, lat: s.lat, span: 30 };
    const [[w, so], [e, n]] = d3.geoBounds({ type: "LineString", coordinates: pts });
    const dl = ((e - w) % 360 + 360) % 360, lon = w + dl / 2;
    return { lon: lon > 180 ? lon - 360 : lon, lat: (so + n) / 2, span: Math.max(22, Math.min(300, Math.max(dl * 1.35, (n - so) * 2.3))) };
  }
  function caption(s) {
    const o = s.obj;
    api.scene({ lens: o.t === "kind" ? "A kind of thing" : "Object journey", year: s.y, title: `${o.n}: ${s.p}. ${first(s.n)}`.slice(0, 220) });
  }
  // One stop: fly to the leg, let the years pass where it was, carry it along the leg, then hold on the caption.
  async function showStop(i, my) {
    const C = C0(), o = C.byId[follow.id], s = o && o.stops[i]; if (!s) return;
    follow.i = i; follow.phase = "rest"; follow.t = 0; render();
    api.setOn(ID, true); api.clearScene();
    api.fly(viewFor(s), 1100);
    const y0 = i > 0 ? Math.min(s.y, o.stops[i - 1].y) : s.y, gap = s.y - y0;
    api.setYear(y0, false); api.redraw();
    if (gap > 1) { const ms = reduce() ? 0 : Math.min(1500, 450 + 160 * Math.log2(gap)); api.setYear(s.y - 1, true, ms); await wait(Math.max(ms, 900)); }
    else await wait(reduce() ? 0 : 1000);
    if (my !== run) return;
    api.setYear(s.y, false);
    if (s.L && !reduce()) {
      follow.phase = "travel";
      const ms = Math.min(3200, 900 + 2600 * Math.sqrt(s.len / Math.PI)), t0 = performance.now();
      await new Promise(done => {
        const tick = now => {
          if (my !== run) return done();
          follow.t = Math.min(1, (now - t0) / ms); api.redraw();
          if (follow.t < 1) requestAnimationFrame(tick); else done();
        };
        requestAnimationFrame(tick);
      });
      if (my !== run) return;
    }
    follow.phase = "dwell"; follow.t = 1; api.redraw();
    caption(s); render();
  }
  async function playFrom(i) {
    const my = ++run, o = C0().byId[follow.id]; if (!o) return;
    follow.playing = true; render();
    for (; i < o.stops.length; i++) {
      await showStop(i, my); if (my !== run) return;
      if (follow.game && i + 1 < o.stops.length && askable(o.stops[i + 1])) { await ask(o, i + 1, my); if (my !== run) return; continue; }
      await wait(reduce() ? 1500 : 3400); if (my !== run || !follow.playing) return;
    }
    follow.playing = false;
    if (follow.game) { follow.game.done = true; best(o.id, follow.game.score); }
    render();
  }

  // ---------- play: guess where it goes next ----------
  // Three places on the map: the real next stop and two decoys from other journeys of about the same time.
  function options(o, s) {
    const C = C0(), far = p => d3.geoDistance([p.lon, p.lat], [s.lon, s.lat]) * 6371 > 600;
    const pool = C.objs.filter(x => x !== o).flatMap(x => x.stops).filter(p => far(p) && Math.abs(p.y - s.y) <= 250);
    const seen = new Set([s.p]), out = [{ s, right: true }];
    const shuffled = pool.map(p => [Math.random(), p]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
    for (const p of shuffled) { if (out.length >= 3) break; if (seen.has(p.p) || out.some(q => d3.geoDistance([p.lon, p.lat], [q.s.lon, q.s.lat]) * 6371 < 600)) continue; seen.add(p.p); out.push({ s: p }); }
    return out.map(q => [Math.random(), q]).sort((a, b) => a[0] - b[0]).map((x, k) => ({ ...x[1], k: "ABC"[k] }));
  }
  // Only ask about real moves: a stop that stays put (found, lost, hidden nearby) just plays.
  const askable = s => s.prev && !s.br && d3.geoDistance([s.lon, s.lat], [s.prev.lon, s.prev.lat]) * 6371 > 150;
  const rounds = o => o.stops.filter(askable).length;
  function ask(o, i, my) {
    const s = o.stops[i];
    return new Promise(done => {
      follow.quiz = { i, opts: options(o, s), done };
      api.redraw(); render();
      const prev = o.stops[i - 1];
      api.fly({ ...viewFor(s), span: Math.max(60, viewFor(s).span * 1.6), lon: (viewFor(s).lon + prev.lon) / 2, lat: (viewFor(s).lat + prev.lat) / 2 }, 900);
      const check = setInterval(() => { if (my !== run) { clearInterval(check); follow.quiz = null; done(); } }, 300);
      follow.quiz.stop = () => clearInterval(check);
    });
  }
  function answer(k) {
    const q = follow.quiz; if (!q || q.picked) return;
    const opt = q.opts.find(x => x.k === k); if (!opt) return;
    q.picked = k; q.right = !!opt.right;
    follow.game.n++; if (q.right) follow.game.score++;
    render(); api.redraw();
    setTimeout(() => { if (follow.quiz === q) { q.stop(); follow.quiz = null; q.done(); } }, reduce() ? 600 : 1500);
  }
  const BEST = "atlas.objects.best.v1";
  function best(id, score) {
    try { const b = JSON.parse(localStorage.getItem(BEST) || "{}"); if (score != null && !(b[id] >= score)) { b[id] = score; localStorage.setItem(BEST, JSON.stringify(b)); } return b[id]; } catch { return null; }
  }
  function start(id, game = false) {
    const o = C0().byId[id]; if (!o) return false;
    follow.id = id; openId = id; follow.i = 0; follow.quiz = null; follow.game = game ? { score: 0, n: 0 } : null;
    if (api) { api.setTab(ID); playFrom(0); }
    return true;
  }
  function stop() { run++; follow.id = null; follow.playing = false; follow.quiz = null; follow.game = null; if (api) { api.clearScene(); api.redraw(); } render(); }
  function act(a) {
    const o = C0().byId[follow.id];
    if (a === "surprise") { const all = C0().objs; return start(all[Math.floor(Math.random() * all.length)].id); }
    if (a === "back") { if (follow.id) stop(); openId = null; return render(); }
    if (a === "follow") return start(openId);
    if (a === "play") return start(openId, true);
    if (a.startsWith("pick")) return answer(a.slice(4));
    if (a === "stop") return stop();
    if (!o) return;
    if (a === "pause") {
      if (follow.playing) { run++; follow.playing = false; follow.phase = "dwell"; follow.t = 1; api.redraw(); render(); }
      else playFrom(follow.i + 1 < o.stops.length ? follow.i + 1 : 0);
    }
    if (a === "next" || a === "prev") {
      const i = Math.max(0, Math.min(o.stops.length - 1, follow.i + (a === "next" ? 1 : -1)));
      if (follow.playing) playFrom(i); else { const my = ++run; showStop(i, my); }
    }
  }

  ATLAS.tab({
    id: ID, name: "Objects",
    mount(el, a) {
      pane = el; api = a;
      if (!document.getElementById("objects-style")) { const st = document.createElement("style"); st.id = "objects-style"; st.textContent = STYLE; document.head.appendChild(st); }
      el.addEventListener("click", ev => {
        const b = ev.target.closest("[data-act]"); if (b) return act(b.dataset.act);
        const r = ev.target.closest(".row[data-id]"); if (r) { openId = r.dataset.id; return render(); }
        const li = ev.target.closest("li[data-i]");
        if (li) {
          const C = C0(), o = C.byId[openId], s = o && o.stops[+li.dataset.i]; if (!s) return;
          if (follow.id !== o.id) { follow.id = o.id; }
          run++; follow.playing = false; showStop(s.i, run);
        }
      });
      // Stop following if the person drags time away from the journey.
      document.addEventListener("keydown", ev => { if (ev.key === "Escape" && follow.id) stop(); });
      render();
    },
    show() { render(); },
  });

  // ---------- for other plugins (the life RPG): which object is where ----------
  const rowOf = (C, o, s, extra) => ({ id: o.id, name: o.n, type: o.t, lon: s.lon, lat: s.lat, place: s.p, owner: s.owner, by: s.by, conf: s.c, meet: s.m || null, year: s.y, card: stopCard(C, s), ...extra });
  const at = y => {
    const C = C0(), out = [];
    for (const o of C.objs) {
      if (o.t === "single") { const w = where(o, y); if (w) out.push(rowOf(C, o, w.s, { moving: !!w.moving, lon: w.lon, lat: w.lat, lost: !!w.lost })); }
      else for (const s of o.stops) if (s.y <= y) out.push(rowOf(C, o, s, { moving: false }));
    }
    return out;
  };
  ATLAS.objects = {
    list: () => C0().objs.map(o => ({ id: o.id, name: o.n, type: o.t, what: o.w, sprite: sprite(o.sp), from: o.y0, to: o.y1 })),
    journey: id => {
      const o = C0().byId[id]; if (!o) return null;
      return { id: o.id, name: o.n, type: o.t, what: o.w, why: o.why, now: o.now, dispute: o.dis, sprite: sprite(o.sp),
        stops: o.stops.map(s => ({ y: s.y, approx: !!s.a, lon: s.lon, lat: s.lat, place: s.p, owner: s.owner, by: s.by, conf: s.c, note: s.n, meet: s.m || null,
          from: s.f ?? null, path: s.L || null, gap: !!s.g, branch: s.br, sources: srcOf(C0(), o, s) })),
        // The same journey as legs in the shared itinerary format (ATLAS.world): one leg per move, t0 leaving, t1 arriving.
        legs: o.stops.filter(s => s.L).map(s => ({ place: s.p, lon: s.lon, lat: s.lat, t0: Math.max(s.prev ? s.prev.y : s.y, s.y - 1), t1: s.y,
          mode: s.v || "land", conf: s.g ? "legend" : s.c, by: s.by, from: s.prev ? s.prev.p : null, path: s.L, branch: s.br, src: srcOf(C0(), o, s) })) };
    },
    at,
    near: (lon, lat, y, km = 300) => at(y).filter(r => d3.geoDistance([lon, lat], [r.lon, r.lat]) * 6371 <= km),
    follow: id => start(id),
    stop,
  };
})();
