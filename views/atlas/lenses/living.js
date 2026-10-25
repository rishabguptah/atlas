// Living world: travellers on the road, who could have met whom, and stories of the road. The engine is
// views/atlas/world/agents.js (ATLAS.world.agents / meetings / step / story); this file is its lens (Travellers, in
// Peoples) and its tab (Living world): a day-by-day clock, moments to jump to, who is on the road in view, meetings,
// and Follow, which turns one traveller's road into a story of scenes on the map. Data: LENS_DATA.living
// (views/atlas/lenses/living.py), which arrives after the first paint.
(function () {
  const W = ATLAS.world;
  if (!W || !W.agents) return;
  const T = W.time, DAY = 1 / 365;
  let ready = false;
  const ok = () => ready || (typeof LENS_DATA !== "undefined" && LENS_DATA.living && LENS_DATA.living.flows && (ready = W.agentsLoad(LENS_DATA.living)));
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // The clock: S.t is continuous time (agents.js). It shares a month with the Up close tab (ATLAS.deep.m or
  // ATLAS.e19.m, year * 12 + month0) when that tab has one in the same year.
  const S = { t: null, playing: 0, speed: 7, follow: null, story: null, scene: -1, feed: [], state: null, el: null, api: null, cap: null, capTimer: 0, tell: null };
  function sharedMonth(y) {
    const c = (ATLAS.deep && ATLAS.deep.m != null ? ATLAS.deep.m : ATLAS.e19 && ATLAS.e19.m != null ? ATLAS.e19.m : null);
    return c != null && Math.floor(c / 12) === y ? c : null;
  }
  function now(y) {
    if (S.t != null && T.year(S.t) === y) return S.t;
    const m = sharedMonth(y);
    return m != null ? T.of(y, (m % 12) + 1, 15) : T.of(y, 7, 1);
  }

  // Water under a point, from the pixel terrain (class 0-2 is sea), so a traveller at sea shows as a ship.
  let WATER = null;
  function loadWater() {
    if (WATER !== null || typeof PIXEL === "undefined" || !PIXEL.tile0) return;
    WATER = false;
    const img = new Image();
    img.onload = () => { try { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d"); g.drawImage(img, 0, 0); WATER = { w: img.width, h: img.height, d: g.getImageData(0, 0, img.width, img.height).data }; } catch (e) { WATER = false; } };
    img.src = PIXEL.tile0;
  }
  W.isWater = (lon, lat) => {
    if (!WATER) return null;
    const x = Math.floor((lon + 180) / 360 * WATER.w), y = Math.floor((90 - lat) / 180 * WATER.h);
    return WATER.d[((Math.max(0, Math.min(WATER.h - 1, y)) * WATER.w) + ((x % WATER.w) + WATER.w) % WATER.w) * 4] <= 2;
  };
  const SEA_KIND = /galley|junk|dhow|cog|galleon|steamer|ship|fleet|clipper|packet|carrack|boat|barge/;
  function spriteOf(r) {
    if (!r.moving) return r.sprite;
    const w = W.isWater(r.lon, r.lat), y = T.year(S.t ?? T.of(ATLAS.api ? ATLAS.api.year : 1300));
    if (w === true && !SEA_KIND.test(r.sprite || "")) return W.shipFor(y, r.lon, r.lat);
    if (w === false && SEA_KIND.test(r.sprite || "") && r.a && r.a.flow && r.a.flow.mode === "mixed") return "caravan_camel";
    return r.sprite;
  }

  // ---------- context for stories: battles, plague and rulers near the road ----------
  W.context = (lon, lat, t, r) => {
    const out = [], y = T.year(t), km = W._.km;
    if (typeof WAR !== "undefined") {
      for (const b of WAR.battles || []) if (b.start === y && b.lat != null && km([lon, lat], [b.lon, b.lat]) < r)
        out.push({ lon: b.lon, lat: b.lat, caption: `${b.name} is fought nearby this year`, text: b.why || "", conf: "approximate", kind: "danger", sources: b.sources || [] });
      for (const b of WAR.wd || []) if (b[2] === y && km([lon, lat], [b[4], b[3]]) < r * 0.6)
        out.push({ lon: b[4], lat: b[3], caption: `${b[0]} is fought nearby this year`, text: b[6] ? `Between ${b[6]}.` : "", conf: "approximate", kind: "danger", sources: b[5] ? [{ cite: `Wikidata ${b[5]} (CC0)`, url: `https://www.wikidata.org/wiki/${b[5]}` }] : [] });
    }
    if (typeof PLAGUE !== "undefined") for (const s of PLAGUE.events || []) {
      if (s.lat == null || y < s.start || y > (s.end ?? s.start)) continue;
      if (km([lon, lat], [s.lon, s.lat]) < r * 2) out.push({ lon: s.lon, lat: s.lat, caption: `${s.name}: the road passes through it`, text: s.what || "", conf: "approximate", kind: "danger", sources: s.sources || [] });
    }
    if (ATLAS.objects && ATLAS.objects.near) try {
      for (const o of ATLAS.objects.near(lon, lat, y, 40) || []) if (o.type === "single" && !o.moving) out.push({ lon: o.lon, lat: o.lat, caption: `${o.name} is here${o.owner ? ", held by " + o.owner : ""}`, text: o.meet || "", conf: o.conf === "sure" ? "attested" : "approximate", kind: "object" });
    } catch (e) { /* objects lens optional */ }
    return out.slice(0, 2);
  };

  // ---------- the lens ----------
  const COLOR = "#c47a2c";
  const card = r => {
    const a = r.a || W.agent(r.id) || {};
    if (r.gen || a.gen) {
      const f = a.flow || {};
      const sg = W.splitGoods(r.carry);
      return { kick: "Generated traveller · " + (f.name || r.role), title: r.name, year: T.year(S.t ?? a.t0), lon: r.lon, lat: r.lat,
        meta: [r.moving ? `on the road to ${r.to}` : `at ${r.at}`, a.role === "enslaved" ? `one of about ${a.party} enslaved people on this voyage` : a.party > 1 ? `party of ${a.party}` : null,
          sg.people.length ? "with " + sg.people.join(", ") : null, sg.goods.length ? "carrying " + sg.goods.join(", ") : null].filter(Boolean).join(" · "),
        body: a.role === "enslaved" ? `${f.note || ""} ${r.name} is a generated person standing for the real people taken on this route: the name comes from a list for ${a.culture || "their homeland"}; the route, season, numbers and deaths at sea follow ${f.name}. Most of their names were never recorded.`
          : `${f.note || ""} The person is invented, from a name list for ${a.culture || "this culture"}; when the group set out, how long it took and what it carried follow the sources for ${f.name || "this system"} (${f.conf || "estimated"}).`,
        why: "Generated from base rates, so you can see who was on the roads. Not a real individual.", sources: a.sources || [] };
    }
    return { kick: "Traveller · " + (a.kind || r.kind || ""), title: r.name, year: T.year(S.t ?? a.t0), lon: r.lon, lat: r.lat,
      meta: [r.moving ? `on the road from ${r.from} to ${r.to}` : `at ${r.at}`, r.conf ? `path ${r.conf}` : null].filter(Boolean).join(" · "),
      body: a.summary || "", why: (a.legs && a.legs[0] && a.legs[0].note) || "", sources: a.sources || [] };
  };
  let lastList = [], lastT = null;
  function listAt(t) {
    if (lastT === t) return lastList;
    lastT = t; lastList = W.agents(t);
    return lastList;
  }
  ATLAS.lens({
    id: "living", name: "Travellers", family: "peoples", color: COLOR, on: false,
    guide: ["people", "travel", "journeys"],
    key: [["sprite", "A real traveller on a documented journey (named)"], ["small", "A generated group on a real recurring route (merchants, pilgrims, sailors)"], ["line", "The road of the traveller you follow"]],
    index: d => (d.journeys || []).map(j => `${j.name} (${j.kind}, ${(j.stops[0] || {}).date || ""})`).join("; ").slice(0, 3000),
    draw(ctx) {
      if (!ok()) return;
      loadWater();
      const t = now(ctx.year), list = listAt(t);
      const real = list.filter(r => r.real), gen = list.filter(r => !r.real);
      ctx.pins(real, { key: r => r.id, shape: "triangle", size: 5, always: true, pri: 9, label: r => r.name, title: r => `${r.name}: ${r.moving ? "to " + r.to : "at " + r.at}`, card });
      const cap = Math.round(60 * Math.pow(ctx.k, 1.2));
      ctx.pins(gen.slice(0, cap), { key: r => r.id, shape: "circle", size: 2.5, fade: 0.8, pri: 1, title: r => `${r.name} · ${r.a && r.a.flow ? r.a.flow.name : r.role}`, card });
      if (S.follow) {
        const a = W.agent(S.follow);
        if (a) ctx.paths(a.legs.map((g, i) => ({ id: a.id + ":" + i, pts: g.L.pts, conf: g.conf })), { key: x => x.id, coords: x => x.pts, width: 2.4, alpha: 0.9,
          dash: null, title: () => a.name, card: () => card({ id: a.id, name: a.name, gen: a.gen, a, lon: a.legs[0].L.pts[0][0], lat: a.legs[0].L.pts[0][1] }) });
      }
    },
    here(ctx, at) {
      if (!ok()) return [];
      const t = now(ctx.year), out = [];
      for (const r of W.agents(t, [at.lon - 4, at.lat - 4, at.lon + 4, at.lat + 4]).filter(r => W._.km([at.lon, at.lat], [r.lon, r.lat]) < at.r).slice(0, 8))
        out.push({ title: r.name, tag: r.real ? "traveller" : "generated", year: T.year(t), why: r.moving ? `On the road to ${r.to}` : `At ${r.at}`, card: card(r) });
      for (const m of W.documentedMeetings()) if (Math.abs(m.t - t) < 1 && W._.km([at.lon, at.lat], [m.lon, m.lat]) < at.r)
        out.push({ title: `${m.a} meets ${m.b}`, tag: "met", year: T.year(m.t), why: m.what, card: { kick: "Documented meeting · " + m.conf, title: `${m.a} and ${m.b}`, year: T.year(m.t), lon: m.lon, lat: m.lat, meta: `${m.date} · ${m.place}`, body: m.what, why: m.why, sources: m.sources } });
      return out;
    },
    now(ctx) {
      if (!ok()) return [];
      const t = now(ctx.year), list = listAt(t), real = list.filter(r => r.real);
      const rows = real.slice(0, 4).map(r => ({ title: r.name, tag: "on the road", why: r.moving ? `${r.from} to ${r.to}` : `at ${r.at}`, card: card(r) }));
      const gen = list.length - real.length;
      if (gen) rows.push({ title: `${gen} generated groups on recurring routes`, why: Object.entries(list.filter(r => !r.real).reduce((o, r) => (o[r.role] = (o[r.role] || 0) + 1, o), {})).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${n} ${k}`).join(", ") });
      const y = ctx.year;
      for (const m of W.documentedMeetings()) if (T.year(m.t) === y) rows.push({ title: `${m.a} meets ${m.b}`, tag: "met", why: `${m.place}. ${m.what || ""}`, card: { kick: "Documented meeting", title: `${m.a} and ${m.b}`, year: y, lon: m.lon, lat: m.lat, meta: m.date + " · " + m.place, body: m.what, why: m.why, sources: m.sources } });
      return rows.slice(0, 8);
    },
    strip: d => [...(d.meetings || []).map(m => parseInt(m.date, 10)).filter(Boolean)],
  });

  // Pixel sprites: named travellers always, generated groups as the zoom allows.
  (ATLAS.pixelSprites || (ATLAS.pixelSprites = [])).push((y, k) => {
    const out = [];
    if (!ok() || !ATLAS.isOn || !ATLAS.isOn("living")) return out;
    const t = now(y), list = listAt(t);
    let g = 0;
    const budget = Math.round(10 + 14 * k);
    for (const r of list) {
      if (!r.real && g++ > budget) continue;
      out.push({ lon: r.lon, lat: r.lat, sprite: spriteOf(r), pri: r.real ? (r.id === S.follow ? 9 : 7) : 2.2, grp: "lw:" + r.id, dy: -1 });
    }
    return out;
  });
  const refresh = () => { lastT = null; if (S.api) S.api.redraw(); if (ATLAS.pixelRefresh) try { ATLAS.pixelRefresh(); } catch (e) { console.error(e); } };

  // ---------- on-map caption (one element, pixel type) ----------
  function caption(text, kind) {
    const map = document.getElementById("map");
    if (!map) return;
    if (!S.cap) {
      S.cap = document.createElement("div"); S.cap.className = "lw-cap"; S.cap.setAttribute("role", "status");
      map.appendChild(S.cap);
      const st = document.createElement("style");
      st.textContent = `.lw-cap{position:absolute;left:50%;bottom:64px;transform:translateX(-50%);max-width:min(560px,86%);padding:8px 12px 9px;background:rgba(32,24,18,.88);color:#f6eed6;
        font:500 13px/1.35 "Pixelify Sans","Silkscreen",ui-monospace,monospace;letter-spacing:.02em;border:2px solid #f6eed6;box-shadow:0 0 0 2px rgba(32,24,18,.88),4px 4px 0 rgba(0,0,0,.35);
        pointer-events:none;opacity:0;transition:opacity .25s;z-index:5;text-align:center}
        .lw-cap.on{opacity:1}.lw-cap i{display:block;font-style:normal;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#e7b45a;margin-bottom:2px}
        @media (prefers-reduced-motion: reduce){.lw-cap{transition:none}}`;
      document.head.appendChild(st);
    }
    S.cap.innerHTML = `<i>${esc(kind || "")}${S.t != null ? " · " + esc(T.fmt(S.t)) : ""}</i>${esc(text)}`;
    S.cap.classList.add("on");
    clearTimeout(S.capTimer); S.capTimer = setTimeout(() => S.cap && S.cap.classList.remove("on"), 5200);
  }

  // ---------- the clock ----------
  function setT(t, opts = {}) {
    S.t = t;
    const y = T.year(t);
    if (S.api.year !== y) S.api.setYear(y, false); else if (!opts.quiet) refresh();
    // Keep the Up close month in step when that tab has a cursor in this year.
    const m = (y * 12) + T.month(t);
    if (ATLAS.deep && ATLAS.deep.m != null) ATLAS.deep.m = m;
    if (opts.render !== false) renderSoon();
  }
  function stop() { if (S.playing) { cancelAnimationFrame(S.playing); S.playing = 0; renderSoon(true); } }
  function play() {
    if (S.playing) return stop();
    if (S.t == null) S.t = now(S.api.year);
    S.state = { t: S.t, seen: {} };
    let last = performance.now(), acc = 0, lastDraw = 0, lastStep = 0;
    const tick = n => {
      const dt = Math.min(0.25, (n - last) / 1000) * S.speed * DAY; last = n; acc += dt;
      // Move the clock every frame; redraw marks about 8 times a second; look for events 4 times a second.
      if (n - lastDraw > 120) {
        lastDraw = n; const t = S.t + acc; acc = 0;
        setT(t, { render: false });
        if (n - lastStep > 250) { lastStep = n; events(t); renderSoon(); }
        follow();
      }
      S.playing = requestAnimationFrame(tick);
    };
    S.playing = requestAnimationFrame(tick);
    renderSoon(true);
  }
  function events(t) {
    if (!S.state) S.state = { t, seen: {} };
    const v = S.api.view(), bbox = v ? [v.lon - v.w / 2, v.lat - v.h / 2, v.lon + v.w / 2, v.lat + v.h / 2] : null;
    const dt = Math.max(DAY / 4, t - S.state.t);
    const r = W.step({ ...S.state, t: t - dt, bbox }, dt);
    S.state = { ...r.state, bbox: null };
    for (const e of r.events) {
      const line = e.kind === "documented" ? e.caption : e.kind === "could_have_met" ? e.caption : e.kind === "crossed" ? e.caption : e.kind === "depart" ? `${e.name} sets out from ${e.from} for ${e.to}` : e.kind === "arrive" ? `${e.name} reaches ${e.at}` : e.kind === "hear" ? `${e.name} hears: ${e.what}` : null;
      if (!line) continue;
      S.feed.unshift({ t: e.t, kind: e.kind, text: line, e });
      if (e.kind === "documented" || e.kind === "could_have_met" || (S.follow && (e.id === S.follow || e.ida === S.follow || e.idb === S.follow))) caption(line, e.kind === "documented" ? "They met" : e.kind === "could_have_met" ? "Could have met" : e.kind);
    }
    S.feed.length = Math.min(S.feed.length, 30);
    // Story scenes of the traveller you follow, as the clock passes them.
    if (S.story) {
      let i = S.scene;
      while (S.story.scenes[i + 1] && S.story.scenes[i + 1].t <= t) i++;
      if (i !== S.scene) { S.scene = i; const sc = S.story.scenes[i]; caption(sc.caption, sc.kind === "meeting" ? "Meeting" : sc.kind === "danger" ? "On the road" : S.story.title); }
    }
  }
  // Keep the followed traveller in view.
  let lastFly = 0;
  function follow() {
    if (!S.follow) return;
    const p = W.position(S.follow, S.t), v = S.api.view();
    if (!p || !v) return;
    const off = Math.max(Math.abs(p.lon - v.lon) / (v.w || 1), Math.abs(p.lat - v.lat) / (v.h || 1));
    if (off > 0.3 && performance.now() - lastFly > 1200) { lastFly = performance.now(); S.api.fly({ lon: p.lon, lat: p.lat, span: Math.max(6, Math.min(30, v.w * 0.8)) }, 900); }
  }
  function startFollow(id, jump = true) {
    const a = W.agent(id);
    if (!a) return;
    S.follow = id; S.story = W.story(a, { crowd: false }); S.scene = -1;
    if (!ATLAS.isOn("living")) S.api.setOn("living", true);
    if (jump && (S.t == null || S.t < a.t0 || S.t > a.t1)) setT(a.t0 + DAY, { render: false });
    const p = W.position(a, S.t) || { lon: a.legs[0].L.pts[0][0], lat: a.legs[0].L.pts[0][1] };
    S.api.fly({ lon: p.lon, lat: p.lat, span: 14 }, 1000);
    while (S.story.scenes[S.scene + 1] && S.story.scenes[S.scene + 1].t <= S.t) S.scene++;
    const sc = S.story.scenes[Math.max(0, S.scene)];
    if (sc) caption(sc.caption, S.story.title);
    refresh(); renderSoon(true);
  }
  function goScene(i) {
    if (!S.story) return;
    const sc = S.story.scenes[i]; if (!sc) return;
    stop(); S.scene = i;
    setT(sc.t, { render: false });
    if (sc.view) S.api.fly(sc.view, 900);
    caption(sc.caption, sc.kind === "meeting" ? "Meeting" : S.story.title);
    renderSoon(true);
  }

  // ---------- stories for the Director (views/atlas/world/director.js) ----------
  // Director scenes take the page's year in t and an ISO date; show() puts the day clock and the followed traveller
  // back when the Director plays the scene, so the map shows the right day, not the middle of the year.
  function forDirector(story, id) {
    const KICK = { meeting: "They could have met", crossed: "On the road", danger: "Nearby", object: "Seen here" };
    return { id: story.id, title: story.title, kind: "simulation", blurb: (W.agent(id) || {}).summary || "", status: "draft",
      scenes: story.scenes.map(sc => ({ ...sc, tt: sc.t, t: T.year(sc.t), date: T.iso(sc.t), lenses: ["living"], kick: KICK[sc.kind] || null,
        show: s => { S.t = s.tt; S.follow = id; if (!S.story || S.story.id !== story.id) { S.story = story; } lastT = null; refresh(); } })) };
  }
  const dStories = new Map();
  function directorStory(id) {
    if (!dStories.has(id)) { const a = W.agent(id); if (!a) return null; dStories.set(id, forDirector(S.story && S.follow === id ? S.story : W.story(a), id)); }
    return dStories.get(id);
  }
  // Every named journey is a Story in the Atlas's story list; scenes are worked out when one is first asked for.
  const lazy = new Map();
  function lazyStory(a) {
    if (dStories.has(a.id)) return dStories.get(a.id);
    if (!lazy.has(a.id)) {
      const st = { id: "story:" + a.id, title: a.name, kind: "simulation", blurb: a.summary || "", status: a.status || "draft" };
      Object.defineProperty(st, "scenes", { enumerable: true, configurable: true, get() { const d = directorStory(a.id); Object.defineProperty(st, "scenes", { value: d.scenes, enumerable: true, writable: true }); return d.scenes; } });
      lazy.set(a.id, st);
    }
    return lazy.get(a.id);
  }
  if (W.stories && W.stories.add) W.stories.add({ kind: "simulation", list: () => ok() ? W.journeys().map(lazyStory) : [] });
  function playScenes() {
    if (!S.follow || !W.director || !W.director.play) return false;
    stop();
    const st = directorStory(S.follow);
    if (!st) return false;
    if (W.stories && W.stories.add) W.stories.add(st);
    W.director.play(st, { at: Math.max(0, S.scene) });
    return true;
  }

  // ---------- telling a story with Claude (the page's `sample` capability) ----------
  let sample = null, sampleTried = false;
  async function tell() {
    if (!S.story) return;
    if (!sampleTried) { sampleTried = true; try { sample = window.claude ? await window.claude.use("sample") : null; } catch { sample = null; } }
    if (!sample) { S.tell = { err: "Telling a story needs this page open in Claude. The scenes above are the facts it would tell." }; return renderSoon(true); }
    const a = W.agent(S.follow), facts = S.story.scenes.map(s => `- ${s.date}: ${s.caption}${s.text ? ". " + s.text : ""} [${s.conf}]`).join("\n").slice(0, 9000);
    const prompt = `You narrate a short story of one traveller's road for an interactive history map. Facts (dated, with confidence in brackets):\n${facts}\n\n` +
      `${a && a.gen ? "This traveller is GENERATED: an invented person on a real recurring route. Say so once, lightly; keep the world (route, season, goods, places, events) to the facts." : "This is a real person. Do not invent events, dialogue or feelings the facts do not support; where the facts are 'approximate' or 'estimated', hedge (perhaps, probably)."}\n` +
      `Write 5 to 8 short paragraphs in plain, vivid English, in time order, naming dates and places. End with one sentence on what the journey shows about its world. No headings, no lists.`;
    S.tell = { text: "", busy: true }; renderSoon(true);
    try {
      const res = await sample([{ role: "user", content: prompt }], { cache: false, onText: ({ text }) => { S.tell.text = text; renderSoon(); } });
      S.tell = { text: (res && (res.text || res.content || S.tell.text)) || S.tell.text, busy: false };
    } catch (e) { S.tell = { err: e && e.code === "not_granted" ? "This page is not allowed to ask Claude." : "Claude could not tell it just now." }; }
    renderSoon(true);
  }

  // ---------- the tab ----------
  let rt = 0;
  function renderSoon(now_) { if (now_) { cancelAnimationFrame(rt); rt = 0; render(); } else if (!rt) rt = requestAnimationFrame(() => { rt = 0; render(); }); }
  const SPEEDS = [[1, "1 day/s"], [7, "1 week/s"], [30, "1 month/s"], [120, "4 months/s"]];
  function moments() {
    const out = W.journeys().map(a => ({ t: a.t0 + DAY, label: `${T.year(a.t0) < 0 ? -T.year(a.t0) + " BCE" : T.year(a.t0)}: ${a.name}`, id: a.id }));
    return out.sort((a, b) => a.t - b.t);
  }
  function render() {
    const el = S.el; if (!el || el.hidden) return;
    if (!ok()) { el.innerHTML = `<div class="lw"><h2>Living world</h2><p class="empty">Loading travellers…</p></div>`; clearTimeout(S.wait); S.wait = setTimeout(() => renderSoon(), 400); return; }
    const t = S.t ?? now(S.api.year), v = S.api.view();
    const bbox = v ? [v.lon - v.w / 2, v.lat - v.h / 2, v.lon + v.w / 2, v.lat + v.h / 2] : null;
    const list = W.agents(t, bbox), real = list.filter(r => r.real), gen = list.filter(r => !r.real);
    const roles = Object.entries(gen.reduce((o, r) => (o[r.role] = (o[r.role] || 0) + (r.party || 1), o), {})).sort((a, b) => b[1] - a[1]);
    const meets = W.meetings(t, bbox, { days: 20, gen: false });
    const A = S.follow ? W.agent(S.follow) : null;
    const row = (r, extra = "") => `<div class="lw-row${extra}"><span class="lw-who"><b>${esc(r.name)}</b><small>${esc(r.moving ? `${r.from ? r.from + " → " : ""}${r.to}` : "at " + (r.at || ""))}${r.real ? "" : " · " + esc(r.a && r.a.flow ? r.a.flow.name : r.role)}</small></span><button data-follow="${esc(r.id)}" aria-pressed="${S.follow === r.id}">${S.follow === r.id ? "Following" : "Follow"}</button></div>`;
    el.innerHTML = `<div class="lw">
      <div><h2>Living world</h2><p class="lede">Who was on the road, day by day. Named travellers follow their sources; the crowd is generated from real routes, seasons and trip times.</p></div>
      <div class="lw-when">${esc(T.fmt(t))}</div>
      <div class="lw-ctl"><button data-a="-30" title="Back a month">«</button><button data-a="-1" title="Back a day">‹</button>
        <button class="play" data-a="play" aria-label="${S.playing ? "Pause" : "Play"}">${S.playing ? "❚❚" : "▶"}</button>
        <button data-a="1" title="Forward a day">›</button><button data-a="30" title="Forward a month">»</button>
        <span class="seg" role="group" aria-label="Speed">${SPEEDS.map(([s, l]) => `<button data-speed="${s}" aria-pressed="${S.speed === s}">${l}</button>`).join("")}</span></div>
      ${A ? `<div class="lw-follow"><h3>Following ${esc(A.name)}${A.gen ? ' <span class="tag">generated</span>' : ""}</h3>
        <p class="note">${esc(A.gen ? W.describe({ a: A, to: A.legs[0].to }) : A.summary)}</p>
        <div class="lw-scenes">${S.story.scenes.map((s, i) => `<button class="lw-sc${i === S.scene ? " on" : i < S.scene ? " past" : ""}" data-scene="${i}"><span class="d">${esc(s.date)}</span><span>${esc(s.caption)}${s.conf && s.conf !== "attested" ? ` <i class="cf">${esc(s.conf)}</i>` : ""}</span></button>`).join("")}</div>
        <div class="lw-ctl">${W.director && W.director.play ? `<button data-a="scenes">Play as scenes</button>` : ""}<button data-a="next">Next scene</button><button data-a="tell">Tell this story</button><button data-a="unfollow">Stop following</button></div>
        ${S.tell ? `<div class="lw-tell">${S.tell.err ? `<p class="note">${esc(S.tell.err)}</p>` : esc(S.tell.text || "…").split(/\n\n+/).map(p => `<p>${p}</p>`).join("")}</div>` : ""}
        ${A.sources && A.sources.length ? `<p class="note">Sources: ${A.sources.map(s => s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.cite)}</a>` : esc(s.cite)).join("; ")}${A.status === "draft" ? " · draft, waiting for the judge" : ""}</p>` : ""}
      </div>` : ""}
      <h3>Named travellers in view<span class="n">${real.length}</span></h3>
      ${real.length ? real.map(r => row(r)).join("") : `<p class="empty">No documented traveller is on the road here now. Jump to a moment below.</p>`}
      <h3>The crowd in view<span class="n">${gen.length} groups</span></h3>
      ${roles.length ? `<p class="note">${roles.slice(0, 6).map(([k, n]) => `${n.toLocaleString()} ${esc(k)}${n > 1 && !/s$/.test(k) ? "s" : ""}`).join(" · ")} (people, counting each group's size)</p>${gen.slice(0, 5).map(r => row(r)).join("")}` : `<p class="empty">No recurring route runs here in this year in our data.</p>`}
      <h3>Meetings<span class="n">${meets.length}</span></h3>
      ${meets.length ? meets.slice(0, 8).map(m => `<div class="lw-row"><span class="lw-who"><b>${esc(m.caption)}</b><small>${esc(m.kind === "documented" ? `${m.rec.date} · ${m.conf}` : m.kind.replace(/_/g, " ") + (m.km != null ? `, ${m.km} km apart` : ""))}</small>${m.what ? `<small>${esc(m.what)}</small>` : ""}</span></div>`).join("") : `<p class="empty">Nobody we know of meets here within three weeks of this day.</p>`}
      ${S.feed.length ? `<h3>Just now</h3>${S.feed.slice(0, 8).map(f => `<div class="lw-row"><span class="lw-who"><small>${esc(T.fmt(f.t))}</small><b>${esc(f.text)}</b></span></div>`).join("")}` : ""}
      <h3>Jump to a moment</h3>
      <div class="lw-moments">${moments().map(m => `<button data-moment="${esc(m.id)}">${esc(m.label)}</button>`).join("")}</div>
      <p class="note">Named journeys: ${W.journeys().length}, each with sources (draft, waiting for the judge). Recurring routes: ${W.flows().length}. Meeting claims: ${W.documentedMeetings().length}. Lines between stops are straight until the shared router is on the page; dates between known stops are spread by distance.</p>
    </div>`;
  }
  const STYLE = `.lw{display:grid;gap:10px}.lw h3{display:flex;gap:6px;align-items:baseline;margin:6px 0 0}.lw h3 .n{font:11px var(--mono);opacity:.6}
    .lw-when{font:400 26px/1.1 var(--display)}.lw-ctl{display:flex;flex-wrap:wrap;gap:4px;align-items:center}.lw-ctl button,.lw-moments button,.lw-row button{font:12px var(--mono);padding:3px 8px;border:1px solid var(--line, #ccc);background:var(--paper, #fff);border-radius:4px;cursor:pointer;color:inherit}
    .lw-ctl .seg{display:inline-flex;gap:2px;margin-left:4px}.lw button[aria-pressed=true]{background:var(--ink, #222);color:var(--paper, #fff)}
    .lw-row{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:4px 0;border-bottom:1px solid rgba(0,0,0,.06)}.lw-who{display:grid}.lw-who small{opacity:.7}
    .lw-moments{display:flex;flex-wrap:wrap;gap:4px}.lw-scenes{max-height:240px;overflow:auto;display:grid}.lw-sc{display:grid;grid-template-columns:110px 1fr;gap:6px;text-align:left;border:0;background:none;padding:3px 2px;cursor:pointer;color:inherit;font:inherit}
    .lw-sc .d{font:11px var(--mono);opacity:.65}.lw-sc.on{background:rgba(196,122,44,.16)}.lw-sc.past{opacity:.6}.lw .cf{font:10px var(--mono);opacity:.7;font-style:normal}
    .lw-tell p{margin:.4em 0;line-height:1.45}.lw .tag{font:10px var(--mono);padding:1px 5px;border-radius:3px;background:rgba(196,122,44,.18)}`;
  ATLAS.tab({
    id: "living", name: "Living world",
    mount(el, api) {
      S.el = el; S.api = api;
      const st = document.createElement("style"); st.textContent = STYLE; document.head.appendChild(st);
      el.addEventListener("click", ev => {
        const b = ev.target.closest("button"); if (!b || !ok()) return;
        const a = b.dataset.a;
        if (a === "play") return play();
        if (a === "next") { if (S.story) goScene(Math.min(S.story.scenes.length - 1, S.scene + 1)); return; }
        if (a === "tell") return tell();
        if (a === "scenes") return playScenes();
        if (a === "unfollow") { S.follow = null; S.story = null; S.tell = null; refresh(); return renderSoon(true); }
        if (a) { stop(); return setT((S.t ?? now(api.year)) + (+a) * DAY); }
        if (b.dataset.speed) { S.speed = +b.dataset.speed; return renderSoon(true); }
        if (b.dataset.follow) { S.tell = null; return S.follow === b.dataset.follow ? (S.follow = null, S.story = null, refresh(), renderSoon(true)) : startFollow(b.dataset.follow, false); }
        if (b.dataset.scene) return goScene(+b.dataset.scene);
        if (b.dataset.moment) { stop(); S.tell = null; return startFollow(b.dataset.moment, true); }
      });
      api.onYear(y => { if (S.t != null && T.year(S.t) !== y) S.t = null; lastT = null; if (!el.hidden) renderSoon(); });
      if (api.onView) api.onView(() => { if (!el.hidden) renderSoon(); });
      render();
    },
    show() {
      if (!ATLAS.isOn("living")) S.api.setOn("living", true);
      loadWater();
      renderSoon(true);
    },
  });
  // Keyboard while the tab is open: , and . step a day (the page keeps arrows for years).
  document.addEventListener("keydown", ev => {
    if (!S.el || S.el.hidden || ev.target.closest("input, textarea, select") || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.key === "," || ev.key === ".") { ev.preventDefault(); stop(); setT((S.t ?? now(S.api.year)) + (ev.key === "." ? 1 : -1) * DAY); }
  });
})();
