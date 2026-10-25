// L4 Stories: the one Scene and Story format (views/atlas/WORLD.md) and the converters that turn every
// story-like thing in the Atlas into it: guide tours, panel answers, What-if scenarios, Up close storylines
// and Codex trails. Other threads (Live a life, Living world, Objects) emit Stories directly and register
// them here with ATLAS.world.stories.add(...). The Director (director.js) plays any Story on the map.
//
// Scene: {id, t, date, view: {lon, lat, span}, lenses: [layer ids], by: guide lens, highlight, pins, routes,
//         actors, caption (one line), text (the why, longer), conf: attested|estimated|approximate|unknown,
//         sources: [{cite, url}], branch (null or a what-if id), next, ask (a question for the live panel),
//         deeper: {story: id} | {q: question} | {tab: id}, kick (optional label over the caption),
//         set: {<plugin>: value} (hands a plugin its own scene state through ATLAS.sceneSet[plugin], e.g. shrink: {from: "london"})}
// Story: {id, title, kind: tour|answer|life|simulation|object|storyline|whatif|quest, blurb, scenes, next?}
(function () {
  const A = window.ATLAS, world = A.world = A.world || {};
  const KINDS = ["tour", "answer", "life", "simulation", "object", "storyline", "whatif", "quest"];
  const KIND_NAME = { tour: "Guided tour", answer: "Panel answer", life: "A life", simulation: "Living world", object: "Object journey", storyline: "Up close", whatif: "What if", quest: "Trail" };
  const CONF = ["attested", "estimated", "approximate", "unknown"];
  const LD = id => (typeof LENS_DATA !== "undefined" && LENS_DATA[id]) || null;

  // Guide steps carry a 0-1 confidence; the conf classes are the art direction's D10 grammar.
  const confOf = c => c == null || !isFinite(+c) ? null : +c >= 0.85 ? "attested" : +c >= 0.6 ? "estimated" : +c >= 0.35 ? "approximate" : "unknown";
  const firstSentence = s => { s = String(s || "").replace(/\s+/g, " ").trim(); const m = s.match(/^.{20,180}?[.!?](\s|$)/); return m ? m[0].trim() : s.length > 160 ? s.slice(0, 157) + "…" : s; };
  const slug = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60);

  // One guide/what-if step (the shape ATLAS.api.scene already plays) to a Scene.
  function fromStep(s, i, extra = {}) {
    const lenses = [...(Array.isArray(s.layers) ? s.layers : []), ...(Array.isArray(s.lenses) ? s.lenses : [])];
    return {
      id: s.id || "s" + i, t: s.t ?? s.year ?? null, date: s.date || null, view: s.view || null,
      lenses: [...new Set(lenses)], by: s.by || s.lens || null, lens: s.lens || null,
      highlight: s.highlight || [], pins: s.pins || [], routes: s.routes || [], actors: s.actors || [],
      caption: s.caption || s.title || "", text: s.text || "", conf: s.conf || confOf(s.confidence),
      confidence: s.confidence ?? null, sources: s.sources || [], branch: s.branch || null, next: s.next || null,
      ask: s.ask || null, deeper: s.deeper || null, kick: s.kick || null, set: s.set || null, ...extra,
    };
  }
  // A frame that holds every scene's view: for closing scenes that step back to show the whole story.
  function frameOf(scenes) {
    const vs = scenes.map(s => s.view).filter(v => v && isFinite(v.lon) && isFinite(v.lat));
    if (!vs.length) return null;
    const lo = vs.map(v => v.lon), la = vs.map(v => v.lat);
    const w = Math.max(...lo) - Math.min(...lo), h = Math.max(...la) - Math.min(...la);
    return { lon: (Math.max(...lo) + Math.min(...lo)) / 2, lat: (Math.max(...la) + Math.min(...la)) / 2, span: Math.min(300, Math.max(20, w * 1.5, h * 2.2, ...vs.map(v => v.span || 0))) };
  }

  const from = {
    // Curated guide tours (data/guide/tours) and panel answers have the same shape: {question, short, steps, ...}.
    tour(t, kind = "tour") {
      const steps = (t.steps || []).map((s, i) => fromStep({ ...s, ask: s.ask || `${s.title}${s.year != null ? ` (${s.year < 0 ? -s.year + " BCE" : s.year})` : ""}: why does it matter for "${t.question}"?` }, i));
      const scenes = steps.slice();
      if (t.short && steps.length) scenes.push(fromStep({ id: "close", title: "The short answer", kick: "In short", text: t.short, year: steps[steps.length - 1].t, view: frameOf(steps), lens: steps[0].by,
        layers: [...new Set(steps.flatMap(s => s.lenses))], sources: [], confidence: null }, steps.length, { caption: firstSentence(t.short), ask: t.question }));
      return { id: t.id || kind + ":" + slug(t.question), title: t.question, kind, blurb: t.short ? firstSentence(t.short) : "", status: t.live ? "live" : t.status || "draft", live: !!t.live, scenes };
    },
    // A panel answer, live or curated, read again on every sync so a streaming answer can be played while it arrives.
    answer(ans) {
      const story = from.tour(ans, "answer");
      story.id = "answer:" + slug(ans.question);
      story.sync = () => { const s2 = from.tour(ans, "answer"); story.scenes = s2.scenes; story.loading = !!ans.loading; return story; };
      story.loading = !!ans.loading;
      return story;
    },
    // What-if scenarios (data/whatif/scenarios): real steps, then the fork, then speculative branch steps.
    whatif(sc) {
      const scenes = [];
      (sc.steps || []).forEach((x, i) => {
        if (x.branch && !scenes.some(s => s.branch)) {
          scenes.push(fromStep({ id: "fork", kick: "The fork", title: sc.divergence?.text || "History turns here", year: sc.divergence?.year ?? x.year, view: x.view, lens: x.lens, layers: x.layers,
            text: [sc.divergence?.text, sc.plausibility_note].filter(Boolean).join(" "), confidence: sc.plausibility }, i, { conf: "approximate", branch: sc.id }));
        }
        // Branch steps never draw real pins or routes: what the map shows there did not happen.
        scenes.push(fromStep({ ...x, pins: x.branch ? [] : x.pins, routes: x.branch ? [] : x.routes }, i, x.branch ? { branch: sc.id, conf: "unknown", kick: "What if" } : {}));
      });
      if (sc.short && scenes.length) scenes.push(fromStep({ id: "close", kick: "Most likely", title: firstSentence(sc.short), text: sc.short, year: scenes[scenes.length - 1].t, view: frameOf(scenes), lens: scenes[0].by }, scenes.length, { branch: sc.id, conf: "unknown" }));
      return { id: sc.id || "whatif:" + slug(sc.question), title: sc.question, kind: "whatif", blurb: sc.short ? firstSentence(sc.short) : "", status: sc.live ? "live" : "draft", scenes };
    },
    // Up close storylines (data/europe-19c/stories.json): dated chronicle events, played by the month.
    storyline(region, st, D) {
      const scenes = st.steps.map(i => {
        const [d, , , sub, n, lon, lat, q, , , part] = D.events[i], t = D.text[i] || {};
        return fromStep({ id: "e" + i, title: n, year: +d.slice(0, 4), date: d, view: { lon, lat, span: 12 }, layers: ["e19"], pins: [{ name: n, lon, lat }],
          text: [t.what, t.why].filter(Boolean).join(" "), kick: t.place_name || null,
          sources: [q ? { cite: `Wikidata Q${q} (CC0)`, url: `https://www.wikidata.org/wiki/Q${q}` } : null, t.src || null].filter(Boolean),
          deeper: { tab: "upclose" }, ask: `Why did ${n} happen in ${d.slice(0, 4)}, and what did it lead to?` }, i, { conf: t.st === "d" ? "estimated" : "attested", e19: i, part });
      });
      return { id: `storyline:${region}:${st.id}`, title: st.title, kind: "storyline", blurb: st.blurb, status: "draft", scenes };
    },
    // Codex trails: stops with a place, a year and a short text.
    trail(tr) {
      const scenes = (tr.steps || []).map((s, i) => fromStep({ id: "stop" + i, title: s.n, year: s.year, view: { lon: s.lon, lat: s.lat, span: s.span || 10 }, text: s.x || "", kick: `Stop ${i + 1} of ${tr.steps.length}` }, i));
      return { id: "trail:" + tr.id, title: tr.n, kind: "quest", blurb: tr.d || "", status: "draft", scenes };
    },
    steps: fromStep,
  };

  // The registry: sources that list stories lazily (big lens data may arrive after the first paint).
  const providers = [], extra = new Map();
  const stories = world.stories = {
    KINDS, KIND_NAME, CONF, from, confOf, frameOf,
    // add(story) registers one Story; add({kind, list}) registers a provider whose list() returns Stories.
    add(x) {
      if (!x) return;
      if (typeof x.list === "function") providers.push(x);
      else if (x.id && Array.isArray(x.scenes)) extra.set(x.id, x);
    },
    list() {
      const out = [...extra.values()];
      for (const p of providers) try { out.push(...(p.list() || [])); } catch (err) { console.error("stories " + (p.kind || ""), err); }
      const seen = new Set();
      return out.filter(s => s && s.id && !seen.has(s.id) && seen.add(s.id));
    },
    get(id) { return extra.get(id) || stories.list().find(s => s.id === id) || null; },
    // What is wrong with a story, for authors: [] when it plays.
    check(s) {
      const p = [];
      if (!s || !s.id) p.push("story has no id");
      if (!KINDS.includes(s?.kind)) p.push("unknown kind " + s?.kind);
      (s?.scenes || []).forEach((c, i) => {
        if (!c.caption) p.push(`scene ${i}: no caption`);
        if (c.conf && !CONF.includes(c.conf)) p.push(`scene ${i}: conf ${c.conf}`);
        if (c.view && !(isFinite(c.view.lon) && isFinite(c.view.lat))) p.push(`scene ${i}: bad view`);
      });
      if (!(s?.scenes || []).length) p.push("no scenes");
      return p;
    },
  };

  // Built-in sources. Authored stories (data/stories/*.json) arrive as LENS_DATA.stories (lenses/stories.py).
  stories.add({ kind: "authored", list: () => ((LD("stories") || {}).stories || []).map(s => ({ ...s, scenes: s.scenes.map((c, i) => fromStep(c, i)) })) });
  stories.add({ kind: "tour", list: () => (typeof TOURS !== "undefined" ? TOURS : []).map(t => from.tour(t)) });
  stories.add({ kind: "whatif", list: () => ((LD("whatif") || {}).scenarios || []).map(from.whatif) });
  stories.add({ kind: "storyline", list: () => { const D = LD("e19"); return D && D.events && D.events.length ? D.stories.map(s => from.storyline("e19", s, D)) : []; } });
  stories.add({ kind: "quest", list: () => ((LD("codex") || {}).trails || []).filter(t => !t.tour).map(from.trail) });
})();
