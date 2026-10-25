// L3 agents (views/atlas/WORLD.md): who is moving where at a moment, who could have met whom, and a deterministic
// step for simulations. Real travellers only go where a journey says; generated ones come from base rates (recurring
// travel systems in data/world/flows.json: when groups set out, how many a year, how long the trip took, what they
// carried) and are always labelled generated. No DOM here: it runs in a page, a worker or node.
//
//   ATLAS.world.agentsLoad(data)            data = LENS_DATA.living (flows, names, journeys, meetings, routes)
//   ATLAS.world.agents(t, bbox, opts)       -> [{id, name, kind, role, gen, lon, lat, moving, at, to, sprite, conf}]
//   ATLAS.world.agent(id)                   -> the agent with its legs
//   ATLAS.world.position(id | agent, t)     -> {lon, lat, moving, leg, at, to} or null when it is not on the map
//   ATLAS.world.meetings(t, bbox, opts)     -> documented meetings near t, and co-presence of travellers at t
//   ATLAS.world.step(state, dt)             -> {state, events}: departures, arrivals, meetings, news, dangers
//   ATLAS.world.story(id, opts)             -> a Story of Scenes (WORLD.md L4) for one traveller
//   ATLAS.world.add(agent)                  registers an outside agent (the RPG's player) so others can meet it
//   ATLAS.world.time                        {of(y, m, d), parse(s), year(t), fmt(t, prec), month(t)}
//
// Time t is continuous: t = Y + fraction of the year, where Y = y for CE years and y + 1 for BCE (1 BCE = 0.x), so
// there is no gap at year zero. time.year(t) gives back the page's year (negative for BCE, never 0).
(function (root) {
  const A = root.ATLAS || (root.ATLAS = {});
  const W = A.world || (A.world = {});

  // ---------- time ----------
  const DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31], CUM = DIM.reduce((a, d, i) => (a.push(a[i] + d), a), [0]);
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const Y0 = y => (y < 0 ? y + 1 : y);
  const of = (y, m = 1, d = 1) => Y0(y) + (CUM[Math.max(0, Math.min(11, m - 1))] + Math.max(0, d - 1)) / 365;
  const yearOf = t => { const Y = Math.floor(t + 1e-9); return Y <= 0 ? Y - 1 : Y; };
  // "1325", "1325-06", "1325-06-14", "-334-05" -> {t, prec: y|m|d, end}: end is the last moment the string allows.
  function parse(s) {
    if (s == null || s === "") return null;
    if (typeof s === "number") return { t: of(s), prec: "y", end: of(s) + 0.999 };
    const m = String(s).trim().match(/^(-?)(\d{1,5})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/);
    if (!m) return null;
    const y = (m[1] ? -1 : 1) * +m[2], mo = m[3] ? +m[3] : 0, d = m[4] ? +m[4] : 0;
    if (!y) return null;
    if (d) { const t = of(y, mo, d); return { t, prec: "d", end: t + 0.99 / 365 }; }
    if (mo) { const t = of(y, mo, 1); return { t, prec: "m", end: t + DIM[mo - 1] / 365 - 0.001 }; }
    const t = of(y); return { t, prec: "y", end: t + 0.999 };
  }
  function monthDay(t) {
    const doy = Math.max(0, Math.min(364, Math.floor((t - Math.floor(t)) * 365 + 1e-6)));
    let m = 0; while (m < 11 && CUM[m + 1] <= doy) m++;
    return [m, doy - CUM[m] + 1];
  }
  const fmtY = y => (y < 0 ? `${-y} BCE` : y < 1000 ? `${y} CE` : String(y));
  function fmt(t, prec = "d") {
    const y = yearOf(t), [m, d] = monthDay(t);
    return prec === "y" ? fmtY(y) : prec === "m" ? `${MONTHS[m]} ${fmtY(y)}` : `${d} ${MONTHS[m]} ${fmtY(y)}`;
  }
  W.time = { of, parse, year: yearOf, fmt, month: t => monthDay(t)[0], MONTHS };
  const DAY = 1 / 365;

  // ---------- seeded randomness (same seed, same world) ----------
  function hash(str) { let h = 1779033703 ^ str.length; for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; } return () => { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); return (h ^= h >>> 16) >>> 0; }; }
  function rng(str) { let a = hash(str)(); return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];

  // ---------- geometry ----------
  const RAD = Math.PI / 180;
  function km(a, b) {
    const p1 = a[1] * RAD, p2 = b[1] * RAD, dp = p2 - p1, dl = (b[0] - a[0]) * RAD;
    const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  // Points along a great circle (so long sea legs curve like on a globe) every ~150 km.
  function arc(a, b) {
    const d = km(a, b), n = Math.max(1, Math.ceil(d / 150));
    if (n === 1) return [a, b];
    const [l1, f1, l2, f2] = [a[0] * RAD, a[1] * RAD, b[0] * RAD, b[1] * RAD], D = d / 6371, out = [];
    for (let i = 0; i <= n; i++) {
      const f = i / n, A_ = Math.sin((1 - f) * D) / Math.sin(D), B = Math.sin(f * D) / Math.sin(D);
      const x = A_ * Math.cos(f1) * Math.cos(l1) + B * Math.cos(f2) * Math.cos(l2), y = A_ * Math.cos(f1) * Math.sin(l1) + B * Math.cos(f2) * Math.sin(l2), z = A_ * Math.sin(f1) + B * Math.sin(f2);
      out.push([Math.atan2(y, x) / RAD, Math.atan2(z, Math.hypot(x, y)) / RAD]);
    }
    return out;
  }
  // A polyline with cumulative km, for placing something a fraction of the way along it.
  function line(pts) { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + km(pts[i - 1], pts[i])); return { pts, c, km: c[c.length - 1] }; }
  function along(L, f) {
    const s = Math.max(0, Math.min(1, f)) * L.km, c = L.c;
    let lo = 0, hi = c.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= s) lo = m; else hi = m; }
    const seg = c[hi] - c[lo] || 1, g = (s - c[lo]) / seg, a = L.pts[lo], b = L.pts[hi];
    let dl = b[0] - a[0]; if (dl > 180) dl -= 360; if (dl < -180) dl += 360;
    return [a[0] + dl * g, a[1] + (b[1] - a[1]) * g];
  }
  const inBox = (p, b) => !b || (p[1] >= b[1] && p[1] <= b[3] && (b[0] <= b[2] ? p[0] >= b[0] && p[0] <= b[2] : p[0] >= b[0] || p[0] <= b[2]));

  // ---------- data ----------
  let D = null, FLOWS = [], JOURNEYS = [], MEET = [], CULT = [], EXTRA = new Map(), BYID = new Map();
  const memo = new Map(); // flow trips per flow-year
  const SPRITE = { merchant: "person_merchant", pilgrim: "person_pilgrim", monk: "person_monk", envoy: "person_ruler", scholar: "person_scholar", sailor: "person_sailor",
    explorer: "person_explorer", soldier: "army_levy", missionary: "person_priest", migrant: "person_farmer", courier: "person_merchant", herder: "person_farmer", enslaved: "person_farmer",
    student: "person_scholar", artist: "person_scholar", exile: "person_pilgrim", traveller: "person_explorer", ruler: "person_ruler", army: "army_levy" };
  const KIND_SPRITE = { galley_convoy: "ship_galley", galley: "ship_galley", junk: "ship_junk", dhow: "ship_dhow", cog: "ship_cog", galleon: "ship_galleon", steamer: "ship_steamer", ship: "ship_galley",
    caravan: "caravan_camel", camel_caravan: "caravan_camel", mule_caravan: "caravan_mule", donkey_caravan: "caravan_mule", wagon: "caravan_wagon", army: "army_levy" };

  W.agentsLoad = function (data) {
    if (!data || D === data) return !!D;
    D = data; memo.clear(); BYID.clear();
    CULT = (data.names && data.names.cultures) || [];
    FLOWS = (data.flows || []).map((f, i) => prepFlow(f, i)).filter(Boolean);
    JOURNEYS = (data.journeys || []).map(prepJourney).filter(Boolean);
    for (const a of JOURNEYS) BYID.set(a.id, a);
    MEET = (data.meetings || []).map(m => { const p = parse(m.date); return p && m.lon != null ? { ...m, t: p.t, prec: p.prec } : null; }).filter(Boolean).sort((a, b) => a.t - b.t);
    return true;
  };
  W.agentsReady = () => !!D;

  // A recurring travel system becomes a timetable: stops as a polyline, month weights, trips a year.
  function prepFlow(f, i) {
    const stops = (f.stops || []).filter(s => s && s.lon != null && s.lat != null);
    if (stops.length < 2 || f.start == null) return null;
    let pts = [];
    for (let k = 1; k < stops.length; k++) {
      const seg = f.mode !== "land" ? arc([stops[k - 1].lon, stops[k - 1].lat], [stops[k].lon, stops[k].lat]) : [[stops[k - 1].lon, stops[k - 1].lat], [stops[k].lon, stops[k].lat]];
      pts = pts.concat(k > 1 ? seg.slice(1) : seg);
    }
    const geo = f.path && f.path.length > 1 ? f.path : pts;
    const L = line(geo);
    // Where each stop falls along the line (fraction), so a trip can pause there.
    const at = stops.map(s => { let best = 0, bd = 1e9; for (let k = 0; k < geo.length; k++) { const d = km(geo[k], [s.lon, s.lat]); if (d < bd) { bd = d; best = k; } } return L.c[best] / (L.km || 1); });
    for (let k = 1; k < at.length; k++) at[k] = Math.max(at[k], at[k - 1]);
    const days = f.days || Math.max(3, L.km / ((f.mode === "sea" ? 110 : 30)));
    let R = null;
    const rs = (f.return_stops || []).filter(s => s && s.lon != null);
    if (rs.length > 1) {
      let rp = [];
      for (let k = 1; k < rs.length; k++) { const seg = f.mode === "land" ? [[rs[k - 1].lon, rs[k - 1].lat], [rs[k].lon, rs[k].lat]] : arc([rs[k - 1].lon, rs[k - 1].lat], [rs[k].lon, rs[k].lat]); rp = rp.concat(k > 1 ? seg.slice(1) : seg); }
      const RL = line(rp), rat = rs.map(s => { let b = 0, bd = 1e9; rp.forEach((q, k) => { const d = km(q, [s.lon, s.lat]); if (d < bd) { bd = d; b = k; } }); return RL.c[b] / (RL.km || 1); });
      for (let k = 1; k < rat.length; k++) rat[k] = Math.max(rat[k], rat[k - 1]);
      R = { L: RL, at: rat, stops: rs };
    }
    return { ...f, i, stops, L, at, R, days, end: f.end ?? 2025, per: Math.max(0, f.per_year ?? 2), kind: f.kind || f.role || "traveller" };
  }

  // A documented journey: dated stops. Missing dates are filled in by distance between the dates we have, and a
  // year-only date only says "some time that year". Every leg keeps the weaker of its two stops' confidence.
  function prepJourney(j) {
    const S = (j.stops || []).filter(s => s.lon != null && s.lat != null);
    if (S.length < 2) return null;
    const n = S.length, lo = [], hi = [], hard = [];
    const cum = [0]; for (let i = 1; i < n; i++) cum.push(cum[i - 1] + km([S[i - 1].lon, S[i - 1].lat], [S[i].lon, S[i].lat]));
    const arr = [], dep = [];
    for (let i = 0; i < n; i++) {
      const p = parse(S[i].date), q = parse(S[i].until);
      lo[i] = p ? p.t : -Infinity; hi[i] = p ? p.end : Infinity;
      hard[i] = p && p.prec !== "y" ? p.t : null;
      arr[i] = hard[i]; dep[i] = q ? (q.prec === "y" ? null : q.t) : null;
      if (q && q.prec !== "y" && hard[i] == null && !p) hard[i] = null;
      S[i]._q = q;
    }
    // Anchors: hard dates; else the first stop at the start of its year and the last at the end of its year.
    const anchor = arr.slice();
    if (anchor[0] == null) anchor[0] = isFinite(lo[0]) ? lo[0] + 0.25 : null;
    if (anchor[n - 1] == null) anchor[n - 1] = isFinite(lo[n - 1]) ? Math.min(hi[n - 1], Math.max(lo[n - 1] + 0.5, anchor[0] ?? -Infinity)) : null;
    if (anchor[0] == null || anchor[n - 1] == null) return null;
    // Interpolate the rest by distance between anchors, then keep each inside its year and in order.
    let k0 = 0;
    for (let i = 1; i < n; i++) {
      if (anchor[i] == null) continue;
      for (let m = k0 + 1; m < i; m++) {
        const f = (cum[m] - cum[k0]) / ((cum[i] - cum[k0]) || 1) || (m - k0) / (i - k0);
        anchor[m] = anchor[k0] + (anchor[i] - anchor[k0]) * f;
      }
      k0 = i;
    }
    for (let i = 0; i < n; i++) { anchor[i] = Math.max(lo[i], Math.min(hi[i], anchor[i])); if (i) anchor[i] = Math.max(anchor[i], anchor[i - 1]); }
    // Clamping piles stops with only a year onto 1 January or 31 December; spread each run of them across the part of
    // their year that is free (after the stop before, before the stop after), by distance travelled.
    for (let i = 0; i < n;) {
      if (hard[i] != null || !isFinite(lo[i])) { i++; continue; }
      let j = i; while (j + 1 < n && hard[j + 1] == null && lo[j + 1] === lo[i]) j++;
      const a0 = Math.max(lo[i], i > 0 ? anchor[i - 1] : lo[i]), b0 = Math.min(hi[i], j + 1 < n ? anchor[j + 1] : hi[i]);
      if (b0 > a0) {
        const c0 = i > 0 ? cum[i - 1] : cum[i], c1 = j + 1 < n ? cum[j + 1] : cum[j], k = j - i + 1 + (i > 0) + (j + 1 < n);
        for (let m = i; m <= j; m++) {
          const f = c1 > c0 ? (cum[m] - c0) / (c1 - c0) : (m - i + (i > 0)) / Math.max(1, k - 1);
          anchor[m] = a0 + (b0 - a0) * Math.max(0.02, Math.min(0.98, f));
        }
      }
      i = j + 1;
    }
    for (let i = 1; i < n; i++) anchor[i] = Math.max(anchor[i], anchor[i - 1]);
    // Departure from a stop: its "until" if known, else a short stay before the next leg's share of time.
    for (let i = 0; i < n - 1; i++) {
      const next = anchor[i + 1];
      let d = dep[i] != null ? dep[i] : anchor[i] + Math.min(14 * DAY, (next - anchor[i]) * 0.15);
      dep[i] = Math.max(anchor[i], Math.min(d, next));
      // Nobody walks for five years between two cities: a long gap between dated stops is a stay, and the leg
      // takes about as long as the road does (30 km a day on land, 100 at sea, until the shared router says better).
      const mode = S[i + 1].mode, v = mode === "sea" ? 100 : mode === "river" ? 60 : mode === "rail" ? 500 : mode === "air" ? 5000 : 30;
      const need = (cum[i + 1] - cum[i]) / v * DAY * 1.2;
      if (next - dep[i] > need * 3 && dep[i] !== (S[i]._q && S[i]._q.prec !== "y" ? S[i]._q.t : -1)) dep[i] = Math.max(dep[i], next - need * 1.5);
    }
    dep[n - 1] = S[n - 1]._q ? Math.max(anchor[n - 1], S[n - 1]._q.end) : anchor[n - 1];
    const CONF = { documented: "attested", attested: "attested", likely: "estimated", estimated: "estimated", approximate: "approximate", guess: "approximate", unknown: "unknown" };
    const legs = [];
    for (let i = 0; i < n - 1; i++) {
      const a = [S[i].lon, S[i].lat], b = [S[i + 1].lon, S[i + 1].lat], mode = S[i + 1].mode && S[i + 1].mode !== "start" ? S[i + 1].mode : "land";
      const pts = S[i + 1].via && S[i + 1].via.length ? [a, ...S[i + 1].via, b] : mode === "sea" ? arc(a, b) : [a, b];
      const c1 = CONF[S[i].conf] || "estimated", c2 = CONF[S[i + 1].conf] || "estimated", order = ["attested", "estimated", "approximate", "unknown"];
      legs.push({ t0: dep[i], t1: Math.max(dep[i] + DAY, anchor[i + 1]), from: S[i].place, to: S[i + 1].place, mode, L: line(pts),
        conf: order[Math.max(order.indexOf(c1), order.indexOf(c2), hard[i] != null && hard[i + 1] != null ? 0 : 2)], note: S[i + 1].note || "" });
    }
    const role = j.kind || "traveller";
    return { id: "j:" + j.id, name: j.name, person: j.person || null, kind: role, role, gen: false, real: true, summary: j.summary || "", stops: S.map((s, i) => ({ place: s.place, lon: s.lon, lat: s.lat, t: anchor[i], until: dep[i], note: s.note || "", conf: s.conf })),
      legs, t0: anchor[0], t1: dep[n - 1], sprite: j.sprite || SPRITE[role] || "person_explorer", sources: j.sources || [], status: j.status || "draft" };
  }

  // ---------- names for generated people ----------
  function culture(f, lon, lat, year) {
    const id = f.culture;
    let best = null, area = Infinity;
    for (const c of CULT) {
      if (year < (c.start ?? -1e5) - 100 || year > (c.end ?? 3000) + 100) continue;
      if (id && c.id === id) return c;
      for (const b of c.regions || []) {
        if (lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3]) { const a = (b[2] - b[0]) * (b[3] - b[1]); if (a < area) { area = a; best = c; } }
      }
    }
    if (!best && id) best = CULT.find(c => c.id === id || (c.id && (c.id.startsWith(id) || id.startsWith(c.id))));
    // Nothing for this era here: the nearest era's list for the place, so a group still has a plausible name.
    if (!best) { let gap = Infinity; for (const c of CULT) for (const b of c.regions || []) if (lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3]) { const g = Math.max(0, (c.start ?? 0) - year, year - (c.end ?? 3000)); if (g < gap && g <= 300) { gap = g; best = c; } } }
    return best;
  }
  function personName(r, c, sex, home) {
    if (!c) return null;
    const given = pick(r, (sex === "f" ? c.female : c.male) || c.male || ["(unnamed)"]);
    const fam = c.family && c.family.length ? pick(r, c.family) : "";
    const fatherName = c.male && c.male.length ? pick(r, c.male) : "";
    let pat = c.pattern || (fam ? "{given} {family}" : "{given}");
    if (c.bynames && c.bynames.length && r() < 0.5 && !/\{family\}/.test(pat)) pat = "{given} " + pick(r, c.bynames);
    return pat.replace("{given}", given).replace("{family}", fam).replace("{father}", fatherName).replace("{place}", home || "").replace(/\s+/g, " ").trim();
  }

  // ---------- generated trips from a flow ----------
  // Hajj caravans leave so as to reach Mecca by 8 Dhu al-Hijja, which moves 11 days earlier each solar year.
  function islamicT(ah, month, day) { const jd = day + Math.ceil(29.5 * (month - 1)) + (ah - 1) * 354 + Math.floor((3 + 11 * ah) / 30) + 1948439.5 - 1; return 1 + (jd - 1721423.5) / 365.25; }
  const ISLAMIC = { muharram: 1, safar: 2, rabi_al_awwal: 3, rabi_al_thani: 4, jumada_al_awwal: 5, jumada_al_thani: 6, rajab: 7, shaban: 8, ramadan: 9, shawwal: 10, dhu_al_qadah: 11, dhu_al_hijjah: 12 };
  // DENSITY scales trips a year: groups on the map per flow are capped so a busy system does not bury the map.
  W.density = 1;
  function trips(f, y) {
    const key = f.i + ":" + y;
    if (memo.has(key)) return memo.get(key);
    const out = [];
    if (y < f.start || y > f.end) { memo.set(key, out); return out; }
    const r0 = rng(f.id + ":" + y);
    let n = f.per * W.density; n = Math.floor(n) + (r0() < n % 1 ? 1 : 0); n = Math.min(n, 12);
    for (let k = 0; k < n; k++) {
      const r = rng(f.id + ":" + y + ":" + k);
      const dur = (f.days_range ? f.days_range[0] + r() * (f.days_range[1] - f.days_range[0]) : f.days * (0.85 + 0.3 * r())) * DAY;
      let t0;
      const dep = f.depart || {};
      if (dep.islamic) {
        // The Islamic year whose pilgrimage season sets out in this solar year (one, occasionally two or none).
        const Y = Y0(y), base = Math.round((Y - 622) * 33 / 32);
        t0 = null;
        for (const ah of [base - 1, base, base + 1, base + 2]) {
          const c = f.days ? islamicT(ah, 12, 7) - dur : islamicT(ah, ISLAMIC[dep.islamic] || 10, 1 + Math.floor(r() * 25));
          if (Math.floor(c) === Y) { t0 = c; break; }
        }
        if (t0 == null) continue;
      } else {
        const months = dep.months && dep.months.length ? dep.months : [1 + Math.floor(r() * 12)];
        const m = pick(r, months);
        t0 = of(y, m, 1 + Math.floor(r() * 28));
      }
      const t1 = t0 + dur, home = f.stops[0].name;
      const c = culture(f, f.stops[0].lon, f.stops[0].lat, y);
      const sex = f.role === "pilgrim" || f.role === "migrant" || f.role === "enslaved" ? (r() < 0.4 ? "f" : "m") : (r() < 0.04 ? "f" : "m");
      const leader = personName(r, c, sex, home);
      const id = `g:${f.id}:${y}:${k}`;
      if (f.dignity) { /* the people named here were enslaved: they are the story, never the cargo */ }
      const trip = { id, gen: true, real: false, flow: f, name: leader || `A ${f.role || "travelling"} party, unnamed`, sex, culture: c && c.name, role: f.role || "traveller", kind: f.kind, party: f.party || 1,
        legs: [{ t0, t1, from: home, to: f.stops[f.stops.length - 1].name, mode: f.mode || "land", L: f.L, at: f.at, stops: f.stops, conf: "estimated", out: true }],
        carry: f.goods_out || f.goods || [], dignity: f.dignity || null, t0, t1, sprite: f.sprite || KIND_SPRITE[f.kind] || SPRITE[f.role] || "person_merchant", sources: f.sources || [], status: "generated" };
      if (f.return) {
        const rm = f.return_months && f.return_months.length ? pick(r, f.return_months) : null;
        let b0 = t1 + (20 + 40 * r()) * DAY;
        if (rm) { const [m] = monthDay(t1); let yy = yearOf(t1); if (rm - 1 < m) yy = yy === -1 ? 1 : yy + 1; b0 = Math.max(b0, of(yy, rm, 1 + Math.floor(r() * 28))); }
        const R = f.R || { L: { pts: f.L.pts.slice().reverse(), c: f.L.c.map(v => f.L.km - v).reverse(), km: f.L.km }, at: f.at.map(v => 1 - v).reverse(), stops: f.stops.slice().reverse() };
        trip.legs.push({ t0: b0, t1: b0 + dur * (R.L.km / (f.L.km || 1)), from: trip.legs[0].to, to: R.stops[R.stops.length - 1].name, mode: f.mode || "land", L: R.L, at: R.at, stops: R.stops, conf: "estimated", out: false });
        trip.back = f.goods_back || [];
        trip.t1 = trip.legs[1].t1;
      }
      out.push(trip);
    }
    memo.set(key, out);
    if (memo.size > 6000) memo.delete(memo.keys().next().value);
    return out;
  }
  // Longest a trip from a flow can last, in years: how far back to look for groups still on the road.
  const span = f => Math.ceil(((f.days_range ? f.days_range[1] : f.days * 1.15) * (f.return ? 2.6 : 1) + 160) / 365);

  // ---------- positions ----------
  function position(a, t) {
    if (typeof a === "string") a = W.agent(a);
    if (!a || t < a.t0 || t > a.t1 + (a.gen ? 0 : 0.5)) return null;
    for (let i = 0; i < a.legs.length; i++) {
      const g = a.legs[i];
      if (t < g.t0) {
        // Waiting between legs (in port, at a court, in a caravanserai).
        const prev = a.legs[i - 1];
        const p = prev ? along(prev.L, 1) : along(g.L, 0);
        return { lon: p[0], lat: p[1], moving: false, leg: i - 1, at: prev ? prev.to : g.from, to: g.to };
      }
      if (t <= g.t1) {
        let f = (t - g.t0) / ((g.t1 - g.t0) || DAY), at = null;
        // Generated trips pause at their intermediate stops: 20% of the time is spent in port.
        if (g.at && g.at.length > 2) {
          const n = g.at.length - 2, pause = 0.2 / n, travel = 0.8;
          let acc = 0, pos = 0;
          for (let s = 0; s < g.at.length - 1; s++) {
            const segF = (g.at[s + 1] - g.at[s]) * travel;
            if (f <= acc + segF || s === g.at.length - 2) { pos = g.at[s] + (g.at[s + 1] - g.at[s]) * Math.min(1, (f - acc) / (segF || 1)); break; }
            acc += segF;
            if (f <= acc + pause) { pos = g.at[s + 1]; at = g.stops[s + 1].name; break; }
            acc += pause;
          }
          f = pos;
        }
        const p = along(g.L, f);
        return { lon: p[0], lat: p[1], moving: !at, leg: i, at, from: g.from, to: g.to, mode: g.mode, out: g.out };
      }
    }
    const g = a.legs[a.legs.length - 1], p = along(g.L, 1);
    return { lon: p[0], lat: p[1], moving: false, leg: a.legs.length - 1, at: g.to };
  }
  W.position = position;
  W.agent = id => BYID.get(id) || EXTRA.get(id) || genById(id);
  function genById(id) {
    const m = /^g:(.+):(-?\d+):(\d+)$/.exec(id || "");
    if (!m) return null;
    const f = FLOWS.find(x => x.id === m[1]);
    return f ? trips(f, +m[2])[+m[3]] || null : null;
  }
  W.add = function (agent) {
    if (!agent || !agent.id) return;
    agent.legs = (agent.legs || []).map(g => ({ ...g, L: g.L || line(g.path || [[g.lon0 ?? g.from_lon, g.lat0 ?? g.from_lat], [g.lon, g.lat]]) }));
    if (agent.t0 == null && agent.legs.length) { agent.t0 = agent.legs[0].t0; agent.t1 = agent.legs[agent.legs.length - 1].t1; }
    agent.real = agent.real ?? !agent.gen;
    EXTRA.set(agent.id, agent);
  };
  W.remove = id => EXTRA.delete(id);

  // Everyone on the map at t, in bbox [w, s, e, n]. opts: {real: true|false, gen: true|false, limit}.
  W.agents = function (t, bbox, opts = {}) {
    if (!D) return [];
    const out = [], y = yearOf(t);
    const push = (a, p) => out.push({ id: a.id, name: a.name, kind: a.kind, role: a.role, gen: !!a.gen, real: !!a.real, lon: p.lon, lat: p.lat, moving: p.moving, at: p.at, from: p.from, to: p.to,
      sprite: shipOrFoot(a, p), conf: a.gen ? "estimated" : (a.legs[Math.max(0, p.leg)] || {}).conf, party: a.party, flow: a.flow && a.flow.id, carry: p.out === false ? a.back : a.carry, a });
    if (opts.real !== false) {
      for (const a of JOURNEYS) { if (t < a.t0 || t > a.t1) continue; const p = position(a, t); if (p && inBox([p.lon, p.lat], bbox)) push(a, p); }
      for (const a of EXTRA.values()) { const p = position(a, t); if (p && inBox([p.lon, p.lat], bbox)) push(a, p); }
      // Real travellers and voyages from the travellers workstream (ATLAS.travel), when it is on the page.
      if (A.travel && typeof A.travel.journeys === "function") {
        try {
          for (const j of A.travel.journeys(y, bbox) || []) {
            if (BYID.has(j.id)) continue;
            const p = A.travel.positionAt ? A.travel.positionAt(j.id, t) : null;
            if (p && p.lon != null && inBox([p.lon, p.lat], bbox)) out.push({ id: j.id, name: j.name || j.carrier, kind: j.kind || "traveller", role: j.role || j.kind || "traveller", gen: false, real: true, lon: p.lon, lat: p.lat, moving: p.moving !== false, at: p.at, to: p.to, sprite: j.sprite || (p.mode === "sea" ? "ship_galleon" : "person_explorer"), conf: p.conf || j.conf, ext: true });
          }
        } catch (e) { /* the travellers lens is optional */ }
      }
    }
    if (opts.gen !== false) {
      for (const f of FLOWS) {
        if (y < f.start || y > f.end + span(f)) continue;
        if (bbox && f.box && !boxHit(f.box, bbox)) continue;
        for (let yy = y - span(f); yy <= y; yy++) {
          if (yy === 0) continue;
          for (const a of trips(f, yy)) { if (t < a.t0 || t > a.t1) continue; const p = position(a, t); if (p && inBox([p.lon, p.lat], bbox)) push(a, p); }
        }
      }
    }
    if (opts.limit && out.length > opts.limit) { out.sort((a, b) => (b.real - a.real) || 0); out.length = opts.limit; }
    return out;
  };
  const boxHit = (a, b) => !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
  // Ships at sea, people ashore: a real traveller on a sea leg shows as the ship of the age and region.
  function shipOrFoot(a, p) {
    if (a.gen || !p.moving) return a.sprite;
    if (p.mode === "sea") return A.world.shipFor ? A.world.shipFor(yearOf(a.t0), p.lon, p.lat) : "ship_galley";
    return a.sprite;
  }
  W.shipFor = (y, lon, lat) => (y >= 1830 ? "ship_steamer" : y >= 1500 && lon < 60 ? "ship_galleon" : lon > 95 && lat > -12 ? "ship_junk" : lon > 40 && lon <= 95 ? "ship_dhow" : lon < 30 && lat > 48 && y >= 1100 ? "ship_cog" : "ship_galley");

  // ---------- meetings ----------
  // Documented meetings within opts.days of t, and pairs of travellers within opts.km of each other at t.
  // kind: documented | could_have_met (two real people) | crossed (a real person and a generated group) | met (two generated groups).
  W.meetings = function (t, bbox, opts = {}) {
    if (!D) return [];
    const days = opts.days ?? 15, kmMax = opts.km ?? 30, out = [];
    for (const m of MEET) {
      if (Math.abs(m.t - t) > days * DAY + (m.prec === "y" ? 0.5 : m.prec === "m" ? 0.05 : 0)) continue;
      if (!inBox([m.lon, m.lat], bbox)) continue;
      out.push({ kind: "documented", t: m.t, lon: m.lon, lat: m.lat, a: m.a, b: m.b, place: m.place, caption: `${m.a} meets ${m.b} at ${m.place}`, what: m.what, why: m.why, conf: m.conf, sources: m.sources, rec: m });
    }
    if (opts.copresence !== false) {
      const list = opts.agents || W.agents(t, bbox, { gen: opts.gen !== false });
      const cell = new Map(), key = (x, y) => Math.floor(x / 0.5) + "," + Math.floor(y / 0.5);
      for (const a of list) { const k = key(a.lon, a.lat); (cell.get(k) || cell.set(k, []).get(k)).push(a); }
      const seen = new Set();
      for (const a of list) {
        if (!a.real && !opts.allGen) continue;
        const cx = Math.floor(a.lon / 0.5), cy = Math.floor(a.lat / 0.5);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const b of cell.get((cx + dx) + "," + (cy + dy)) || []) {
          if (b === a || b.id === a.id) continue;
          const pk = a.id < b.id ? a.id + "|" + b.id : b.id + "|" + a.id;
          if (seen.has(pk)) continue;
          const d = km([a.lon, a.lat], [b.lon, b.lat]);
          if (d > kmMax) continue;
          seen.add(pk);
          const kind = a.real && b.real ? "could_have_met" : a.real || b.real ? "crossed" : "met";
          const place = a.at || b.at || null;
          out.push({ kind, t, lon: (a.lon + b.lon) / 2, lat: (a.lat + b.lat) / 2, a: a.name, b: b.name, ida: a.id, idb: b.id, km: Math.round(d), place,
            caption: kind === "could_have_met" ? `${a.name} and ${b.name} could have met${place ? " in " + place : ""}` : `${a.real ? a.name : b.name} crosses paths with ${describe(a.real ? b : a)}`,
            conf: "approximate" });
        }
      }
    }
    return out.sort((x, y) => (x.kind === "documented" ? 0 : x.kind === "could_have_met" ? 1 : 2) - (y.kind === "documented" ? 0 : y.kind === "could_have_met" ? 1 : 2));
  };
  W.documentedMeetings = () => MEET;
  // "a party of 200 Venetian merchants bound for Alexandria" from an agents() row.
  function describe(r) {
    const a = r.a || W.agent(r.id) || r, f = a.flow;
    if (!a.gen) return a.name;
    if (a.role === "enslaved") return `${a.name}, one of about ${a.party} enslaved people forced aboard${f ? " (" + f.name.replace(/\s*\(.*\)$/, "") + ")" : ""}${r.to ? ", bound for " + r.to : ""}`;
    const n = a.party > 1 ? `${a.party > 20 ? "a party of " + a.party : "a group of " + a.party} ` : "";
    const who = f && f.name ? f.name.replace(/\s*\(.*\)$/, "") : a.role;
    return `${n ? n : ""}${n ? "" : "a "}${(f && f.role) || a.role || "traveller"}${a.party > 1 ? "s" : ""} led by ${a.name} (${who}${r.to ? ", bound for " + r.to : ""})`;
  }
  W.describe = describe;
  // Goods lists sometimes name people (pilgrims, emigrants, the enslaved): they travel with the group, they are not cargo.
  const PEOPLE = /enslaved|captive|slave|pilgrim|people|workers|migrant|emigrant|official|missionar|soldier|knight|settler|troop|passenger/i;
  W.splitGoods = list => ({ goods: (list || []).filter(g => !PEOPLE.test(g)), people: (list || []).filter(g => PEOPLE.test(g)) });

  // ---------- step: a deterministic simulation clock ----------
  // state = {t, seed, follow?: id, bbox?, news?: {id: {t, lon, lat, what, heard: {agentId: t}}}}. Returns new state and
  // the events between t and t + dt: departures and arrivals of real travellers, meetings, news passed on.
  W.step = function (state, dt) {
    const s = { ...state, t: state.t + dt }, ev = [];
    const t0 = state.t, t1 = s.t;
    for (const a of [...JOURNEYS, ...EXTRA.values()]) {
      if (a.t1 < t0 || a.t0 > t1) continue;
      a.legs.forEach((g, i) => {
        if (g.t0 > t0 && g.t0 <= t1) ev.push({ kind: "depart", t: g.t0, id: a.id, name: a.name, from: g.from, to: g.to, mode: g.mode });
        if (g.t1 > t0 && g.t1 <= t1) ev.push({ kind: "arrive", t: g.t1, id: a.id, name: a.name, at: g.to, note: g.note });
      });
    }
    const list = W.agents(t1, state.bbox);
    for (const m of W.meetings(t1, state.bbox, { agents: list, days: dt * 365 / 2 + 0.5, gen: true })) {
      if (m.kind === "met") continue;
      const key = m.kind === "documented" ? "d:" + m.rec.id : m.ida + "|" + m.idb;
      const seen = s.seen || (s.seen = {});
      if (seen[key] && t1 - seen[key] < 30 * DAY) continue;
      seen[key] = t1;
      ev.push({ ...m, t: m.kind === "documented" ? m.t : t1 });
    }
    // News: anyone within reach of someone who has heard it hears it too (gossip at the caravanserai).
    if (s.news) {
      const near = (a, b) => km([a.lon, a.lat], [b.lon, b.lat]) < 30;
      for (const [nid, n] of Object.entries(s.news)) {
        const knowers = list.filter(a => n.heard[a.id] != null || km([a.lon, a.lat], [n.lon, n.lat]) < 40 && t1 >= n.t);
        for (const k of knowers) if (n.heard[k.id] == null) n.heard[k.id] = t1;
        for (const a of list) if (n.heard[a.id] == null && knowers.some(k => near(a, k))) { n.heard[a.id] = t1; if (a.real) ev.push({ kind: "hear", t: t1, id: a.id, name: a.name, news: nid, what: n.what }); }
      }
    }
    ev.sort((a, b) => a.t - b.t);
    return { state: s, events: ev };
  };

  // ---------- stories ----------
  // One traveller's life on the road as a Story of Scenes: setting out, every stop, documented meetings, people they
  // could have met, battles and plague near the road. Scenes carry the leg's confidence and the journey's sources.
  W.story = function (id, opts = {}) {
    const a = typeof id === "string" ? W.agent(id) : id;
    if (!a) return null;
    const scenes = [], src = a.sources || [], fmtT = t => fmt(t, "d");
    const span_ = (x, y) => Math.max(4, Math.min(40, km(x, y) / 60));
    const near = (lon, lat, t, r = 160) => (opts.context || W.context || (() => []))(lon, lat, t, r);
    const sc = (o) => scenes.push({ id: `${a.id}:${scenes.length}`, kind: "simulation", actors: [a.person || a.id], sources: src, conf: "estimated", ...o, date: o.date || fmtT(o.t), year: yearOf(o.t) });
    const first = a.legs[0], start = along(first.L, 0);
    sc({ t: a.t0, view: { lon: start[0], lat: start[1], span: 10 }, caption: a.role === "enslaved" ? `${a.name} is forced aboard at ${first.from}` : `${a.name} sets out from ${first.from}`, text: a.role === "enslaved" ? `${describe({ a, to: first.to })}. ${a.name} is a generated person standing for the real people taken on this route (${a.flow.name}); the route, season and numbers follow the sources, and most of their names were never recorded.` : a.gen ? `${describe({ a, to: first.to })}. ${(() => { const g = W.splitGoods(a.carry); return (g.goods.length ? "Carrying " + g.goods.join(", ") + ". " : "") + (g.people.length ? "With " + g.people.join(", ") + ". " : ""); })()}A generated traveller: the trip follows a real system (${a.flow.name}), the person is invented.` : a.summary, conf: first.conf, pins: [{ lon: start[0], lat: start[1], label: first.from }] });
    a.legs.forEach((g, i) => {
      const p0 = along(g.L, 0), p1 = along(g.L, 1), route = { coords: g.L.pts, conf: g.conf, mode: g.mode };
      // Sample the leg every ~5 days for people and events near the road.
      const n = Math.max(1, Math.min(60, Math.round((g.t1 - g.t0) / (5 * DAY))));
      for (let k = 1; k < n; k++) {
        const t = g.t0 + (g.t1 - g.t0) * k / n, p = position(a, t);
        if (!p) continue;
        for (const m of W.meetings(t, [p.lon - 1, p.lat - 1, p.lon + 1, p.lat + 1], { days: 3, gen: !!opts.crowd, km: 25 })) {
          if (m.kind === "documented" && !(m.a === a.name || m.b === a.name)) continue;
          if (m.kind !== "documented" && m.ida !== a.id && m.idb !== a.id) continue;
          if (scenes.some(s => s.caption === m.caption)) continue;
          sc({ t, view: { lon: m.lon, lat: m.lat, span: 6 }, caption: m.caption, text: m.what || "", conf: m.kind === "documented" ? (m.conf === "documented" ? "attested" : "approximate") : "approximate", sources: m.sources || src, kind: "meeting" });
        }
        for (const c of near(p.lon, p.lat, t)) { if (!scenes.some(s => s.caption === c.caption)) sc({ t, view: { lon: c.lon, lat: c.lat, span: 8 }, ...c }); }
      }
      const stay = (a.stops && a.stops[i + 1]) || null;
      sc({ t: g.t1, view: { lon: p1[0], lat: p1[1], span: span_(p0, p1) }, caption: `${g.mode === "sea" ? "Lands at" : "Reaches"} ${g.to}`, text: g.note || (stay && stay.note) || "", conf: g.conf, routes: [route], pins: [{ lon: p1[0], lat: p1[1], label: g.to }] });
    });
    scenes.sort((x, y) => x.t - y.t);
    scenes.forEach((s, i) => { s.next = scenes[i + 1] ? [scenes[i + 1].id] : []; });
    return { id: "story:" + a.id, title: a.gen ? `${a.name}, ${a.flow.name}` : a.name, kind: "simulation", gen: !!a.gen, scenes };
  };
  // Pages can hand the story builder a context finder (battles, plague, rulers near a point and time).
  W.context = null;

  W.flows = () => FLOWS;
  W.journeys = () => JOURNEYS;
  W._ = { km, arc, line, along, parse, trips, rng };
})(typeof window !== "undefined" ? window : globalThis);
