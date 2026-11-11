// Scholarship: what historians argue, what they cite, what eyewitnesses wrote, and why things happened.
// Two lenses and a tab, all from LENS_DATA.scholar (views/atlas/lenses/scholar.py), which may arrive after the
// first paint, so everything here copes with it not being there yet:
//   Sources and debates (Mind)  a two-sided card per debate (schools, scholars, evidence for and against, the works),
//                               and primary-source excerpts where and when they were written about, with source criticism
//   Why (Shocks, no chip)       causal links drawn cause → effect across lenses, dashed by confidence class; the Why
//                               tab switches it on and off
//   Why tab                     chains to play as map scenes and the debates, nearest the year first; a question
//                               in the Ask bar searches them (ATLAS.scholar.find), with any record's causes and effects
// Hooks for the rest of the page: ATLAS.cite (every source row), ATLAS.cardMore (every card gets its why links,
// debates and eyewitnesses), ATLAS.world.why(id) (the why graph, WORLD.md L3), ATLAS.world.chainStory(id) (a chain
// as a Story of Scenes, WORLD.md L4) and ATLAS.scholar (citations and briefs for the AI panel).
(function () {
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fy = y => y == null ? "" : ATLAS.fmtYear(y);
  const TYPE = ["caused", "contributed to", "prevented"];
  const CONF = ["attested", "estimated", "approximate", "unknown"];
  const CONF_DASH = [null, [6, 4], [2, 4], [1, 6]];
  const STAND = { leading: "Leading view", strong: "Strong", contested: "Contested", minority: "Minority view", discredited: "Discredited" };
  const lc = l => `var(--l-${l}, #8a6a4a)`;
  const ICO = (n, t, c = "s") => window.PIXEL_ICONS ? PIXEL_ICONS.svg(n, c) : t;  // a pixel glyph (views/pixel/icons.js), or the text one
  const norm = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/^(the |battle of |siege of |sack of )/, "").replace(/[^a-z0-9]+/g, " ").trim();
  const R = 6371, rad = Math.PI / 180;
  const km = (a, b) => { const dl = (b[1] - a[1]) * rad, dn = (b[0] - a[0]) * rad; const h = Math.sin(dl / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(h))); };
  const inBox = (b, lon, lat) => b && lat >= b[1] && lat <= b[3] && (b[0] <= b[2] ? lon >= b[0] && lon <= b[2] : lon >= b[0] || lon <= b[2]);

  // ---------- data, built once LENS_DATA.scholar is there ----------
  let D = null;
  function prep() {
    const d = typeof LENS_DATA !== "undefined" && LENS_DATA.scholar;
    if (!d || !d.L) return false;
    const N = d.N, L = d.L.map(([id, from, to, t, c, cf, view, mech, lag, debate, s, e, lf, lt, src, ok], i) => ({ i, id, from, to, t, c, cf, view, mech, lag, debate, s, e, lf, lt, src, ok }));
    const out = {}, inn = {};
    for (const l of L) { (out[l.from] = out[l.from] || []).push(l); (inn[l.to] = inn[l.to] || []).push(l); }
    const byName = {};
    for (const [id, n] of Object.entries(N)) { const k = norm(n[0]); if (k.length > 3) (byName[k] = byName[k] || []).push(id); }
    const Q = d.Q.map(([id, n, text, author, work, written, y, lon, lat, about, witness, src, ok, url, lens], i) => ({ i, id, n, text, author, work, written, y, lon, lat, about, witness, src, ok, url, lens }));
    const C = d.C.map(([id, n, blurb, s, e, links, debates, question]) => ({ id, n, blurb, s, e, links, debates, question }));
    const lid = Object.fromEntries(L.map(l => [l.id, l]));
    D = { ...d, L, Q, C, out, inn, byName, lid, dix: Object.fromEntries(d.D.map(x => [x.id, x])), cix: Object.fromEntries(C.map(c => [c.id, c])) };
    return true;
  }
  const ok = () => !!D || prep();
  const pt = id => { const n = D && D.N[id]; return n && n[2] != null ? [n[2], n[3]] : null; };
  const nm = id => (D && D.N[id] ? D.N[id][0] : String(id).split(":").pop().replace(/_/g, " "));

  // ---------- citations: every source row on the page comes through here ----------
  function citeRow(s, live) {
    if (!ok()) return null;
    const S = s && s.src && D.S[s.src];
    if (!S) return null;
    const [short, full, url, verified] = S;
    return `<li>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(full)}</a>` : esc(full)}${s.pages ? ` <span class="sch-pg">pp. ${esc(s.pages)}</span>` : ""}`
      + (verified ? `<span class="sch-ok" title="Checked against ${esc(url.includes("doi.org") ? "Crossref" : "a library catalogue")}">✓ verified</span>` : `<span class="unchecked">${live ? "unchecked" : "not yet verified"}</span>`) + "</li>";
  }
  ATLAS.cite = citeRow;
  const srcHTML = ids => ids && ids.length ? `<ul class="srcs">${ids.map(x => citeRow({ src: x }) || `<li>${esc(x)}</li>`).join("")}</ul>` : "";

  // ---------- the why graph ----------
  function why(id, o = {}) {
    if (!ok()) return null;
    const depth = o.depth ?? 2, seen = new Set([id]);
    const keep = l => !o.view || norm(l.view).includes(norm(o.view));
    const walk = (x, dir, k) => k > depth ? [] : ((dir === "in" ? D.inn : D.out)[x] || []).filter(keep).sort((a, b) => b.c - a.c).map(l => {
      const y = dir === "in" ? l.from : l.to, again = seen.has(y); seen.add(y);
      return { link: l.id, id: y, name: nm(y), type: TYPE[l.t], confidence: l.c, conf: CONF[l.cf], view: l.view, mech: l.mech, lag: l.lag, debate: l.debate || null,
        lenses: [l.lf, l.lt], sources: l.src, [dir === "in" ? "causes" : "effects"]: again ? [] : walk(y, dir, k + 1) };
    });
    const causes = walk(id, "in", 1), effects = walk(id, "out", 1);
    const views = [...new Set([...(D.inn[id] || []), ...(D.out[id] || [])].map(l => l.view).filter(Boolean))];
    const debates = D.D.filter(d => d.about.includes(id) || d.pos.some(p => (p.rels || []).some(r => D.lid[r] && (D.lid[r].from === id || D.lid[r].to === id)))).map(d => d.id);
    return { id, name: nm(id), causes, effects, views, debates };
  }
  // A chain as a Story of Scenes (WORLD.md L4): one scene per link, flying from the cause to the effect.
  function chainStory(cid) {
    if (!ok() || !D.cix[cid]) return null;
    const c = D.cix[cid];
    const scenes = c.links.map(x => D.lid[x]).filter(Boolean).map((l, i, all) => {
      const a = pt(l.from), b = pt(l.to), mid = a && b ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : a || b;
      const span = a && b ? Math.min(120, Math.max(10, Math.abs(a[0] - b[0]) * 1.8, Math.abs(a[1] - b[1]) * 2.6)) : 30;
      return { id: `${cid}#${i}`, t: l.s ?? D.N[l.to][1], view: mid ? { lon: mid[0], lat: mid[1], span } : null, lenses: ["why", l.lf, l.lt],
        pins: [a && { name: nm(l.from), lon: a[0], lat: a[1] }, b && { name: nm(l.to), lon: b[0], lat: b[1] }].filter(Boolean),
        routes: a && b ? [{ label: "", points: [a, b] }] : [],
        caption: `${nm(l.from)} ${TYPE[l.t]} ${nm(l.to)}`, text: l.mech, by: "historiographer", conf: CONF[l.cf], confidence: l.c, explainer: l.view,
        sources: l.src.map(s => D.S[s] ? { src: s, cite: D.S[s][0] } : { cite: s }), next: i < all.length - 1 ? [`${cid}#${i + 1}`] : [], ask: "Why?" };
    });
    return { id: cid, title: c.n, kind: "chain", blurb: c.blurb, question: c.question, scenes };
  }
  ATLAS.world = ATLAS.world || {};
  ATLAS.world.why = why;
  ATLAS.world.chainStory = chainStory;
  // Every chain is a Story (kind "chain"), so it shows in the Stories tab with the tours and lives.
  if (ATLAS.world.stories && ATLAS.world.stories.add) ATLAS.world.stories.add({ kind: "chain", list: () => ok() ? D.C.map(c => chainStory(c.id)).filter(s => s && s.scenes.length) : [] });

  // ---------- cards ----------
  const Y = () => (ATLAS.api ? ATLAS.api.year : 0);
  function debateCard(d) {
    const tabs = d.pos.map((p, i) => `<button type="button" class="sch-tab${i ? "" : " on"}" data-sch="tab:${i}" style="--c:${lc((p.lenses || d.lenses)[0])}">${esc(p.school)}</button>`).join("");
    const panes = d.pos.map((p, i) => `<div class="sch-pane"${i ? " hidden" : ""}>
      <div class="sch-who"><span class="sch-st sch-${esc(p.standing)}">${esc(STAND[p.standing] || p.standing)}</span> ${esc((p.scholars || []).join(", "))}</div>
      <p class="sch-claim">${esc(p.claim)}</p>${p.mech ? `<p class="sch-mech"><b>How:</b> ${esc(p.mech)}</p>` : ""}
      <div class="sch-fa">${(p.for || []).length ? `<div><b>For</b><ul>${p.for.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}${(p.against || []).length ? `<div><b>Against</b><ul>${p.against.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}</div>
      ${(p.rels || []).filter(r => D.lid[r]).length ? `<div class="sch-links">${p.rels.filter(r => D.lid[r]).map(r => linkBtn(D.lid[r])).join("")}</div>` : ""}
      ${srcHTML(p.works)}</div>`).join("");
    const qs = d.quotes.map(q => D.Q.find(x => x.id === q)).filter(Boolean);
    const html = `<div class="sch">${d.fun ? `<p class="sch-fun">${esc(d.fun)}</p>` : ""}<div class="sch-tabs" role="tablist">${tabs}</div>${panes}
      ${d.state ? `<p class="sch-state"><b>Where the field stands:</b> ${esc(d.state)}</p>` : ""}${d.settle ? `<p class="sch-state"><b>What would settle it:</b> ${esc(d.settle)}</p>` : ""}
      ${qs.length ? `<div class="sch-links">${qs.map(quoteBtn).join("")}</div>` : ""}</div>`;
    const a = d.lon != null ? [d.lon, d.lat] : d.about.map(pt).find(Boolean) || [0, 0];
    return { kind: "lens:debates", c: "var(--y-debates)", kick: `Historians argue · ${d.pos.length} positions`, title: d.n, meta: `${fy(d.s)} to ${fy(d.e)}`,
      year: d.s, lon: a[0], lat: a[1], html, sch: "debate", sources: [] };
  }
  function linkCard(l) {
    const a = pt(l.from), b = pt(l.to), at = b || a || [0, 0];
    const rivals = (D.inn[l.to] || []).filter(x => x !== l);
    const html = `<div class="sch"><div class="sch-chain"><button type="button" class="sch-node" data-sch="n:${esc(l.from)}" style="--c:${lc(l.lf)}">${esc(nm(l.from))}</button>
      <span class="sch-arrow">${esc(TYPE[l.t])}${l.lag ? ` · ${l.lag} yr` : ""} ${ICO("next", "")}</span><button type="button" class="sch-node" data-sch="n:${esc(l.to)}" style="--c:${lc(l.lt)}">${esc(nm(l.to))}</button></div>
      ${l.mech ? `<p>${esc(l.mech)}</p>` : ""}<p class="sch-meta">${esc(l.view ? "Explanation: " + l.view : "")}${l.view ? " · " : ""}confidence ${Math.round(l.c * 100)}% · ${CONF[l.cf]}${l.ok ? "" : " · draft, awaiting check"}</p>
      ${l.debate && D.dix[l.debate] ? `<div class="sch-links">${debateBtn(D.dix[l.debate])}</div>` : ""}
      ${rivals.length ? `<div class="sch-sub">Other explanations of ${esc(nm(l.to))}</div><div class="sch-links">${rivals.slice(0, 6).map(linkBtn).join("")}</div>` : ""}</div>`;
    return { kind: "lens:why", c: lc(l.lf), kick: `Why · ${l.lf} → ${l.lt}`, title: `${nm(l.from)} → ${nm(l.to)}`, meta: fy(l.s) + (l.e != null && l.e !== l.s ? ` to ${fy(l.e)}` : ""),
      year: l.s, lon: at[0], lat: at[1], line: a && b ? [a, b] : undefined, html, sch: "link",
      sources: l.src.map(s => D.S[s] ? { src: s, cite: D.S[s][0] } : { cite: s }) };
  }
  function quoteCard(q) {
    const html = `<div class="sch"><blockquote class="sch-q">${esc(q.text)}</blockquote><p class="sch-meta">${esc(q.author)}${q.work ? ", " + esc(q.work) : ""}${q.written ? `, written ${fy(q.written)}` : ""}${q.ok ? ` <span class="sch-ok" title="Found word for word in the public-domain text">✓ verbatim</span>` : ""}${q.url ? ` · <a href="${esc(q.url)}" target="_blank" rel="noopener">full text</a>` : ""}</p>
      ${q.witness ? `<p class="sch-state"><b>How far to trust it:</b> ${esc(q.witness)}</p>` : ""}${q.about.length ? `<div class="sch-links">${q.about.filter(a => D.N[a]).map(a => `<button type="button" class="btn sch-mini" data-sch="n:${esc(a)}">${esc(nm(a))}</button>`).join("")}</div>` : ""}</div>`;
    return { kind: "lens:debates", c: "var(--y-debates)", kick: "Eyewitness · primary source", title: q.n || q.author, meta: fy(q.y), year: q.y,
      lon: q.lon ?? 0, lat: q.lat ?? 0, html, sch: "quote", sources: q.src ? [{ src: q.src, cite: q.src }] : [] };
  }
  function nodeCard(id) {
    const n = D.N[id], p = pt(id) || [0, 0], w = why(id, { depth: 1 });
    const html = `<div class="sch">${n[5] ? `<p>${esc(n[5])}</p>` : ""}${whyHTML(w)}</div>`;
    return { kind: "lens:why", c: lc(n[4]), kick: "Why", title: n[0], meta: fy(n[1]), year: n[1], lon: p[0], lat: p[1], html, sch: "node", sources: [] };
  }
  const linkBtn = l => `<button type="button" class="btn sch-mini" data-sch="l:${l.i}" style="--c:${lc(l.lf)}" title="${esc(l.mech)}"><i></i>${esc(nm(l.from))} → ${esc(nm(l.to))}${l.view ? ` <em>${esc(l.view)}</em>` : ""}</button>`;
  const debateBtn = d => `<button type="button" class="btn sch-mini sch-deb" data-sch="d:${esc(d.id)}">⚖ ${esc(d.n)}</button>`;
  const quoteBtn = q => `<button type="button" class="btn sch-mini" data-sch="q:${q.i}">❝ ${esc(q.author)}${q.y != null ? ", " + fy(q.y) : ""}</button>`;
  const chainBtn = c => `<button type="button" class="btn sch-mini sch-play" data-sch="c:${esc(c.id)}">${ICO("play", "▶")} ${esc(c.n)}</button>`;
  function whyHTML(w) {
    if (!w || (!w.causes.length && !w.effects.length)) return "";
    const row = x => `<button type="button" class="btn sch-mini" data-sch="l:${D.lid[x.link].i}" style="--c:${lc(x.lenses[0])}" title="${esc(x.mech)}"><i></i>${esc(x.name)} <em>${esc(x.type)}${x.view ? ", " + esc(x.view) : ""} · ${Math.round(x.confidence * 100)}%</em></button>`;
    return `${w.causes.length ? `<div class="sch-sub">Why it happened</div><div class="sch-links">${w.causes.slice(0, 6).map(row).join("")}</div>` : ""}`
      + `${w.effects.length ? `<div class="sch-sub">What it led to</div><div class="sch-links">${w.effects.slice(0, 6).map(row).join("")}</div>` : ""}`;
  }
  // Which record a card from any lens is about: its id, a node with the same name near its year, or one on the spot.
  function match(c) {
    if (c.rid && D.N[c.rid]) return c.rid;
    if (c.id && D.N[c.id]) return c.id;
    const ys = c.year;
    const ids = (D.byName[norm(c.title)] || []).filter(id => ys == null || D.N[id][1] == null || Math.abs(D.N[id][1] - ys) <= 30);
    if (ids.length) return ids.sort((a, b) => ((D.out[b] || []).length + (D.inn[b] || []).length) - ((D.out[a] || []).length + (D.inn[a] || []).length))[0];
    if (ys == null || !isFinite(c.lon)) return null;
    let best = null, bd = 60;
    for (const id of new Set([...Object.keys(D.out), ...Object.keys(D.inn)])) {
      const n = D.N[id]; if (!n || n[2] == null || n[1] == null || Math.abs(n[1] - ys) > 2) continue;
      const d = km([c.lon, c.lat], [n[2], n[3]]); if (d < bd) { bd = d; best = id; }
    }
    return best;
  }
  ATLAS.cardMore = c => {
    if (!c || c.sch || !ok()) return "";
    const id = match(c), y = c.year ?? Y(), out = [];
    if (id) { out.push(whyHTML(why(id, { depth: 1 }))); const j = D.J[id]; if (j) out.push(`<p class="sch-meta">Fact-checked ${esc(j[0])}: <b>${esc(j[1])}</b>${j[2] ? ". " + esc(j[2]) : ""}</p>`); }
    const deb = D.D.filter(d => (id && d.about.includes(id)) || (isFinite(c.lon) && inBox(d.bbox, c.lon, c.lat) && y >= (d.s ?? -1e9) - 40 && y <= (d.e ?? 1e9) + 40)).slice(0, 3);
    if (deb.length) out.push(`<div class="sch-sub">Historians argue</div><div class="sch-links">${deb.map(debateBtn).join("")}</div>`);
    const qs = isFinite(c.lon) ? D.Q.filter(q => (id && q.about.includes(id)) || (q.lon != null && Math.abs((q.y ?? 1e9) - y) <= 30 && km([c.lon, c.lat], [q.lon, q.lat]) < 250)).slice(0, 2) : [];
    if (qs.length) out.push(`<div class="sch-sub">Eyewitnesses</div><div class="sch-links">${qs.map(quoteBtn).join("")}</div>`);
    return out.filter(Boolean).length ? `<div class="sch sch-more">${out.join("")}</div>` : "";
  };

  // Buttons inside cards: the page's own click handler only knows its own actions, so these use data-sch.
  document.addEventListener("click", ev => {
    const b = ev.target.closest("[data-sch]"); if (!b || !ok() || !ATLAS.api) return;
    const [k, ...rest] = b.dataset.sch.split(":"), v = rest.join(":");
    if (k === "tab") {
      const box = b.closest(".sch"); box.querySelectorAll(".sch-tab").forEach((t, i) => t.classList.toggle("on", i === +v));
      box.querySelectorAll(".sch-pane").forEach((p, i) => { p.hidden = i !== +v; }); return;
    }
    ev.preventDefault();
    const open = card => { if (card.year != null) ATLAS.api.setYear(card.year); ATLAS.api.select(card); };
    if (k === "d" && D.dix[v]) open(debateCard(D.dix[v]));
    else if (k === "l" && D.L[+v]) open(linkCard(D.L[+v]));
    else if (k === "q" && D.Q[+v]) open(quoteCard(D.Q[+v]));
    else if (k === "n" && D.N[v]) open(nodeCard(v));
    else if (k === "c") play(v, 0);
  });

  // ---------- playing a chain on the map: the Director, like every other Story ----------
  // While a chain plays, its links stay on top in the why layer (PLAY.id).
  const PLAY = { id: null };
  let watching = false;
  function play(cid, i = 0) {
    const st = chainStory(cid), dir = ATLAS.world.director; if (!st || !st.scenes.length || !dir) return;
    if (!watching) { watching = true; const off = () => { PLAY.id = null; }; dir.onEnd(off); dir.onLeave(off); }
    dir.play(st, { at: Math.max(0, Math.min(i, st.scenes.length - 1)) });
    PLAY.id = cid;
  }

  // ---------- AI panel: what the specialists may cite, and a Historiographer of their own ----------
  const overl = (s, e, w) => (s ?? -1e9) <= w.to && (e ?? s ?? 1e9) >= w.from;
  const inW = (lon, lat, w) => !w.bbox || lon == null || inBox(w.bbox, lon, lat);
  function debatesIn(w) { return ok() ? D.D.filter(d => overl(d.s, d.e, w) && (!w.bbox || d.lon == null || inBox(w.bbox, d.lon, d.lat) || (d.bbox && inBox(w.bbox, (d.bbox[0] + d.bbox[2]) / 2, (d.bbox[1] + d.bbox[3]) / 2)))) : []; }
  function brief(w, lenses, full) {
    if (!ok()) return "";
    const deb = debatesIn(w).slice(0, full ? 8 : 4);
    const ls = lenses ? new Set(lenses) : null;
    const links = D.L.filter(l => overl(l.s, l.e ?? l.s, w) && (inW(...(pt(l.to) || []), w)) && (!ls || ls.has(l.lf) || ls.has(l.lt))).sort((a, b) => b.c - a.c).slice(0, full ? 40 : 18);
    if (!deb.length && !links.length) return "";
    const cited = new Set([...deb.flatMap(d => d.pos.flatMap(p => p.works || [])), ...links.flatMap(l => l.src)].filter(x => D.S[x]));
    return `\n\nHISTORIOGRAPHY (curated, checked; argue with these schools by name and cite their works as {"src":"src:..."}):\n`
      + deb.map(d => `${d.id} "${d.n}" (${fy(d.s)}-${fy(d.e)}): ${d.pos.map(p => `[${p.school}; ${(p.scholars || []).join(", ")}; ${p.standing}] ${p.claim} (${(p.works || []).join(", ")})`).join(" | ")}${full && d.state ? ` STATE OF THE FIELD: ${d.state}` : ""}`).join("\n")
      + (links.length ? `\nWHY LINKS (cause -> effect, whose view, confidence, sources):\n${links.map(l => `${nm(l.from)} ${TYPE[l.t]} ${nm(l.to)} (${fy(l.s)}; ${l.view || "?"}; ${Math.round(l.c * 100)}%; ${l.src.join(", ")}): ${l.mech}`).join("\n")}` : "")
      + (cited.size ? `\nBIBLIOGRAPHY (src id = work):\n${[...cited].map(x => `${x} = ${D.S[x][1]}`).join("\n")}` : "");
  }
  // ---------- a question, against what the historians already mapped (the Ask bar checks this first) ----------
  // Words, not the whole phrase: "why did Rome fall" should find the debate on the fall of Rome. A long word
  // matches by its start, so "industrial" finds "industry". Rare words count for more than common ones, and a
  // hit has to cover at least half the question's weight (and two of its words, when it has three or more), with
  // at least one of them in its title.
  const STOP = new Set("about actually after also and are became become begin began but can did does during end for from had happen happened has have how into its just like made make more most much not really start started than that the their them then there they this was were what when where which while who why will with would".split(" "));
  const stem = w => w.length > 5 ? w.slice(0, Math.max(4, w.length - 3)) : w;
  let INDEX = null;
  function find(q, max = 6) {
    if (!ok()) return [];
    const words = [...new Set(norm(q).split(" ").filter(w => w.length > 2 && !STOP.has(w)).map(stem))];
    if (!words.length) return [];
    if (!INDEX) {
      const t = s => " " + norm(s) + " ";
      INDEX = [...D.C.map(c => ({ head: t(c.n), body: t(c.blurb + " " + c.question), html: chainBtn(c) })),
        ...D.D.map(d => ({ head: t(d.n), body: t(d.pos.map(p => p.school + " " + (p.scholars || []).join(" ") + " " + (p.claim || "")).join(" ")), html: debateBtn(d) })),
        // Any record with causes or effects, by its name alone: "why did it happen?" opens its why card.
        ...Object.keys(D.N).filter(id => D.inn[id] || D.out[id]).map(id => ({ head: t(D.N[id][0]), body: "", html: `<button type="button" class="btn sch-mini" data-sch="n:${esc(id)}" style="--c:${lc(D.N[id][4])}"><i></i>${esc(D.N[id][0])} <em>${fy(D.N[id][1])}</em></button>` }))];
    }
    const hit = words.map(w => INDEX.map(x => x.head.includes(" " + w) ? 2 : x.body.includes(" " + w) ? 1 : 0));
    const idf = hit.map(h => Math.log((INDEX.length + 1) / (1 + h.reduce((n, v) => n + (v > 0), 0))));
    const total = idf.reduce((a, b) => a + b, 0), need = words.length >= 3 ? 2 : 1, seen = new Set(), out = [];
    INDEX.map((x, i) => {
      let m = 0, cov = 0, sc = 0, top = false;
      words.forEach((w, k) => { const v = hit[k][i]; if (v) { m++; cov += idf[k]; sc += idf[k] * v; top = top || v === 2; } });
      return { x, m, cov, sc, top };
    }).filter(r => r.top && r.m >= need && r.cov >= total / 2).sort((a, b) => b.cov - a.cov || b.sc - a.sc)
      .forEach(r => { if (out.length < max && !seen.has(r.x.head)) { seen.add(r.x.head); out.push(r.x.html); } });
    return out;
  }
  ATLAS.scholar = {
    ready: ok, why, chainStory, play, brief, debatesIn, find,
    has: x => ok() && !!D.S[x], cite: citeRow,
    debateButton: id => ok() && D.dix[id] ? debateBtn(D.dix[id]) : "",
    // For other plugins (Up close storylines, deep packs): the scholarship touching one record or card, as HTML.
    card: x => ok() ? ATLAS.cardMore(typeof x === "string" ? { rid: x, title: nm(x), year: D.N[x] && D.N[x][1] } : x) : "",
    stats: () => ok() ? D.n : null,
  };

  // ---------- the lenses ----------
  ATLAS.lens({
    // What the record says and how historians read it, as one lens: the arguments (diamonds) and the eyewitnesses
    // whose words they argue over (squares).
    id: "debates", name: "Sources and debates", family: "mind", color: "#9b4d2e", on: false, guide: [],
    key: [["diamond", "a question historians argue about, at its centre; tap for the two sides"], ["square", "a primary source: what someone wrote at the time, word for word"]],
    specialist: {
      id: "historiographer", name: "Historiographer", lenses: ["ideas", "order"],
      voice: "how historians have argued about this: the schools, the evidence each side leans on, what changed their minds, and where the field stands now",
      digest: w => brief(w, null, true) || "(no curated debate covers this window yet: say what the main schools are, and mark sources you are unsure of)",
    },
    index: () => ok() ? "Debates: " + D.D.map(d => `${d.n} (${fy(d.s)}-${fy(d.e)})`).join("; ") : "",
    draw(ctx) {
      if (!ok()) return; const y = ctx.year;
      const live = D.D.filter(d => d.lon != null && y >= (d.s ?? -1e9) - 30 && y <= (d.e ?? 1e9) + 30);
      ctx.pins(live, { key: d => d.id, shape: "diamond", size: 7, always: true, pri: 6, label: d => d.n.length > 46 ? d.n.slice(0, 44) + "…" : d.n, title: d => `${d.n} · ${d.pos.length} positions`, card: debateCard });
      ctx.pins(D.Q.filter(q => q.lon != null && Math.abs((q.y ?? 1e9) - y) <= 25), { key: q => "q" + q.id, shape: "square", size: 5, label: q => q.author, pri: 5, title: q => `${q.author}: “${q.text.slice(0, 90)}…”`, card: quoteCard });
    },
    // Here lists the arguments first, then the eyewitnesses (the panel shows eight rows a lens).
    here(ctx, at) {
      if (!ok()) return []; const y = ctx.year;
      const debs = D.D.filter(d => inBox(d.bbox, at.lon, at.lat) || (d.lon != null && km([at.lon, at.lat], [d.lon, d.lat]) < 900))
        .sort((a, b) => Math.abs((a.s + a.e) / 2 - y) - Math.abs((b.s + b.e) / 2 - y)).slice(0, 4)
        .map(d => ({ title: d.n, year: d.s, why: d.pos.map(p => p.school).join(" vs "), dim: y < d.s - 100 || y > d.e + 100, card: debateCard(d) }));
      const qs = D.Q.filter(q => q.lon != null && km([at.lon, at.lat], [q.lon, q.lat]) < 600).sort((a, b) => Math.abs(a.y - y) - Math.abs(b.y - y)).slice(0, 8 - debs.length)
        .map(q => ({ title: `“${q.text.slice(0, 70)}…”`, year: q.y, why: q.author, dim: Math.abs(q.y - y) > 80, card: quoteCard(q) }));
      return [...debs, ...qs];
    },
    now(ctx) { return ok() ? D.D.filter(d => ctx.year >= d.s && ctx.year <= d.e).slice(0, 4).map(d => ({ title: d.n, year: d.s, why: d.pos.map(p => p.school).join(" vs "), card: debateCard(d) })) : []; },
    strip: () => ok() ? [...D.D.map(d => d.s), ...D.Q.map(q => q.y).filter(Number.isFinite)] : [],
  });

  ATLAS.lens({
    id: "why", name: "Why", family: "shocks", color: "#b5562b", on: false, guide: [], tab: "why",
    key: [["arrow", "a cause and what it led to; the colour is the cause's lens"], ["line", "solid: contemporaries record it · dashed: estimated · dotted: argued"]],
    index: () => ok() ? "Why chains: " + D.C.map(c => `${c.n} (${fy(c.s)}-${fy(c.e)})`).join("; ") : "",
    draw(ctx) {
      if (!ok()) return; const y = ctx.year;
      // Links whose cause has happened and whose effect is still recent; the strongest first, more as you zoom in.
      const cap = Math.round(30 * Math.min(5, ctx.k));
      const hot = new Set(PLAY.id && D.cix[PLAY.id] ? D.cix[PLAY.id].links : []);
      const ls = D.L.filter(l => (hot.has(l.id) || ((l.s ?? -1e9) <= y && (l.e ?? l.s ?? 1e9) >= y - 25)) && pt(l.from) && pt(l.to))
        .sort((a, b) => hot.has(b.id) - hot.has(a.id) || b.c - a.c).slice(0, cap);
      for (let cf = 0; cf < 4; cf++) {
        const g = ls.filter(l => l.cf === cf);
        if (!g.length) continue;
        ctx.paths(g, { key: l => l.id, coords: l => arc(pt(l.from), pt(l.to)), arrow: true, dash: CONF_DASH[cf], width: 2.2,
          title: l => `${nm(l.from)} ${TYPE[l.t]} ${nm(l.to)}${l.view ? " · " + l.view : ""} · ${Math.round(l.c * 100)}%`, card: linkCard }).style("--c", l => lc(l.lf));
      }
      const ends = [...new Set(ls.flatMap(l => [l.from, l.to]))].map(id => ({ id, lon: pt(id)[0], lat: pt(id)[1] }));
      ctx.pins(ends, { key: e => e.id, shape: "circle", size: 3.5, label: e => nm(e.id), pri: 4, title: e => nm(e.id), card: e => nodeCard(e.id), color: e => lc(D.N[e.id][4]) });
    },
    here(ctx, at) {
      if (!ok()) return []; const y = ctx.year;
      return D.L.filter(l => { const p = pt(l.to) || pt(l.from); return p && km([at.lon, at.lat], p) < (at.r || 300) * 1.5; })
        .sort((a, b) => Math.abs((a.s ?? y) - y) - Math.abs((b.s ?? y) - y) || b.c - a.c).slice(0, 8)
        .map(l => ({ title: `${nm(l.from)} → ${nm(l.to)}`, year: l.s, why: `${TYPE[l.t]}${l.view ? ", " + l.view : ""}`, dim: Math.abs((l.s ?? y) - y) > 100, card: linkCard(l) }));
    },
    now(ctx) {
      if (!ok()) return []; const y = ctx.year;
      return D.C.filter(c => y >= c.s - 10 && y <= c.e + 10).slice(0, 3).map(c => ({ title: `▶ ${c.n}`, year: c.s, why: c.blurb }));
    },
    strip: () => ok() ? D.L.map(l => l.s).filter(Number.isFinite) : [],
  });
  // A gentle arc from cause to effect, so a link reads as a direction rather than a border.
  function arc(a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], m = [(a[0] + b[0]) / 2 - dy * 0.18, (a[1] + b[1]) / 2 + dx * 0.18];
    const out = []; for (let t = 0; t <= 1.0001; t += 0.125) out.push([(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * m[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * m[1] + t * t * b[1]]);
    return Math.hypot(dx, dy) < 0.05 ? [a, [a[0] + 0.3, a[1] + 0.3]] : out;
  }

  // ---------- the Why tab ----------
  let pane = null;
  function renderTab() {
    if (!pane) return;
    if (!ok()) { pane.innerHTML = `<p class="sub">The historians are still arriving (their data loads after the map). One moment.</p>`; return; }
    const y = Y(), near = (a, b) => Math.abs(a.s - y) - Math.abs(b.s - y);
    const chains = D.C.slice().sort(near), debs = D.D.slice().sort(near);
    const n = D.n;
    pane.innerHTML = `
      <label class="sch-on"><input type="checkbox" id="sch-on"${ATLAS.isOn && ATLAS.isOn("why") ? " checked" : ""}> Show causes and effects on the map</label>
      <p class="sub">Nearest to ${esc(fy(y))} first. To look for one, ask in the bar at the top.</p>
      <div class="sec"><h3>Why chains <span class="n">${chains.length}</span></h3><p class="sub">Each one crosses lenses: tap to play it link by link on the map.</p><div class="sch-links">${chains.slice(0, 24).map(c => chainBtn(c)).join("")}</div></div>
      <div class="sec"><h3>Historians argue <span class="n">${debs.length}</span></h3><div class="sch-links">${debs.slice(0, 30).map(debateBtn).join("")}</div></div>
      <p class="foot">${n.links} causal links, ${n.debates} debates, ${n.quotes} eyewitness excerpts, ${n.sources} works in the bibliography (${n.verified} checked against Crossref or OpenLibrary). Quotes are matched word for word against public-domain texts.</p>`;
  }
  if (ATLAS.tab) ATLAS.tab({ id: "why", name: "Why", icon: "mind",
    // A new year re-sorts the lists, but only while the tab is open; show() catches up when it opens.
    mount(el, api) {
      pane = el; renderTab();
      el.addEventListener("change", ev => { if (ev.target.id === "sch-on") api.setOn("why", ev.target.checked); });
      api.onYear(() => { clearTimeout(pane._t); if (!pane.hidden) pane._t = setTimeout(renderTab, 400); }); }, show() { renderTab(); } });

  // ---------- styles ----------
  const css = document.createElement("style");
  css.textContent = `
  .sch { display: grid; gap: 6px; font-size: var(--fs-read); }
  .sch-more { border-top: 1px dashed var(--rule); padding-top: 6px; margin-top: 2px; }
  .sch-fun { font-family: var(--fell); font-size: var(--fs-h4); margin: 0; }
  .sch-tabs { display: flex; flex-wrap: wrap; gap: 4px; }
  .sch-tab { border: 1px solid var(--rule); background: transparent; border-radius: 999px; padding: 2px 10px; font-size: var(--fs-note); cursor: pointer; color: var(--ink-soft); }
  .sch-tab.on { border-color: var(--c); color: var(--ink); background: color-mix(in srgb, var(--c) 16%, transparent); }
  .sch-pane { display: grid; gap: 5px; border-left: 3px solid var(--rule); padding-left: 8px; }
  .sch-pane p, .sch p { margin: 0; }
  .sch-claim { font-size: var(--fs-read); }
  .sch-who { font-size: var(--fs-note); color: var(--ink-soft); }
  .sch-st { font-family: var(--mono); font-size: var(--fs-tiny); text-transform: uppercase; letter-spacing: .08em; padding: 1px 5px; border-radius: 3px; border: 1px solid currentColor; }
  .sch-leading { color: var(--b-calm); } .sch-strong { color: var(--accent); } .sch-contested { color: var(--b-watch); } .sch-minority { color: var(--ink-soft); } .sch-discredited { color: var(--warn); text-decoration: line-through; }
  .sch-fa { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: var(--fs-note); }
  .sch-fa ul { margin: 2px 0 0; padding-left: 16px; } .sch-fa b { font-family: var(--mono); font-size: var(--fs-tiny); text-transform: uppercase; letter-spacing: .08em; }
  .sch-state { font-size: var(--fs-note); color: var(--ink-soft); }
  .sch-meta { font-size: var(--fs-note); color: var(--ink-soft); }
  .sch-sub { font-family: var(--mono); font-size: var(--fs-tiny); text-transform: uppercase; letter-spacing: .1em; color: var(--ink-soft); margin-top: 2px; }
  .sch-links { display: flex; flex-wrap: wrap; gap: 4px; }
  .sch-mini { font-size: var(--fs-note); padding: 3px 8px; display: inline-flex; gap: 5px; align-items: center; text-align: left; }
  .sch-mini i { width: 8px; height: 8px; border-radius: 50%; background: var(--c, var(--ink)); flex: none; }
  .sch-mini em { color: var(--ink-soft); font-style: normal; font-size: var(--fs-note); }
  .sch-chain { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .sch-node { border: 1.5px solid var(--c); background: color-mix(in srgb, var(--c) 12%, transparent); border-radius: 4px; padding: 3px 8px; cursor: pointer; font-size: var(--fs-note); }
  .sch-arrow { font-family: var(--mono); font-size: var(--fs-tiny); color: var(--ink-soft); }
  .sch-arrow::after { content: " →"; }
  .sch-q { margin: 0; font-family: var(--fell); font-size: var(--fs-h4); line-height: 1.4; border-left: 3px solid var(--c, var(--rule)); padding-left: 10px; }
  .sch-ok { color: var(--b-calm); font-family: var(--mono); font-size: var(--fs-tiny); margin-left: 5px; }
  .sch-pg { color: var(--ink-soft); }
  .sch-on { display: flex; gap: 8px; align-items: center; font-size: var(--fs-note); color: var(--ink-soft); margin: 2px 0 6px; cursor: pointer; }
  .sch-on input { width: 16px; height: 16px; margin: 0; accent-color: var(--y-why, #b5562b); }
  .sch-deb { border-color: color-mix(in srgb, var(--y-debates, #9b4d2e) 60%, var(--rule)); }
  .sch-play { border-color: color-mix(in srgb, var(--y-why, #b5562b) 60%, var(--rule)); }
  @media (max-width: 520px) { .sch-fa { grid-template-columns: 1fr; } }`;
  document.head.appendChild(css);
})();
