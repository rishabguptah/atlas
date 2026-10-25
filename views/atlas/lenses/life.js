// Live a life: step into a real person's life and face their real choices (with what-if branches), have Claude
// draft the life of anyone else, or be born an ordinary person in any year and place and live it year by year.
// The world around you is the Atlas's own data: plague outbreaks, famines, battles, who rules you, cities that fall,
// trade routes, famous neighbours. Travel runs on a half-degree terrain grid with period speeds, ports, canals,
// monsoons and winter seas. Rules and sources: data/life/rules.json and data/motion/rules.json; travel from views/atlas/world/route.js. Progress stays in this browser (atlas.life.v1).
(function () {
  const D = () => (typeof LENS_DATA !== "undefined" && LENS_DATA.life) || null;
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const SEASON = m => ["winter", "winter", "spring", "spring", "spring", "summer", "summer", "summer", "autumn", "autumn", "autumn", "winter"][m - 1];
  const KEY = "atlas.life.v1";
  let api = null, el = null;
  const fy = y => api ? api.fmtYear(y) : y < 0 ? `${-y} BCE` : `${y}`;
  const R = Math.PI / 180;
  const km = (a, b) => { const dl = (b.lat - a.lat) * R, dn = (b.lon - a.lon) * R, x = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * R) * Math.cos(b.lat * R) * Math.sin(dn / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(x))); };
  const interp = (rows, y, col = 1) => { if (y <= rows[0][0]) return rows[0][col]; for (let i = 1; i < rows.length; i++) if (y <= rows[i][0]) { const a = rows[i - 1], b = rows[i]; return a[col] + (b[col] - a[col]) * (y - a[0]) / (b[0] - a[0]); } return rows[rows.length - 1][col]; };
  const pct = p => p >= 0.095 ? Math.round(p * 100) + "%" : p >= 0.0095 ? (p * 100).toFixed(1).replace(/\.0$/, "") + "%" : p > 0 ? "under 1%" : "0%";
  const days = d => d < 1.5 ? "about a day" : d < 45 ? `${Math.round(d)} days` : d < 400 ? `${Math.round(d / 30.4)} months` : `${(d / 365).toFixed(1).replace(/\.0$/, "")} years`;
  const rnd = (() => { let s = Date.now() % 2147483647; return () => (s = s * 16807 % 2147483647) / 2147483647; })();
  const pickOne = a => a[Math.floor(rnd() * a.length)];
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  const P = Object.assign({ cur: null, done: [], drafts: {} }, load());
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch { /* private window: play on without saving */ } };

  // ---------- travel and the world's pieces come from the shared motion model (views/atlas/world/route.js) ----------
  const WM = () => window.ATLAS.world.motion;
  const cellOf = (lon, lat) => WM().cellOf(lon, lat), cls = i => WM().cls(i), isWater = i => WM().isWater(i), COLS = 720;
  const polity = (lon, lat, y) => WM().polity(lon, lat, y), plagueAt = (lon, lat, y) => WM().plagueAt(lon, lat, y, D().rules.plague.km);
  const battles = (y, w) => WM().battles(y, w), modesFor = y => WM().modesFor(y), inBox = (b, lon, lat) => WM().inBox(b, lon, lat);
  const route = (a, b, y, m, pref) => ATLAS.world.route(a, b, { y, m }, { pref }), flight = (a, b, y) => ATLAS.world.route(a, b, y, { pref: "air" });
  const MR = () => WM().rules();

  // ---------- the world's data, near a place in a year ----------
  const PPL = () => {
    if (PPL.c) return PPL.c;
    if (typeof PEOPLE === "undefined") return PPL.c = [];
    return PPL.c = PEOPLE.people.map(r => { const bp = PEOPLE.places[r[3]], dp = PEOPLE.places[r[4]]; return { name: r[0], b: r[1], d: r[2], occ: r[5], hpi: r[7], wiki: r[8], place: bp ? bp[0] : "", lat: bp ? bp[1] : null, lon: bp ? bp[2] : null, dplace: dp ? dp[0] : "", dlat: dp ? dp[1] : null, dlon: dp ? dp[2] : null }; })
      .filter(p => p.lat != null).sort((a, b) => b.hpi - a.hpi);
  };
  function around(at, y, opts = {}) {
    const rules = D().rules, out = [];
    if (plagueAt(at.lon, at.lat, y)) out.push({ k: "plague", t: "Plague is in your town this year", why: "A dated outbreak near here in the plague records.", src: rules.plague.src[0].cite });
    for (const s of D().shocks) if (s[1] <= y && y <= s[2] && km(at, { lon: s[3], lat: s[4] }) < (s[5] === "famine" ? rules.famine.km : s[5] === "eruption" ? 400 : 900))
      out.push({ k: s[5], t: s[0], why: s[8], src: s[7] });
    for (const b of battles(y, 0)) { const d = km(at, b); if (d < (opts.battleKm || 300)) out.push({ k: "battle", t: b.name, why: `${Math.round(d)} km from you${b.why ? ". " + b.why : ""}`, d, lon: b.lon, lat: b.lat }); }
    if (typeof ENTRIES !== "undefined") for (const e of ENTRIES) {
      if (e.end === y && km(at, e) < 150) out.push({ k: "fall", t: `${e.name} falls`, why: (e.why || "").slice(0, 160), src: "Living Atlas cities" });
      else if (e.start === y && km(at, e) < 150) out.push({ k: "found", t: `${e.name} is founded`, why: (e.what || "").slice(0, 160) });
    }
    const ppl = PPL().filter(p => p.b + 18 <= y && (p.d == null || y <= p.d) && km(at, p) < (opts.pplKm || 400)).slice(0, 3);
    for (const p of ppl) out.push({ k: "person", t: `${p.name} is alive nearby`, why: `${p.occ}, born ${fy(p.b)} in ${p.place}`, p });
    for (const t of (typeof MONEY !== "undefined" && MONEY.trade) || []) if (t.start <= y && (t.end == null || y <= t.end) && t.line.some(([lo, la]) => km(at, { lon: lo, lat: la }) < 300)) out.push({ k: "trade", t: `${t.name} run near you`, why: t.why, route: t });
    try { if (window.ATLAS.objects && ATLAS.objects.near) for (const o of ATLAS.objects.near(at.lon, at.lat, y, 300).slice(0, 2)) out.push({ k: "object", t: `${o.name} is here`, why: o.meet || (o.place ? `At ${o.place}${o.owner ? ", held by " + o.owner : ""}` : ""), o }); } catch { /* objects lens not on this page */ }
    return out;
  }

  // ---------- sprites: pixel art for the traveller, drawn as pins ----------
  function spriteURI(name, team) {
    const S = (window.PIXEL_SPRITES || {})[name], K = (window.PIXEL_PALETTE || {}).KEYS; if (!S || !K) return null;
    const fr = S.frames[0], cv = document.createElement("canvas"); cv.width = S.w; cv.height = S.h;
    const c = cv.getContext("2d");
    fr.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === ".") return; c.fillStyle = ch === "x" ? team : ch === "X" ? shade(team) : K[ch] || "#000"; c.fillRect(x, y, 1, 1); }));
    return { w: S.w, h: S.h, ax: S.ax, ay: S.ay, href: cv.toDataURL() };
  }
  const shade = h => { const n = parseInt(h.slice(1), 16); return "#" + [16, 8, 0].map(s => Math.round(((n >> s) & 255) * 0.6).toString(16).padStart(2, "0")).join(""); };
  const MODE_SPRITE = { foot: "person_pilgrim", horse: "army_horse_archer", camel: "caravan_camel", river: "ship_dhow", sail: "ship_galley", ocean: "ship_galleon", steam: "ship_steamer", rail: "caravan_wagon", motor: "caravan_wagon", air: "ship_modern", board: "ship_cog" };
  function seaSprite(y, lon) { if (y >= 1840) return "ship_steamer"; if (y >= 1450 && (lon < 0 || y >= 1500)) return "ship_galleon"; if (lon > 95 && lon < 150) return "ship_junk"; if (lon > 35 && lon <= 95) return "ship_dhow"; return y < 1100 ? "ship_galley" : "ship_cog"; }
  const regSprites = {};
  function sprite(name, team) {
    const key = "life_" + name + "_" + team.slice(1);
    if (!regSprites[key]) { const s = spriteURI(name, team); if (!s) return null; regSprites[key] = 1; ATLAS.sprite(key, s); }
    return key;
  }

  // ---------- game state ----------
  // A game: {kind: "real"|"ordinary", life (real/drafted), i (chapter), at {n, lon, lat}, y, m, age, st {health, wealth, learning, renown},
  //   log: [{y, t, k}], path: [[lon,lat]...], km, real: [[lon,lat]...], picks: [{i, real, t}], div, over, plan}
  const G0 = () => P.cur;
  const lifeById = id => D().lives.find(l => l.id === id) || P.drafts[id] || null;
  function startReal(life) {
    const c0 = life.chapters[0];
    P.cur = { kind: "real", id: life.id, i: 0, at: c0.at, y: c0.y, m: c0.m || 1, born: life.born, st: { health: 6, wealth: 3, learning: 3, renown: 1 },
      log: [], path: [[c0.at.lon, c0.at.lat]], real: [[c0.at.lon, c0.at.lat]], km: 0, tdays: 0, picks: [], div: 0, over: null, phase: "choose", team: life.team || "#a8342a" };
    save(); show(true);
  }
  // Each chronicle line remembers where it happened, so the life can replay as a Story (WORLD.md L4).
  function logIt(g, e, pts) {
    e.at = { n: g.at.n, lon: +g.at.lon.toFixed(2), lat: +g.at.lat.toFixed(2) }; e.m = g.m || 1;
    if (pts && pts.length > 1) { const st = Math.max(1, Math.ceil(pts.length / 60)); e.pts = pts.filter((_, i) => i % st === 0 || i === pts.length - 1).map(p => [+p[0].toFixed(2), +p[1].toFixed(2)]); }
    g.log.push(e);
  }
  function story(g = G0()) {
    if (!g) return null;
    const life = lifeOf(g), who = life ? `person:${life.id}` : null, gen = g.kind !== "real";
    const conf = e => gen ? "estimated" : e.k === "real" ? "attested" : e.k === "travel" ? "estimated" : "approximate";
    const scenes = g.log.map((e, i) => {
      const at = e.at || g.at, cap = e.t.split(/(?<=\.)\s/)[0];
      return { id: `s${i}`, t: e.y, date: `${Math.round(e.y)}-${String(e.m || 1).padStart(2, "0")}`, view: { lon: at.lon, lat: at.lat, span: e.pts ? 24 : 6 },
        lenses: ["life"], highlight: [], pins: [{ lon: at.lon, lat: at.lat, n: at.n }], routes: e.pts ? [{ pts: e.pts, conf: "estimated", mode: "travel" }] : [],
        actors: who ? [who] : [], caption: cap, text: e.t, by: "life", conf: conf(e), generated: gen || undefined,
        sources: life ? life.sources : [], branch: e.k === "alt" ? "yours" : null, next: i + 1 < g.log.length ? [`s${i + 1}`] : [] };
    });
    if (g.over) scenes.push({ id: "end", t: g.over.y, date: `${g.over.y}`, view: { lon: g.at.lon, lat: g.at.lat, span: 8 }, lenses: ["life"], pins: [{ lon: g.at.lon, lat: g.at.lat, n: g.at.n }], routes: [],
      actors: who ? [who] : [], caption: g.over.t.split(/(?<=\.)\s/)[0], text: [g.over.t, life && life.epilogue].filter(Boolean).join(" "), by: "life", conf: gen || g.over.alt ? "approximate" : "attested", sources: life ? life.sources : [], next: [], ask: "How did the real life go?" });
    if (scenes.length > 1 && scenes[scenes.length - 2].next) scenes[scenes.length - 2].next = scenes[scenes.length - 1].id === "end" ? ["end"] : [];
    return { id: `life:${life ? life.id : (g.name || "someone").toLowerCase().replace(/\W+/g, "_")}`, title: life ? `The life of ${life.name}, as you lived it` : `${g.name}, ${g.home ? g.home.n : ""}`, kind: "life", scenes };
  }
  // Plays the chronicle as map scenes until a Director lands (WORLD.md L4).
  let replayT = 0;
  function replay() {
    clearTimeout(replayT);
    const st = story(); if (!st || !api.scene) return;
    let i = 0;
    const step = () => {
      const sc = st.scenes[i++]; if (!sc) { if (api.clearScene) api.clearScene(); return; }
      api.scene({ year: Math.round(sc.t), view: sc.view, title: sc.caption.slice(0, 220) });
      replayT = setTimeout(step, 3500);
    };
    step();
  }
  function lifeOf(g) { return g.kind === "real" ? lifeById(g.id) : null; }
  function choose(k) {
    const g = G0(), life = lifeOf(g), ch = life.chapters[g.i], c = ch.choices[k];
    g.picks.push({ i: g.i, real: !!c.real, t: c.t });
    if (!c.real) g.div++;
    for (const [s, v] of Object.entries(c.fx || {})) g.st[s] = Math.max(0, Math.min(10, (g.st[s] || 0) + v));
    logIt(g, { y: ch.y, k: c.real ? "real" : "alt", t: `${ch.title}: ${c.t}. ${c.out}` });
    g.last = { k, real: !!c.real, out: c.out, end: c.end, p: c.p, realOut: (ch.choices.find(x => x.real) || {}).out, realT: (ch.choices.find(x => x.real) || {}).t };
    g.phase = "result";
    save(); show();
  }
  function endLife(g, how) {
    g.over = how; g.phase = "over";
    if (g.kind === "real") {
      const life = lifeOf(g);
      P.done.unshift({ id: g.id, name: life.name, kind: g.kind, y0: life.born, y1: how.y, age: how.y - life.born, km: Math.round(g.km), div: g.div, n: g.picks.length, end: how.t, t: Date.now() });
    } else {
      P.done.unshift({ id: "o" + Date.now(), name: g.name, kind: g.kind, y0: g.born, y1: how.y, age: how.y - g.born, km: Math.round(g.km), role: g.role, end: how.t, place: g.home.n, t: Date.now(), as: g.as || null });
    }
    P.done = P.done.slice(0, 30);
    save(); show();
  }

  // ---------- travelling ----------
  let anim = null;
  // Up to four ways to go: fastest, land only, sea where it can, and by air once there are airliners.
  // Each route takes a few hundred milliseconds, so they are worked out one per frame and the tab redraws as they come.
  function plan(g, to, y, m, done) {
    const a = { lon: g.at.lon, lat: g.at.lat }, b = { lon: to.lon, lat: to.lat }, opts = [], token = (plan.t = (plan.t || 0) + 1);
    const prefs = ["fast", "land", "sea"];
    let waits = null;
    const next = () => {
      if (token !== plan.t) return;
      // Seasons slowed the fastest route (monsoon against you, winter seas, snow): try leaving 1 to 6 months later.
      if (!prefs.length && waits === null) { const f0 = opts[0]; waits = f0 && f0.notes.length && y < 1870 ? [1, 2, 3, 4, 5, 6] : []; }
      if (!prefs.length && waits && waits.length) {
        const k = waits.shift(), mm = ((m - 1 + k) % 12) + 1, yy = y + Math.floor((m - 1 + k) / 12);
        const r = route(a, b, yy, mm, "fast");
        if (r) { r.wait = k * 30.4; r.pref = "wait"; r.days += r.wait; const best = opts.find(o => o.pref === "wait"); const f0 = opts[0];
          if ((!best || r.days < best.days) && f0 && r.days < f0.days * 0.9) { if (best) opts.splice(opts.indexOf(best), 1); opts.push(r); done(opts, false); } }
        setTimeout(next, 30); return;
      }
      const pref = prefs.shift();
      if (!pref) { const f = flight(a, b, y); if (f) opts.push(f); done(opts, true); return; }
      const r = route(a, b, y, m, pref);
      const same = r && opts.some(o => Math.abs(o.days - r.days) < 1 && o.legs.map(l => l.mode).join() === r.legs.map(l => l.mode).join());
      const seaUse = r && r.legs.some(l => ["sail", "ocean", "steam"].includes(l.mode));
      if (r && !same && !(pref === "sea" && !seaUse)) { opts.push(r); done(opts, false); }
      setTimeout(next, 30);
    };
    setTimeout(next, 30);
  }
  function legText(r) {
    // Totals per way of travel, in the order you first use them; waiting for ships last.
    const rules = MR(), nm = id => id === "board" ? "waiting in port" : (rules.modes.find(m => m.id === id) || { n: id }).n.toLowerCase();
    const tot = new Map();
    for (const l of r.legs) { const t = tot.get(l.mode) || { mode: l.mode, km: 0, days: 0 }; t.km += l.km; t.days += l.days; tot.set(l.mode, t); }
    const list = [...tot.values()].sort((a, b) => (a.mode === "board") - (b.mode === "board"));
    return list.filter(l => l.days >= 0.5).map(l => `${nm(l.mode)} ${l.mode === "board" ? days(l.days) : Math.round(l.km).toLocaleString() + " km, " + days(l.days)}`).join(" · ");
  }
  function travel(r, after) {
    const g = G0(); g.phase = "moving"; save();
    const total = r.days + (r.meet.borderDays || 0);
    const pts = r.pts, seg = []; let L = 0;
    for (let k = 0; k < pts.length - 1; k++) { const d = km({ lon: pts[k][0], lat: pts[k][1] }, { lon: pts[k + 1][0], lat: pts[k + 1][1] }); seg.push(d); L += d; }
    const lons = pts.map(p => p[0]), lats = pts.map(p => p[1]);
    const span = Math.max(8, Math.min(140, Math.max(Math.max(...lons) - Math.min(...lons), (Math.max(...lats) - Math.min(...lats)) * 1.6) * 1.35));
    api.fly({ lon: (Math.max(...lons) + Math.min(...lons)) / 2, lat: (Math.max(...lats) + Math.min(...lats)) / 2, span }, 900);
    // a mode for each segment, for the sprite
    const segMode = [];
    for (const l of r.legs) for (let k = l.from; k < l.to; k++) segMode[k] = l.mode;
    const ms = Math.min(7000, Math.max(2500, 1200 + L / 3));
    const t0 = performance.now();
    anim = { r, pts, seg, L, t0, ms, after, p: { lon: pts[0][0], lat: pts[0][1] }, mode: r.legs[0] ? r.legs[0].mode : "foot" };
    api.redraw();
    const modeAt = frac => { let acc = 0; for (const l of r.legs) { acc += l.days; if (acc / (r.days || 1) >= frac) return l.mode; } return r.legs.length ? r.legs[r.legs.length - 1].mode : "foot"; };
    const step = now => {
      if (!anim) return;
      const f = Math.min(1, (now - t0) / ms); let want = f * L, k = 0;
      while (k < seg.length - 1 && want > seg[k]) { want -= seg[k]; k++; }
      const q = seg[k] ? Math.min(1, want / seg[k]) : 1, A = pts[k], B = pts[k + 1] || A;
      anim.p = { lon: A[0] + (B[0] - A[0]) * q, lat: A[1] + (B[1] - A[1]) * q }; anim.done = pts.slice(0, k + 1).concat([[anim.p.lon, anim.p.lat]]);
      anim.mode = modeAt(f); anim.flip = B[0] < A[0];
      moveSprite();
      const el2 = document.getElementById("lf-trip"); if (el2) el2.textContent = `Day ${Math.round(f * total)} of ${Math.round(total)}`;
      if (f < 1) requestAnimationFrame(step);
      else { const cb = anim.after; anim = null; g.km += L; g.tdays += total; g.path.push(...pts.slice(1)); save(); try { if (window.ATLAS.codex && ATLAS.codex.visit) for (let i = 0; i < pts.length; i += Math.max(1, Math.floor(pts.length / 8))) ATLAS.codex.visit(pts[i][0], pts[i][1], g.y); } catch { /* no codex */ } cb(total); }
    };
    requestAnimationFrame(step);
  }
  let spriteG = null;
  function moveSprite() {
    if (!spriteG || !anim) return;
    const g = G0(), name = anim.mode === "board" || ["sail", "ocean", "steam"].includes(anim.mode) ? seaSprite(g.y, anim.p.lon) : MODE_SPRITE[anim.mode] || "person_pilgrim";
    const key = sprite(name, g.team || "#a8342a"), sp = key && ATLAS.sprites[key];
    spriteG.datum({ lon: anim.p.lon, lat: anim.p.lat });
    if (sp) spriteG.select("image").attr("href", sp.href).attr("width", sp.w * 3).attr("height", sp.h * 3).attr("x", -(sp.ax ?? sp.w / 2) * 3).attr("y", -(sp.ay ?? sp.h) * 3)
      .attr("transform", anim.flip ? `scale(-1,1)` : null);
    const proj = lensProj; if (proj) { const xy = proj([anim.p.lon, anim.p.lat]); if (xy) spriteG.attr("transform", `translate(${xy[0]},${xy[1]}) scale(${1 / (api.k || 1)})`); }
    const tr = lensG && lensG.select("path.lf-done"); if (tr && !tr.empty() && anim.done) tr.attr("d", lensPath({ type: "LineString", coordinates: anim.done }));
  }
  let lensProj = null, lensG = null, lensPath = null;

  // ---------- ordinary lives ----------
  function region(lon, lat, y) { return D().rules.names.find(n => inBox(n.box, lon, lat) && y >= n.from && y < n.to) || D().rules.names[D().rules.names.length - 1]; }
  function nearestTown(lon, lat, y) {
    let best = null, bd = 1e9;
    if (typeof ENTRIES !== "undefined") for (const e of ENTRIES) { if (!(e.start <= y && (e.end == null || y < e.end)) || e.layer === "wonders") continue; const d = km({ lon, lat }, e); if (d < bd) { bd = d; best = e; } }
    return best && bd < 250 ? { n: best.name, lon: best.lon, lat: best.lat, d: bd } : null;
  }
  function roleOdds(y, lon, lat) {
    const r = D().rules, agri = interp(r.agri_share.rows, y), c = cls(cellOf(lon, lat)), coast = [1, -1, COLS, -COLS].some(d => isWater(cellOf(lon, lat) + d));
    const ind = y >= 1780 ? Math.min(0.3, (y - 1780) / 400) : 0, office = y >= 1850 ? Math.min(0.3, (y - 1850) / 500) : 0;
    const out = [];
    const herd = [4, 9, 10, 11].includes(c) ? 0.5 : c === 13 || c === 14 ? 0.15 : 0.05;
    for (const ro of r.roles) {
      if (ro.from && y < ro.from) continue;
      let w = ro.w === "agri" ? agri * (ro.id === "herder" ? herd : 1 - herd) : ro.w === "industry" ? ind : ro.w === "office" ? office : ro.w;
      if (ro.coast && !coast) w *= 0.2;
      out.push([ro, w]);
    }
    const s = out.reduce((a, [, w]) => a + w, 0);
    return out.map(([ro, w]) => [ro, w / s]).sort((a, b) => b[1] - a[1]);
  }
  function startOrdinary(at, y, sex, roleId, as) {
    const odds = roleOdds(y, at.lon, at.lat), rules = D().rules;
    let role = roleId ? odds.find(([r]) => r.id === roleId) : null;
    if (!role) { let x = rnd(); role = odds.find(([, w]) => (x -= w) <= 0) || odds[0]; }
    const reg = region(at.lon, at.lat, y), name = as ? as.name : pickOne(reg[sex === "f" ? "f" : "m"]);
    const town = nearestTown(at.lon, at.lat, y) || { n: `${Math.abs(at.lat).toFixed(1)}°${at.lat >= 0 ? "N" : "S"} ${Math.abs(at.lon).toFixed(1)}°${at.lon >= 0 ? "E" : "W"}`, lon: at.lon, lat: at.lat };
    const age0 = 16;
    P.cur = { kind: "ordinary", name, sex, role: role[0].id, odds: Math.round(role[1] * 1000) / 1000, born: y - age0, y, m: 4, at: { n: town.n, lon: town.lon, lat: town.lat }, home: { n: town.n, lon: town.lon, lat: town.lat },
      st: { health: 5 + Math.floor(rnd() * 3), wealth: rules.start_wealth[role[0].id] || 20, learning: ["scholar", "noble", "clerk"].includes(role[0].id) ? 4 : 1, renown: role[0].id === "noble" ? 3 : 0 },
      spouse: null, kids: [], log: [{ y, k: "start", t: `Born ${fy(y - age0)} near ${town.n}. At ${age0} you are a ${role[0].n.toLowerCase()}, as were about ${pct(role[1])} of people here and now.` }],
      path: [[town.lon, town.lat]], km: 0, tdays: 0, ruler: polity(town.lon, town.lat, y), phase: "year", news: null, team: pickOne(["#a8342a", "#3a5aa8", "#2f7a5a", "#c89a2a", "#7a4a8a"]), as: as || null };
    P.cur.news = yearNews(P.cur);
    save(); show(true);
  }
  function hazard(g, y, age) {
    const lt = D().rules.life_table.rows;
    const A = interp(lt, y, 1), B = interp(lt, y, 2), Gm = interp(lt, y, 3);
    let h = A + B * Math.exp(Gm * age);
    h *= Math.exp((5 - g.st.health) * 0.12);
    if (g.st.wealth > 1000) h *= 0.8; else if (g.st.wealth < 5) h *= 1.25;
    return 1 - Math.exp(-h);
  }
  function yearNews(g) {
    const items = around(g.at, g.y, { battleKm: 200, pplKm: 300 });
    const w = polity(g.at.lon, g.at.lat, g.y);
    if (w && g.ruler && w !== g.ruler) items.unshift({ k: "ruler", t: `You now live under ${w}`, why: `Until last year this land was ruled by ${g.ruler}.` });
    g.ruler = w || g.ruler;
    return items.slice(0, 7);
  }
  function choicesFor(g) {
    const n = g.news || [], role = D().rules.roles.find(r => r.id === g.role), age = g.y - g.born, out = [];
    out.push({ id: "work", t: `Work as a ${role.n.toLowerCase()}`, why: role.what });
    if (n.some(x => x.k === "plague")) out.push({ id: "flee", t: "Flee the plague", why: "Leave town for the countryside until it passes. Costs money, saves lives." });
    if (n.some(x => x.k === "battle" && x.d < 150) && g.role !== "soldier") out.push({ id: "enlist", t: "Join the fighting", why: "Soldiers are wanted. Pay and plunder, or death." });
    const tr = n.find(x => x.k === "trade"); if (tr && ["merchant", "artisan", "sailor"].includes(g.role)) out.push({ id: "venture", t: `Invest in a venture on the ${tr.route.name}`, why: "Risk a third of your wealth for a share of the profits.", route: tr.route });
    const pp = n.find(x => x.k === "person"); if (pp) out.push({ id: "seek", t: `Try to meet ${pp.p.name}`, why: pp.why, p: pp.p });
    if (!g.spouse && age >= 15 && age < 50) out.push({ id: "marry", t: "Marry", why: "Most people married. A spouse, a household, children, and their risks." });
    out.push({ id: "learn", t: "Learn something: letters, a craft, a language", why: "Costs time and money; opens doors." });
    out.push({ id: "travel", t: "Go somewhere", why: "Pick a destination on the map or from the list. Most people never travelled far." });
    out.push({ id: "quiet", t: "Live five quiet years", why: "Work and get by; stop if something big happens." });
    return out;
  }
  function roll(g, act) {
    const rules = D().rules, role = rules.roles.find(r => r.id === g.role), lines = [];
    const age = g.y - g.born, n = g.news || [];
    let die = hazard(g, g.y, age), cause = "illness";
    const pl = n.some(x => x.k === "plague");
    if (pl) { const [a, b, p] = rules.plague.black_death; let q = g.y >= a && g.y <= b ? p : rules.plague.later; if (act.id === "flee") q *= rules.plague.flee; if (g.st.wealth > 1000) q *= rules.plague.rich; die = 1 - (1 - die) * (1 - q); cause = "plague"; }
    if (n.some(x => x.k === "famine")) { die = 1 - (1 - die) * (1 - rules.famine.risk * (g.st.wealth > 200 ? 0.3 : 1)); if (cause !== "plague") cause = "the famine"; }
    const fight = act.id === "enlist" || (g.role === "soldier" && n.some(x => x.k === "battle"));
    if (fight) { die = 1 - (1 - die) * (1 - rules.battle.soldier); cause = "battle"; }
    else if (n.some(x => x.k === "battle" && x.d < rules.battle.km)) die = 1 - (1 - die) * (1 - rules.battle.risk);
    if (n.some(x => x.k === "fall" && x.t.includes(g.at.n))) { die = 1 - (1 - die) * (1 - rules.battle.sack); cause = "the sack of your city"; g.st.wealth = Math.round(g.st.wealth * 0.3); lines.push("Your city falls. Most of what you own is lost."); }
    const pay = role.pay * (1 + g.st.learning * 0.05) * (0.6 + rnd() * 0.8);
    if (act.id === "work" || act.id === "quiet") { g.st.wealth += Math.round(pay); lines.push(`You earn and save about ${Math.round(pay)} day-wages.`); }
    if (act.id === "flee") { g.st.wealth = Math.max(0, g.st.wealth - 15); lines.push("You shut up the house and go to relatives in the country, at a cost."); }
    if (act.id === "enlist") { const loot = rnd() < 0.3 ? Math.round(30 + rnd() * 120) : 0; g.st.wealth += 10 + loot; g.st.renown += 1; lines.push(loot ? `You fight, and come away with plunder worth ${loot} day-wages.` : "You march, wait, and fight. Pay is late."); }
    if (act.id === "venture") { const stake = Math.round(g.st.wealth / 3), win = rnd() < 0.6; g.st.wealth += win ? Math.round(stake * (0.4 + rnd())) : -stake; lines.push(win ? `The goods arrive and sell well. Your share pays ${Math.round(stake * 0.7)} day-wages or so.` : "The caravan is robbed, or the ship goes down. Your stake is gone."); }
    if (act.id === "seek") { const ok = rnd() < Math.min(0.7, 0.15 + g.st.renown * 0.06 + g.st.learning * 0.04); if (ok) { g.st.renown += 1; g.st.learning += 1; lines.push(`You manage to meet ${act.p.name}. It is a story you tell for the rest of your life.`); g.met = [...(g.met || []), act.p.name]; } else lines.push(`You never get close to ${act.p.name}. People like you rarely did.`); }
    if (act.id === "learn") { g.st.learning = Math.min(10, g.st.learning + 1); g.st.wealth = Math.max(0, g.st.wealth - 10); lines.push("You study. It costs you, but you know more."); }
    if (act.id === "marry") { if (rnd() < 0.8) { const reg = region(g.at.lon, g.at.lat, g.y); g.spouse = { n: pickOne(reg[g.sex === "f" ? "m" : "f"]), y: g.y }; lines.push(`You marry ${g.spouse.n}.`); } else lines.push("A match is arranged, then falls through."); }
    // children
    if (g.spouse && age < 45 && rnd() < (g.y < 1900 ? 0.3 : g.y < 1970 ? 0.2 : 0.1)) {
      const reg = region(g.at.lon, g.at.lat, g.y), surv = interp(rules.life_table.child_survival, g.y), dies = rnd() > surv;
      const kid = { n: pickOne(reg[rnd() < 0.5 ? "m" : "f"]), y: g.y, d: dies ? g.y + Math.floor(rnd() * 8) : null };
      g.kids.push(kid); lines.push(`A child is born: ${kid.n}.`);
      if (g.sex === "f") { const mat = interp(rules.life_table.maternal, g.y); if (rnd() < mat) { die = 1; cause = "childbirth"; } }
    }
    for (const k of g.kids) if (k.d === g.y) lines.push(`Your child ${k.n} dies, aged ${g.y - k.y}. About ${pct(1 - interp(rules.life_table.child_survival, g.y))} of children here did not reach 15.`);
    g.st.wealth = Math.max(0, Math.round(g.st.wealth));
    if (rnd() < 0.08) { g.st.health = Math.max(0, g.st.health - 1); lines.push("A bad winter fever leaves you weaker."); }
    if (age > 40 && rnd() < 0.15) g.st.health = Math.max(0, g.st.health - 1);
    const dead = rnd() < die;
    return { lines, die, dead, cause };
  }
  function liveYear(actId, extra) {
    const g = G0(); if (!g || g.phase !== "year") return;
    const act = choicesFor(g).find(c => c.id === actId) || { id: actId, ...extra };
    if (act.id === "travel") { g.phase = "pick"; save(); show(); return; }
    let years = act.id === "quiet" ? 5 : 1, out = [];
    for (let k = 0; k < years; k++) {
      const r = roll(g, k ? { id: "work" } : act);
      logIt(g, { y: g.y, k: act.id, t: r.lines.join(" ") || "A year passes." });
      out.push({ y: g.y, ...r });
      if (r.dead) { endLife(g, { y: g.y, t: `You die in ${fy(g.y)} at ${g.y - g.born}, of ${r.cause}. That year your chance of dying was about ${pct(r.die)}.` }); return; }
      g.y++; g.news = yearNews(g);
      if (k < years - 1 && g.news.some(x => ["plague", "famine", "battle", "fall", "ruler"].includes(x.k))) { out.push({ y: g.y, lines: ["Something happens. You stop to deal with it."] }); break; }
    }
    g.lastYears = out; save(); api.setYear(g.y, true, 500); show();
  }

  // ---------- anyone: Claude drafts a life from the record ----------
  let sample = null, sampleReady = null, drafting = null;
  function connect() { if (!sampleReady) sampleReady = (async () => { try { sample = window.claude ? await window.claude.use("sample") : null; } catch { sample = null; } })(); return sampleReady; }
  async function draft(name) {
    const p = PPL().find(x => x.name.toLowerCase() === name.toLowerCase()) || null;
    const id = "ai_" + name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40);
    if (P.drafts[id]) { startReal(P.drafts[id]); return; }
    await connect();
    if (!sample) { drafting = { name, err: "Drafting a life needs this page open in Claude. You can still live as them: an ordinary life in their birthplace and year, compared with their real one at the end.", p }; show(); return; }
    const ctxLines = [];
    if (p) {
      ctxLines.push(`Atlas record: ${p.name}, ${p.occ}, born ${p.b} at ${p.place} (${p.lat}, ${p.lon}), died ${p.d ?? "?"} at ${p.dplace} (${p.dlat}, ${p.dlon}).`);
      for (const y of [p.b + 20, Math.round((p.b + (p.d ?? p.b + 60)) / 2), (p.d ?? p.b + 60) - 2]) for (const it of around({ lon: p.lon, lat: p.lat }, y).slice(0, 3)) ctxLines.push(`${y}: ${it.t}`);
    }
    const prompt = `You write chapters for "Live a life", a history game on a world map. The player plays ${name}, a real person, and faces the real decisions of their life, with plausible alternatives.

${ctxLines.join("\n")}

Return ONLY one JSON object, no prose, in this exact shape:
{"name": "...", "born": year, "died": year, "role": "short role", "sprite": one of ["person_ruler","person_priest","person_monk","person_merchant","person_scholar","person_philosopher","person_farmer","person_sailor","person_explorer","person_pilgrim","army_knight","army_legion","army_musket","army_rifleman","army_samurai","army_horse_archer","ship_galleon","ship_steamer"], "intro": "2-3 sentences in the second person, setting the scene when the first chapter starts",
 "sources": [{"cite": "...", "url": "https://en.wikipedia.org/wiki/..."}],
 "chapters": [{"y": year, "m": month 1-12, "at": {"n": "place name", "lon": number, "lat": number}, "title": "3-5 words", "text": "2-3 sentences: the situation and the decision, in the second person",
   "took": "optional: how long the real journey from the previous chapter's place took, if known",
   "choices": [{"t": "what they really did", "real": true, "out": "what happened next, 1-2 sentences"}, {"t": "a real alternative they faced", "out": "what would plausibly have followed", "end": "optional one-line alternative ending if this choice ends their story", "p": plausibility 0 to 1}]}],
 "epilogue": "2 sentences on how the life ended and what it left"}
Rules: 5 to 8 chapters in date order, each at a real place with correct coordinates, each a decision the person really faced. Years negative for BCE. Mark exactly one choice per chapter real:true. Only state facts you are confident of; say "probably" or "accounts differ" where historians disagree. Plain words, no em dashes.`;
    drafting = { name, p, busy: true }; show();
    try {
      const res = await sample([{ role: "user", content: prompt }], { cache: false });
      const txt = String(res.text || ""), j = txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1), life = JSON.parse(j);
      if (!Array.isArray(life.chapters) || !life.chapters.length) throw new Error("no chapters");
      life.chapters = life.chapters.filter(c => c && c.at && isFinite(c.at.lon) && isFinite(c.at.lat) && Array.isArray(c.choices) && c.choices.length).map(c => ({ ...c, y: Math.round(+c.y), m: Math.max(1, Math.min(12, Math.round(+c.m || 1))) }));
      if (!life.chapters.length) throw new Error("no usable chapters");
      for (const c of life.chapters) if (!c.choices.some(x => x.real)) c.choices[0].real = true;
      Object.assign(life, { id, ai: true, pid: p ? p.name : null, team: "#7a4a8a" });
      P.drafts[id] = life; save(); drafting = null; startReal(life);
    } catch (e) {
      drafting = { name, p, err: e && e.code === "not_granted" ? "Claude access was not allowed for this page." : "The draft did not come back in a usable shape. Try again, or live as them as an ordinary person." }; show();
    }
  }

  // ---------- drawing on the map ----------
  ATLAS.lens({
    id: "life", name: "Your life", family: "peoples", color: "#d0602a", on: false, guide: [],
    key: [["line", "Your road so far"], ["sprite", "You, and how you travel"], ["dot", "Where your next chapter happens"]],
    draw(ctx) {
      lensProj = ctx.projection; lensG = ctx.g; lensPath = ctx.path;
      const g = G0(); if (!g) { ctx.g.selectAll(".lf-me").remove(); return; }
      // Lines go to the page's canvas mark layer: your road solid, the record dashed green, route options dashed.
      if (g.real && g.kind === "real" && (g.showReal || g.phase === "over")) ctx.paths([{ id: "real", pts: g.real }], { cls: "ghost", color: "#2f7a5a", title: () => "The real route, from the record" });
      if (g.plan && g.phase === "travel") ctx.paths(g.plan.map((r, i) => ({ id: "p" + i, pts: r.pts, sel: i === (g.sel || 0) })), { key: r => r.id, title: () => "A possible route" })
        .classed("ghost", r => !(r.x || r).sel).style("--c", r => (r.x || r).sel ? "#d0602a" : "#8a7a6a");
      ctx.paths([{ id: "road", pts: g.path }], { color: "#d0602a", title: () => "Your road so far" }).style("stroke-width", 3);
      const life = lifeOf(g), next = life && life.chapters[g.i + 1];
      const pins = [];
      if (next && g.phase !== "over") pins.push({ id: "next", lon: next.at.lon, lat: next.at.lat, n: next.at.n });
      if (g.dest && g.kind === "ordinary" && g.phase === "travel") pins.push({ id: "next", lon: g.dest.lon, lat: g.dest.lat, n: g.dest.n });
      ctx.pins(pins, { key: p => p.id, shape: "diamond", color: "#d0602a", label: p => p.n, title: p => `Next: ${p.n}`, always: true });
      let me = ctx.g.select("g.lf-me");
      if (me.empty()) { me = ctx.g.append("g").attr("class", "pt lf-me always"); me.append("image").style("image-rendering", "pixelated"); }
      spriteG = me;
      const at = anim ? anim.p : g.at;
      const name = g.kind === "real" ? (life && life.sprite) || "person_pilgrim" : (D().rules.roles.find(r => r.id === g.role) || {}).sprite || "person_farmer";
      const key = sprite(anim ? MODE_SPRITE[anim.mode] || name : name, g.team || "#a8342a"), sp = key && ATLAS.sprites[key];
      me.datum({ lon: at.lon, lat: at.lat });
      if (sp) me.select("image").attr("href", sp.href).attr("width", sp.w * 3).attr("height", sp.h * 3).attr("x", -(sp.ax ?? sp.w / 2) * 3).attr("y", -(sp.ay ?? sp.h) * 3);
      const xy = ctx.projection([at.lon, at.lat]); if (xy) me.attr("transform", `translate(${xy[0]},${xy[1]}) scale(${1 / ctx.k})`);
      ctx.g.selectAll("path.lf-done").data(anim ? [anim.done || []] : []).join("path").attr("class", "lf-done").attr("d", d => d.length > 1 ? ctx.path({ type: "LineString", coordinates: d }) : null);
    },
    here(ctx, at) {
      const g = G0();
      if (pickWait) { const f = pickWait; pickWait = null; setTimeout(() => { api.setTab("life"); f(at); }, 0); return [{ title: "Chosen for your life", why: "Back to the Live tab" }]; }
      if (g && g.phase === "pick") { setTimeout(() => { api.setTab("life"); chooseDest({ n: (nearestTown(at.lon, at.lat, g.y) || {}).n || "this spot", lon: at.lon, lat: at.lat }); }, 0); return [{ title: "Your destination", why: "Back to the Live tab to plan the trip" }]; }
      return [];
    },
  });
  let pickWait = null;
  const css = document.createElement("style");
  css.textContent = `
.lf { display: grid; gap: 12px; }
.lf h2 { font-family: var(--fell); font-size: 22px; margin: 0; }
.lf .sub { color: var(--ink-soft); font-size: 13.5px; margin: 0; }
.lf .cards { display: grid; gap: 8px; }
.lf .life { text-align: left; border: 1px solid var(--rule); background: var(--card); border-radius: 6px; padding: 9px 11px; cursor: pointer; display: grid; grid-template-columns: 40px 1fr auto; gap: 2px 10px; align-items: center; }
.lf .life:hover { border-color: var(--ink-soft); }
.lf .life img { grid-row: span 2; width: 36px; height: 36px; image-rendering: pixelated; object-fit: contain; }
.lf .life b { font-family: var(--fell); font-size: 16px; } .lf .life span { font-size: 12.5px; color: var(--ink-soft); }
.lf .life .tg { grid-row: span 2; font-family: var(--mono); font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-soft); }
.lf .hud { position: sticky; top: 36px; z-index: 2; background: var(--paper); border-bottom: 1px solid var(--rule); padding: 8px 0; display: grid; grid-template-columns: 44px 1fr auto; gap: 2px 10px; align-items: center; }
.lf .hud img { grid-row: span 2; width: 42px; height: 42px; image-rendering: pixelated; object-fit: contain; }
.lf .hud b { font-family: var(--fell); font-size: 17px; } .lf .hud .meta { font-size: 12.5px; color: var(--ink-soft); }
.lf .stats { display: flex; gap: 4px; flex-wrap: wrap; grid-column: 2 / 4; }
.lf .stat { font-family: var(--mono); font-size: 10.5px; border: 1px solid var(--rule); border-radius: 3px; padding: 1px 6px; }
.lf .ch { border: 1px solid var(--rule); border-left: 4px solid #d0602a; background: var(--card); border-radius: 4px; padding: 11px 13px; display: grid; gap: 8px; }
.lf .ch .k { font-family: var(--mono); font-size: 10.5px; text-transform: uppercase; letter-spacing: .1em; color: #d0602a; }
.lf .ch h3 { font-family: var(--fell); font-size: 19px; margin: 0; }
.lf .ch p { margin: 0; font-size: 14.5px; line-height: 1.45; }
.lf .opt { all: unset; box-sizing: border-box; cursor: pointer; border: 1.5px solid var(--rule); border-radius: 5px; padding: 8px 11px; font-size: 14.5px; line-height: 1.35; display: grid; gap: 2px; background: var(--paper); }
.lf .opt:hover, .lf .opt:focus-visible { border-color: #d0602a; }
.lf .opt small { color: var(--ink-soft); font-size: 12.5px; }
.lf .opt.sel { border-color: #d0602a; background: color-mix(in srgb, #d0602a 8%, var(--paper)); }
.lf .go { all: unset; cursor: pointer; background: #d0602a; color: #fff; border-radius: 5px; padding: 9px 14px; font-size: 15px; text-align: center; font-weight: 600; }
.lf .go:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
.lf .ghost { all: unset; cursor: pointer; color: var(--ink-soft); font-size: 13px; text-decoration: underline; }
.lf .badge2 { display: inline-block; font-family: var(--mono); font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; border-radius: 3px; padding: 1px 6px; color: #fff; background: #2f7a5a; }
.lf .badge2.alt { background: #7a4a8a; } .lf .badge2.ai { background: #8a6418; }
.lf .news { list-style: none; margin: 0; padding: 0; display: grid; gap: 5px; font-size: 13.5px; }
.lf .news li { border-left: 3px solid var(--rule); padding-left: 8px; } .lf .news li b { font-weight: 600; }
.lf .news li.plague, .lf .news li.epidemic { border-color: #8a2a2a; } .lf .news li.famine { border-color: #a8742a; } .lf .news li.battle, .lf .news li.fall { border-color: #444; }
.lf .news li.person { border-color: #3a5aa8; } .lf .news li.trade { border-color: #2f7a5a; } .lf .news li.ruler { border-color: #7a4a8a; }
.lf .src { font-size: 11.5px; color: var(--ink-soft); }
.lf .cmp { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13.5px; }
.lf .cmp > div { border: 1px solid var(--rule); border-radius: 4px; padding: 7px 9px; } .lf .cmp b { display: block; font-family: var(--mono); font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-soft); font-weight: 500; }
.lf input[type=text], .lf input[type=number], .lf select { border: 1px solid var(--rule); background: var(--card); padding: 6px 9px; border-radius: 4px; font-size: 14px; font-family: inherit; }
.lf .row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.lf .log { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; font-size: 13px; max-height: 320px; overflow: auto; }
.lf .log li span { font-family: var(--mono); font-size: 11px; color: var(--ink-soft); margin-right: 6px; }
path.lf-done { stroke: #fff4d6; stroke-width: 4px; fill: none; stroke-linecap: round; vector-effect: non-scaling-stroke; opacity: .9; }
`;
  document.head.appendChild(css);

  // ---------- the tab ----------
  const statLine = st => `<span class="stat" title="Health">♥ ${st.health}</span><span class="stat" title="Wealth in day-wages">◈ ${Math.round(st.wealth).toLocaleString()}</span><span class="stat" title="Learning">✎ ${st.learning}</span><span class="stat" title="Renown">★ ${st.renown}</span>`;
  const img = (name, team) => { const k = sprite(name, team || "#a8342a"); return k ? `<img src="${ATLAS.sprites[k].href}" alt="">` : ""; };
  function home() {
    const L = D().lives, y = api.year, v = api.view() || { lon: 30, lat: 35 };
    const town = nearestTown(v.lon, v.lat, y);
    const g = G0();
    return `<div class="lf">
      <div><p class="kick">Live a life</p><h2>Step into someone's life</h2><p class="sub">Face their real choices, or choose differently and see what follows. The plague, wars, borders, roads and seasons come from the Atlas's data for that year and place.</p></div>
      ${g && g.phase !== "over" ? `<button class="go" data-a="resume">Carry on as ${esc(g.kind === "real" ? (lifeOf(g) || {}).name : g.name)}, ${fy(g.y)}</button>` : ""}
      <div class="sec"><h3>Real lives, real choices</h3><div class="cards">${L.map(l => `<button class="life" data-a="real" data-id="${esc(l.id)}">${img(l.sprite, l.team)}<b>${esc(l.name)}</b><span class="tg">${l.chapters.length} choices</span><span>${esc(l.role)} · ${fy(l.born)}–${fy(l.died)}</span></button>`).join("")}</div></div>
      <div class="sec"><h3>Anyone who did anything</h3>
        <form class="row" id="lf-any"><input type="text" id="lf-name" list="lf-ppl" placeholder="Cleopatra, Napoleon, Ada Lovelace…" style="flex:1;min-width:0" autocomplete="off"><button class="btn" type="submit">Live it</button></form>
        <datalist id="lf-ppl">${PPL().slice(0, 1500).map(p => `<option value="${esc(p.name)}">`).join("")}</datalist>
        ${drafting ? `<p class="sub">${drafting.busy ? `Claude is drafting the life of ${esc(drafting.name)}…` : esc(drafting.err)}${drafting.p && !drafting.busy ? ` <button class="ghost" data-a="as" data-n="${esc(drafting.p.name)}">Live as ${esc(drafting.p.name)} anyway</button>` : ""}</p>` : `<p class="sub">Claude drafts their turning points from what is known and the Atlas's record; drafts are marked as unchecked.</p>`}
        ${Object.values(P.drafts).length ? `<div class="cards">${Object.values(P.drafts).slice(-4).map(l => `<button class="life" data-a="real" data-id="${esc(l.id)}">${img(l.sprite || "person_explorer", l.team)}<b>${esc(l.name)}</b><span class="tg">draft</span><span>${esc(l.role || "")} · ${fy(l.born)}–${fy(l.died)}</span></button>`).join("")}</div>` : ""}
      </div>
      <div class="sec"><h3>An ordinary life</h3>
        <p class="sub">Be born where the map is now${town ? `, near <b>${esc(town.n)}</b>,` : ""} and come of age in <b>${esc(fy(y))}</b>. Most people farmed, few travelled, and half of all children died young. Move the map or the year to change it.</p>
        <div class="row"><select id="lf-sex"><option value="f">a woman</option><option value="m">a man</option></select>
        <button class="go" data-a="ordinary">Be born</button><button class="ghost" data-a="pickplace">or click a spot on the map</button></div>
      </div>
      ${P.done.length ? `<div class="sec"><h3>Lives you have lived</h3><ul class="log">${P.done.slice(0, 8).map(d => `<li><span>${fy(d.y0)}–${fy(d.y1)}</span>${esc(d.name)}${d.role ? `, ${esc(d.role)}` : ""}: ${esc(d.end || "")}${d.kind === "real" ? ` ${d.div ? `(${d.div} of ${d.n} choices your own)` : "(true to the record)"}` : ""}</li>`).join("")}</ul></div>` : ""}
      <p class="src">Rules, rates and sources: data/life/rules.json. Money is counted in day-wages, so lives in different centuries compare.</p>
    </div>`;
  }
  function hud(g) {
    const life = lifeOf(g), age = g.y - (g.kind === "real" ? life.born : g.born);
    const nm = g.kind === "real" ? life.name : g.name;
    const role = g.kind === "real" ? life.role : (D().rules.roles.find(r => r.id === g.role) || {}).n;
    const sp = g.kind === "real" ? life.sprite : (D().rules.roles.find(r => r.id === g.role) || {}).sprite;
    return `<div class="hud">${img(sp || "person_pilgrim", g.team)}<b>${esc(nm)}${life && life.ai ? ' <span class="badge2 ai">Claude draft</span>' : ""}</b><button class="ghost" data-a="quit">Leave</button>
      <span class="meta">${esc(role || "")} · age ${age} · ${MONTHS[(g.m || 1) - 1]} ${fy(g.y)} · ${esc(g.at.n)}${g.kind === "real" ? ` · ${g.div ? `${g.div} choices your own` : "true to the record"}` : ""}</span>
      <div class="stats">${statLine(g.st)}<span class="stat" title="Distance travelled">↝ ${Math.round(g.km).toLocaleString()} km</span></div></div>`;
  }
  function newsList(items) {
    if (!items.length) return `<p class="sub">Nothing in the Atlas's records touches this place this year.</p>`;
    return `<ul class="news">${items.map(x => `<li class="${esc(x.k)}"><b>${esc(x.t)}</b>${x.why ? ` · ${esc(x.why)}` : ""}${x.src ? `<div class="src">${esc(x.src)}</div>` : ""}</li>`).join("")}</ul>`;
  }
  function realView(g) {
    const life = lifeOf(g); if (!life) { P.cur = null; save(); return home(); }
    const ch = life.chapters[g.i];
    let body = "";
    if (g.phase === "choose") {
      const intro = g.i === 0 ? `<p>${esc(life.intro)}</p>` : "";
      const near = around(ch.at, ch.y, { battleKm: 250, pplKm: 250 }).filter(x => x.k !== "person" || !life.pid || x.p.name !== life.pid).slice(0, 4);
      body = `<div class="ch"><span class="k">Chapter ${g.i + 1} of ${life.chapters.length} · ${MONTHS[(ch.m || 1) - 1]} ${fy(ch.y)} · ${esc(ch.at.n)}</span><h3>${esc(ch.title)}</h3>${intro}<p>${esc(ch.text)}</p>
        ${ch.choices.map((c, k) => `<button class="opt" data-a="pick" data-k="${k}">${esc(c.t)}</button>`).join("")}</div>
        <div class="sec"><h3>Around you in ${esc(fy(ch.y))}</h3>${newsList(near)}</div>`;
    } else if (g.phase === "result") {
      const L = g.last, next = life.chapters[g.i + 1];
      body = `<div class="ch"><span class="k">${esc(ch.title)} · ${esc(fy(ch.y))}</span>
        <p>${L.real ? '<span class="badge2">What really happened</span>' : '<span class="badge2 alt">Your own path</span>'}</p><p>${esc(L.out)}</p>
        ${!L.real ? `<p class="sub"><b>In the record:</b> ${esc(L.realT)}. ${esc(L.realOut)}</p>` : ""}
        ${L.end ? `<p><b>If the story ended here:</b> ${esc(L.end)}${L.p != null ? ` <span class="sub">(plausibility ${Math.round(L.p * 100)}%)</span>` : ""}</p>
          <button class="go" data-a="altend">End the life this way</button><button class="opt" data-a="next">Rejoin the record and go on${next ? ` to ${esc(next.at.n)}` : ""}</button>`
          : next ? `<button class="go" data-a="next">${km(ch.at, next.at) > 30 ? `Travel to ${esc(next.at.n)} →` : `Go on to ${esc(fy(next.y))} →`}</button>` : `<button class="go" data-a="finish">See how your life ends</button>`}</div>`;
    } else if (g.phase === "travel") body = travelView(g, life.chapters[g.i + 1].at, true);
    else if (g.phase === "moving") body = `<div class="ch"><span class="k">On the road</span><p id="lf-trip">Setting out…</p></div>`;
    else if (g.phase === "arrived") body = arrivedView(g, life);
    return `<div class="lf">${hud(g)}${body}</div>`;
  }
  function travelView(g, to, isReal) {
    const r = g.plan || [], sel = g.sel || 0, life = lifeOf(g), next = life && life.chapters[g.i + 1];
    if (!r.length && g.planning) return `<div class="ch"><span class="k">${esc(g.at.n)} to ${esc(to.n)}</span><p>Working out the roads, sea lanes and seasons of ${esc(fy(g.ty))}…</p></div>`;
    if (!r.length) return `<div class="ch"><p>No route found from here to ${esc(to.n)} with what ${esc(fy(g.ty))} had. </p><button class="go" data-a="jump">Skip ahead${isReal ? "" : " anyway"}</button></div>`;
    const rules = MR(), notes = [...new Set(r[sel].notes)].map(id => rules.seasons.find(s => s.id === id)).filter(Boolean);
    const lab = x => x.pref === "air" ? "Fly" : x.pref === "land" ? "Only by land" : x.pref === "sea" ? "By sea where you can" : x.pref === "wait" ? `Wait ${Math.round(x.wait / 30.4)} month${x.wait > 40 ? "s" : ""} for the season, then go` : "Leave now, fastest";
    return `<div class="ch"><span class="k">${MONTHS[(g.tm || 1) - 1]} ${esc(fy(g.ty))} · ${esc(g.at.n)} to ${esc(to.n)}</span><h3>Plan the journey</h3>
      ${r.map((x, i) => `<button class="opt${i === sel ? " sel" : ""}" data-a="route" data-i="${i}"><span><b>${lab(x)}</b>: ${days(x.days + (x.meet.borderDays || 0))}, about ${Math.round(x.cost + (x.meet.toll || 0)).toLocaleString()} day-wages</span>
        <small>${x.wait ? `waiting at home ${days(x.wait)} · ` : ""}${esc(legText(x))}</small><small>${x.meet.borders.length > 1 ? `${x.meet.borders.length - 1} borders (${esc(x.meet.borders.map(b => b.n).slice(0, 5).join(" → "))}) · ` : ""}${x.meet.war.length ? `war on the way (${esc(x.meet.war.slice(0, 2).map(w => w.name).join(", "))}) · ` : ""}${x.meet.plague.length ? "plague on the road · " : ""}risk of dying on the way about ${pct(x.meet.risk)}</small></button>`).join("")}
      ${notes.length ? `<p class="sub">${notes.map(s => `<b>${esc(s.n)}:</b> ${esc(s.why)}`).join(" ")}</p>` : ""}
      ${isReal && next && next.took ? `<p class="sub"><b>The record:</b> ${esc(next.took)}</p>` : ""}
      ${g.planning ? `<p class="sub">Looking for other ways to go…</p>` : ""}<button class="go" data-a="setout">Set out</button>
      <p class="src">Routes run on a half-degree terrain grid with ${esc(fy(g.ty))}'s ways of travel, ports, canals and seasons. Speeds: ${esc(rules.modes.filter(m => modesFor(g.ty).includes(m)).map(m => `${m.n.toLowerCase()} ${m.kmd} km/day`).join(", "))}.</p></div>`;
  }
  function arrivedView(g, life) {
    const tr = g.trip, next = life ? life.chapters[g.i + 1] : null;
    let cmp = "";
    if (life && next) {
      cmp = `<div class="cmp"><div><b>Your trip</b>${days(tr.days)}, ${Math.round(tr.km).toLocaleString()} km${tr.event ? `<br>${esc(tr.event)}` : ""}</div><div><b>The record</b>${next.took ? esc(next.took) : next.via ? "The real route is drawn dashed on the map." : "No travel time recorded."}${next.days ? `<br>About ${days(next.days)}, so the Atlas is ${tr.days > next.days * 1.25 ? "slower than the real traveller (they knew the roads, or waited less)" : tr.days < next.days * 0.75 ? "faster (they stopped, studied, waited out wars and seasons)" : "close"}` : ""}</div></div>`;
    }
    return `<div class="ch"><span class="k">Arrived · ${MONTHS[(g.m || 1) - 1]} ${esc(fy(g.y))}</span><h3>${esc(g.at.n)}</h3>${cmp || (tr ? `<p>${days(tr.days)} on the road, ${Math.round(tr.km).toLocaleString()} km.${tr.event ? " " + esc(tr.event) : ""}</p>` : "")}
      <button class="go" data-a="${life ? "chapter" : "settle"}">${life ? "Go on" : "Settle here"}</button></div>`;
  }
  function ordinaryView(g) {
    const role = D().rules.roles.find(r => r.id === g.role);
    let body = "";
    if (g.phase === "year") {
      const age = g.y - g.born, q = hazard(g, g.y, age);
      const recent = (g.lastYears || []).map(r => `<li><span>${fy(r.y)}</span>${esc((r.lines || []).join(" ") || "A year passes.")}</li>`).join("");
      body = `${recent ? `<ul class="log">${recent}</ul>` : `<div class="ch"><p>${esc(g.log[0].t)} ${esc(role.what)}</p>${g.as ? `<p class="sub">You are living as ${esc(g.as.name)} might have, had they been ordinary. At the end you will see their real life beside yours.</p>` : ""}</div>`}
        <div class="sec"><h3>${esc(fy(g.y))} near ${esc(g.at.n)}${g.ruler ? `, under ${esc(g.ruler)}` : ""}</h3>${newsList(g.news || [])}</div>
        <div class="ch"><span class="k">Age ${age} · chance of dying this year about ${pct(q)} before anything else</span><h3>What do you do this year?</h3>
        ${choicesFor(g).map(c => `<button class="opt" data-a="act" data-id="${c.id}">${esc(c.t)}<small>${esc(c.why || "")}</small></button>`).join("")}</div>`;
    } else if (g.phase === "pick") {
      const y = g.y, towns = typeof ENTRIES !== "undefined" ? ENTRIES.filter(e => e.layer !== "wonders" && e.start <= y && (e.end == null || y < e.end)).map(e => ({ n: e.name, lon: e.lon, lat: e.lat, d: km(g.at, e) })).filter(e => e.d > 40 && e.d < 4000).sort((a, b) => a.d - b.d) : [];
      body = `<div class="ch"><h3>Where to?</h3><p class="sub">Click anywhere on the map, or pick a city that stands in ${esc(fy(y))}.</p>
        ${towns.slice(0, 10).map(t => `<button class="opt" data-a="dest" data-n="${esc(t.n)}" data-lon="${t.lon}" data-lat="${t.lat}">${esc(t.n)} <small>${Math.round(t.d).toLocaleString()} km as the crow flies</small></button>`).join("")}
        <button class="ghost" data-a="nogo">Stay home after all</button></div>`;
    } else if (g.phase === "travel") body = travelView(g, g.dest, false);
    else if (g.phase === "moving") body = `<div class="ch"><span class="k">On the road</span><p id="lf-trip">Setting out…</p></div>`;
    else if (g.phase === "arrived") body = arrivedView(g, null);
    return `<div class="lf">${hud(g)}${body}</div>`;
  }
  function overView(g) {
    const life = lifeOf(g), rules = D().rules, o = g.over;
    let rows = "";
    if (g.kind === "real") {
      const real = g.picks.filter(p => p.real).length;
      rows = `<div class="cmp"><div><b>Your life</b>${esc(o.t)}<br>${Math.round(g.km).toLocaleString()} km travelled · ${real} of ${g.picks.length} choices as in the record</div>
        <div><b>The real ${esc(life.name)}</b>${fy(life.born)}–${fy(life.died)}. ${esc(life.epilogue || "")}</div></div>
        ${life.ai ? `<p class="sub"><span class="badge2 ai">Claude draft</span> This life was drafted by Claude and has not been checked against the sources.</p>` : ""}
        <div class="sec"><h3>Sources</h3><ul class="src">${(life.sources || []).map(s => `<li>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.cite)}</a>` : esc(s.cite)}</li>`).join("")}</ul></div>`;
    } else {
      const e15 = interp(rules.life_table.rows, g.born + 15, 4), alive = g.kids.filter(k => k.d == null).length;
      const peers = PPL().filter(p => p.b <= g.y && (p.d == null || p.d >= g.born + 15) && p.b + 80 >= g.born && km(g.home, p) < 600).slice(0, 4);
      const as = g.as ? PPL().find(p => p.name === g.as.name) : null;
      rows = `<div class="cmp"><div><b>Your life</b>${esc(o.t)}<br>${g.kids.length} children, ${alive} outlived childhood · ${Math.round(g.km).toLocaleString()} km travelled · left ${Math.round(g.st.wealth).toLocaleString()} day-wages</div>
        <div><b>A typical life here</b>Someone who reached 15 then could expect to live to about ${Math.round(15 + e15)}. About ${pct(interp(rules.agri_share.rows, g.y))} of people worked the land. ${g.role === "farmer" || g.role === "herder" ? "You were one of them." : `You were a ${esc((rules.roles.find(r => r.id === g.role) || {}).n || "")}, as about ${pct(g.odds)} were.`}</div></div>
        ${as ? `<div class="ch"><span class="k">And the real ${esc(as.name)}</span><p>${esc(as.occ)}, born ${fy(as.b)} at ${esc(as.place)}, died ${as.d != null ? fy(as.d) : "?"}${as.dplace ? ` at ${esc(as.dplace)}` : ""}. Being ordinary, you lived ${o.y - g.born} years to their ${as.d != null ? as.d - as.b : "?"}.</p></div>` : ""}
        ${peers.length ? `<div class="sec"><h3>Famous people of your time and place</h3><ul class="news">${peers.map(p => `<li class="person"><b>${esc(p.name)}</b> · ${esc(p.occ)}, ${fy(p.b)}–${p.d != null ? fy(p.d) : ""}, born in ${esc(p.place)}${(g.met || []).includes(p.name) ? " · you met them" : ""}</li>`).join("")}</ul></div>` : ""}
        <div class="sec"><h3>Your chronicle</h3><ul class="log">${g.log.map(l => `<li><span>${fy(l.y)}</span>${esc(l.t)}</li>`).join("")}</ul></div>
        <p class="src">${esc(rules.life_table.about)} ${esc(rules.life_table.src.map(s => s.cite).join("; "))}.</p>`;
    }
    return `<div class="lf">${hud(g)}<div class="ch"><span class="k">The end</span><h3>${esc(g.kind === "real" ? life.name : g.name)}, ${fy(g.kind === "real" ? life.born : g.born)}–${fy(o.y)}</h3></div>${rows}
      ${g.kind === "real" ? `<div class="sec"><h3>Your choices</h3><ul class="log">${g.picks.map(p => `<li><span>${p.real ? "record" : "yours"}</span>${esc(p.t)}</li>`).join("")}</ul></div>` : ""}
      <div class="row"><button class="go" data-a="again">Live another life</button><button class="btn" data-a="replay">Replay on the map</button>${g.kind === "real" ? `<button class="btn" data-a="real" data-id="${esc(g.id)}">Try ${esc(life.name)} again</button>` : ""}</div></div>`;
  }
  function render() {
    if (!el || !D()) return;
    const g = G0();
    el.innerHTML = !g ? home() : g.phase === "over" ? overView(g) : g.kind === "real" ? realView(g) : ordinaryView(g);
  }
  function show(fresh) {
    const g = G0();
    if (g && !api.isOnLife) { api.setOn("life", true); }
    render();
    if (fresh && g) { api.setYear(g.y, true, 700); api.fly({ lon: g.at.lon, lat: g.at.lat, span: 24 }, 1100); }
    api.redraw();
  }
  function chooseDest(to) {
    const g = G0(); if (!g) return;
    g.dest = to; g.ty = g.y; g.tm = g.m || 4; startPlan(g, to);
  }
  function startPlan(g, to) {
    g.plan = []; g.planning = true; g.sel = 0; g.phase = "travel"; render(); api.redraw();
    plan(g, to, g.ty, g.tm, (opts, fin) => { if (G0() !== g || g.phase !== "travel") return; g.plan = opts; g.planning = !fin; if (fin) save(); render(); api.redraw(); });
  }
  function setOut() {
    const g = G0(), r = g.plan[g.sel || 0]; if (!r) return;
    const life = lifeOf(g), next = life && life.chapters[g.i + 1];
    let event = "";
    if (rnd() < r.meet.risk) {
      if (g.kind === "ordinary") {
        travel(r, () => endLife(g, { y: g.ty, t: `You die on the road to ${g.dest.n}, ${r.legs.some(l => ["sail", "ocean", "steam"].includes(l.mode)) ? "lost at sea" : r.meet.plague.length ? "of plague caught on the way" : "of fever and hardship"}, in ${fy(g.ty)}. The road's risk was about ${pct(r.meet.risk)}.` }));
        return;
      }
      event = r.meet.war.length ? `You run into the war around ${r.meet.war[0].name} and lose weeks.` : r.meet.plague.length ? "Plague on the road: you fall sick and barely recover." : "Bandits, storms or fever on the way; you survive, weaker.";
      g.st.health = Math.max(0, g.st.health - 1);
    }
    const cost = Math.round(r.cost + (r.meet.toll || 0));
    g.st.wealth = Math.max(0, g.st.wealth - (g.kind === "real" ? 0 : cost));
    if (g.kind === "real" && next && next.via) g.real.push(...next.via.slice(1));
    else if (g.kind === "real" && next) g.real.push([next.at.lon, next.at.lat]);
    travel(r, total => {
      g.trip = { days: total, km: r.pts.reduce((s, p, i) => i ? s + km({ lon: r.pts[i - 1][0], lat: r.pts[i - 1][1] }, { lon: p[0], lat: p[1] }) : 0, 0), event };
      const to = g.kind === "real" ? next.at : g.dest;
      g.at = { n: to.n, lon: to.lon, lat: to.lat };
      // time moves on by the trip, or to the next chapter's date if that is later
      const t = g.ty + ((g.tm || 1) - 1 + total / 30.4) / 12;
      if (g.kind === "real") { g.y = next.y; g.m = next.m || 1; g.late = t > next.y + ((next.m || 1) - 1) / 12 + 0.25 ? Math.round((t - next.y - ((next.m || 1) - 1) / 12) * 12) : 0; }
      else { g.y = Math.floor(t); g.m = Math.floor((t - g.y) * 12) + 1; }
      g.phase = "arrived"; g.plan = null; g.showReal = g.kind === "real";
      logIt(g, { y: g.y, k: "travel", t: `Travelled to ${to.n}: ${days(total)}, ${Math.round(g.trip.km).toLocaleString()} km.${event ? " " + event : ""}` }, r.pts);
      save(); api.setYear(g.y, true, 600); show();
    });
  }
  function onClick(ev) {
    const b = ev.target.closest("button[data-a]"); if (!b) return;
    const a = b.dataset.a, g = G0();
    if (a === "real") { const l = lifeById(b.dataset.id); if (l) startReal(l); }
    else if (a === "resume") show(true);
    else if (a === "ordinary") { const v = api.view() || { lon: 30, lat: 35 }; startOrdinary({ lon: v.lon, lat: v.lat }, api.year, el.querySelector("#lf-sex").value); }
    else if (a === "pickplace") { const sex = el.querySelector("#lf-sex").value; pickWait = at => startOrdinary({ lon: at.lon, lat: at.lat }, api.year, sex); b.textContent = "Now click the map…"; }
    else if (a === "as") { const p = PPL().find(x => x.name === b.dataset.n); if (p) { drafting = null; startOrdinary({ lon: p.lon, lat: p.lat }, p.b + 16, "m", null, { name: p.name }); } }
    else if (a === "quit") { if (g && g.phase !== "over" && !confirm("Leave this life? It will not be saved to your chronicle.")) return; P.cur = null; anim = null; save(); render(); api.redraw(); }
    else if (a === "again") { P.cur = null; save(); render(); api.redraw(); }
    else if (a === "pick") choose(+b.dataset.k);
    else if (a === "altend") { const life = lifeOf(g), ch = life.chapters[g.i]; endLife(g, { y: ch.y, t: g.last.end, alt: true }); }
    else if (a === "next") {
      const life = lifeOf(g), ch = life.chapters[g.i], next = life.chapters[g.i + 1];
      if (km(ch.at, next.at) > 30) { g.dest = next.at; g.ty = ch.y; g.tm = ch.m || 1; startPlan(g, next.at); api.fly({ lon: (ch.at.lon + next.at.lon) / 2, lat: (ch.at.lat + next.at.lat) / 2, span: Math.max(10, Math.abs(ch.at.lon - next.at.lon) * 1.4) }, 900); }
      else { g.i++; g.y = next.y; g.m = next.m || 1; g.phase = "choose"; save(); api.setYear(g.y, true, 600); show(); }
    }
    else if (a === "chapter") { g.i++; g.phase = "choose"; g.trip = null; save(); show(); }
    else if (a === "jump") { const life = lifeOf(g); if (life) { const next = life.chapters[g.i + 1]; g.at = next.at; g.y = next.y; g.m = next.m || 1; g.i++; g.phase = "choose"; } else { g.phase = "year"; } save(); show(); }
    else if (a === "replay") replay();
    else if (a === "finish") { const life = lifeOf(g); endLife(g, { y: life.died, t: g.div ? `You made ${g.div} of ${g.picks.length} choices your own way, and each time the record pulled you back. You die in ${fy(life.died)}, as ${life.name} did.` : `You lived it as it happened, to the end in ${fy(life.died)}.` }); }
    else if (a === "route") { g.sel = +b.dataset.i; save(); render(); api.redraw(); }
    else if (a === "setout") setOut();
    else if (a === "act") liveYear(b.dataset.id);
    else if (a === "dest") chooseDest({ n: b.dataset.n, lon: +b.dataset.lon, lat: +b.dataset.lat });
    else if (a === "nogo") { g.phase = "year"; save(); render(); }
    else if (a === "settle") { g.phase = "year"; g.news = yearNews(g); g.lastYears = null; save(); show(); }
  }
  ATLAS.tab({
    id: "life", name: "Live",
    mount(pane, a) {
      el = pane; api = a;
      el.addEventListener("click", onClick);
      el.addEventListener("submit", ev => { if (ev.target.id !== "lf-any") return; ev.preventDefault(); const n = el.querySelector("#lf-name").value.trim(); if (!n) return; const cur = D().lives.find(l => l.name.toLowerCase() === n.toLowerCase()); cur ? startReal(cur) : draft(n); });
      // The game's data may load after the first paint (atlas-files/lens-life.json); wait for it before resuming.
      let tries = 0;
      const ready = () => {
        if (!D() || !ATLAS.world.motionReady()) { el.innerHTML = tries > 150 ? '<p class="sub">The life data did not load.</p>' : '<p class="sub">Loading lives…</p>'; if (tries++ <= 150) setTimeout(ready, 200); return; }
        // A game left mid-trip resumes at the planning step.
        const g = G0(); if (g && g.phase === "moving") { g.phase = g.plan ? "travel" : g.kind === "real" ? "choose" : "year"; save(); }
        if (g) { api.setOn("life", true); api.redraw(); }
        if (!el.hidden) render();
      };
      ready();
      a.onYear(() => { if (el && !el.hidden && !G0()) { clearTimeout(homeT); homeT = setTimeout(render, 250); } });
      if (a.onView) a.onView(() => { if (el && !el.hidden && !G0()) render(); });
    },
    show() { render(); },
  });
  let homeT = 0;
  // For tests and other plugins: the router and the world reader.
  ATLAS.life = { story, route, flight, around, hazard: (y, age) => hazard({ st: { health: 5, wealth: 100 } }, y, age), plagueAt };
})();
