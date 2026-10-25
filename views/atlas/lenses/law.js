// Rule & law: how each state was governed in the slider's year, and the laws that changed who was free,
// who could vote and who could worship. Data from views/atlas/lenses/law.py (data/law/*.jsonl).
(function () {
  const END = 9999;
  const EFFECT = { adopt: "adopted", abolish: "abolished", restrict: "restricted", extend: "extended" };
  // Lexical Index classes that decide the colour on their own; the others defer to the form of government.
  const LIED_FAM = { 1: "party_state", 4: "oligarchic_republic", 5: "democracy", 6: "democracy", 7: "democracy" };
  let D = null, FAM = {}, BYPOL = {};

  function prep(d) {
    if (D === d) return; D = d; FAM = {}; BYPOL = {};
    d.fams.forEach(([id, n, c, what], i) => { FAM[i] = FAM[id] = { id, n, c, what }; });
    FAM.autocracy = { id: "autocracy", n: "Autocracy (kind not recorded)", c: "#7d6b6b", what: "The Lexical Index codes no free elections; the sources here do not say what kind of rule." };
    for (const s of d.spans) (BYPOL[s[0]] = BYPOL[s[0]] || []).push({ pid: s[0], s: s[1], e: s[2], form: s[3], wd: s[4], note: s[5], url: s[6], label: s[7] });
  }
  const alive = (p, y) => p && (p[1] == null || p[1] <= y) && (p[2] == null ? END : p[2]) >= y;
  const inSpan = (sp, y) => (sp.s == null || sp.s <= y) && (sp.e == null ? END : sp.e) >= y;
  // Hand-written spans win; Wikidata forms come in order of specificity.
  const govAt = (pid, y) => { const l = (BYPOL[pid] || []).filter(sp => inSpan(sp, y)); return l.find(sp => !sp.wd) || l[0] || null; };
  function liedAt(pid, y) {
    const pts = D.lied[pid]; if (!pts || y < pts[0][0] || y > pts[pts.length - 1][0]) return null;
    let v = null; for (const [yy, vv] of pts) if (yy <= y) v = vv; return v;
  }
  function famAt(pid, y) {
    const sp = govAt(pid, y), v = liedAt(pid, y);
    if (v != null && LIED_FAM[v] && !(sp && !sp.wd && v < 5)) return FAM[LIED_FAM[v]];
    if (sp) return FAM[D.forms[sp.form][1]];
    return v != null ? FAM.autocracy : null;
  }
  function posAt(p, y) {
    const pl = p[3]; if (!pl.length) return null;
    let best = pl[0]; for (const q of pl) if (q[0] != null && q[0] <= y) best = q; return best;
  }
  const fy = (ctx, y) => y == null ? "now" : ctx.fmtYear(y);
  const span = (ctx, a, b) => `${a == null ? "?" : ctx.fmtYear(a)} to ${b == null ? "today" : ctx.fmtYear(b)}`;
  const SESHAT_N = { legal_code: "formal legal code", courts: "courts", judges: "judges", lawyers: "professional lawyers", bureaucrats: "full-time bureaucrats",
    divine_rulers: "rulers are gods", divine_legitimation: "rulers legitimated by gods", exec_constraint_gov: "executive checked by other officials", exec_constraint_nongov: "executive checked from outside government" };

  function polityCard(ctx, pid, y) {
    const p = D.pol[pid], sp = govAt(pid, y), v = liedAt(pid, y), fam = famAt(pid, y), at = posAt(p, y);
    const form = sp ? D.forms[sp.form] : null;
    const lines = [];
    if (sp) lines.push(`${form[0]}, ${span(ctx, sp.s, sp.e)}${sp.wd ? ` (Wikidata: "${sp.label}")` : ""}. ${form[2]}`);
    if (sp && sp.note) lines.push(sp.note);
    if (v != null) lines.push(`Lexical Index of Electoral Democracy, ${ctx.fmtYear(y)}: ${D.classes[v]} (class ${v} of 7).`);
    const other = (BYPOL[pid] || []).filter(o => !o.wd && o !== sp).map(o => `${D.forms[o.form][0]} ${span(ctx, o.s, o.e)}`);
    if (other.length) lines.push("Other periods: " + other.join("; ") + ".");
    const ss = D.seshat[pid];
    const why = ss ? "Seshat: " + Object.entries(ss).map(([m, pts]) => {
      const hit = pts.filter(q => q[0] <= y).pop() || pts[0]; return `${SESHAT_N[m] || m} ${hit[1] ? "yes" : "no"}`;
    }).join(", ") + "." : (fam ? fam.what : "");
    const sources = [];
    if (sp) sources.push({ cite: sp.wd ? "Wikidata, basic form of government (P122)" : "Wikipedia (checked against)", url: sp.url });
    if (v != null) sources.push({ cite: "Lexical Index of Electoral Democracy v6.9, via Our World in Data", url: "https://ourworldindata.org/grapher/political-regime-lexical" });
    if (ss) sources.push({ cite: "Seshat Global History Databank, Equinox-2020", url: "https://github.com/MajidBenam/Equinox_data" });
    return { kick: fam ? fam.n : "Rule & law", title: p[0], year: y, meta: form ? form[0] : fam ? fam.n : "", body: lines.join(" "), why,
      lon: at ? at[1] : undefined, lat: at ? at[2] : undefined, sources };
  }
  function lawCard(ctx, l) {
    const by = l.by && D.pol[l.by] ? D.pol[l.by][0] : null;
    return { kick: `${D.policies[l.p]} · ${EFFECT[l.e] || l.e}`, title: l.n, year: l.y, meta: [l.a ? "about " + ctx.fmtYear(l.y) : ctx.fmtYear(l.y), by].filter(Boolean).join(" · "),
      body: l.what, why: l.why, lon: l.lon, lat: l.lat, sources: l.src.map(([cite, url]) => ({ cite, url })) };
  }
  function living(y) {
    const out = [];
    for (const pid in D.pol) {
      const p = D.pol[pid]; if (!alive(p, y)) continue;
      const fam = famAt(pid, y), at = posAt(p, y); if (!fam || !at) continue;
      out.push({ id: pid, lon: at[1], lat: at[2], fam, sp: govAt(pid, y), p });
    }
    return out;
  }
  const lawsNear = (y, back, ahead) => D.laws.filter(l => l.y >= y - back && l.y <= y + ahead);

  ATLAS.lens({
    id: "law", name: "Rule & law", family: "power", color: "#7a5ea8", on: false, guide: ["law", "government"],
    index: d => "Rule & law lens: forms of government per state (" + d.spans.length + " spans: hand-written for major states, Wikidata elsewhere), Lexical Index democracy classes 1789+, Seshat legal institutions, and laws: "
      + d.laws.filter(l => l.cur).map(l => `${l.n} (${l.y})`).join("; "),

    draw(ctx) {
      prep(ctx.data); const y = ctx.year;
      const ps = living(y);
      const title = x => `${x.p[0]} · ${x.sp ? D.forms[x.sp.form][0] : x.fam.n}${x.sp && x.sp.s != null ? " since " + ctx.fmtYear(x.sp.s) : ""}`;
      ctx.pins(ps.filter(x => !(x.sp && !x.sp.wd)), { key: x => x.id, shape: "diamond", title, card: x => polityCard(ctx, x.id, y) })
        .style("--c", x => x.fam.c);
      ctx.pins(ps.filter(x => x.sp && !x.sp.wd), { key: x => "c" + x.id, shape: "diamond", label: x => D.forms[x.sp.form][0], title, card: x => polityCard(ctx, x.id, y) })
        .style("--c", x => x.fam.c);
      // Hand-written laws show for the 12 years after they pass, fading out; the many dated suffrage
      // records only for 3 years, unlabelled, so the 1950s and 60s don't drown in them.
      const lt = l => `${l.n} · ${ctx.fmtYear(l.y)} · ${D.policies[l.p]} ${EFFECT[l.e] || l.e}`;
      ctx.pins(lawsNear(y, 12, 0).filter(l => l.cur), { key: l => l.id, shape: "square", always: true, label: l => l.n, title: lt, card: l => lawCard(ctx, l) })
        .style("opacity", l => 1 - (y - l.y) / 16);
      ctx.pins(lawsNear(y, 3, 0).filter(l => !l.cur), { key: l => l.id, shape: "square", title: lt, card: l => lawCard(ctx, l) });
    },

    here(ctx, at) {
      prep(ctx.data); const y = ctx.year, rows = [];
      const nm = (at.polity || "").toLowerCase();
      const ps = living(y);
      const named = nm ? ps.filter(x => x.p[0].toLowerCase() === nm || x.p[0].toLowerCase().includes(nm) || nm.includes(x.p[0].toLowerCase())) : [];
      const near = ctx.near(ps, at, Math.max(at.r || 0, 600)).filter(x => !named.includes(x));
      for (const x of [...named, ...near].slice(0, 4)) {
        const c = polityCard(ctx, x.id, y);
        const why = x.sp ? (x.sp.wd ? `${D.forms[x.sp.form][2]} (Wikidata, no dates given)` : x.sp.note) : c.body;
        rows.push({ title: x.p[0], tag: c.meta, year: x.sp && x.sp.s != null && !x.sp.wd ? `since ${ctx.fmtYear(x.sp.s)}` : "", why, card: c });
      }
      for (const l of ctx.near(D.laws.filter(l => Math.abs(l.y - y) <= 60), at, Math.max(at.r || 0, 800)).sort((a, b) => Math.abs(a.y - y) - Math.abs(b.y - y)).slice(0, 4))
        rows.push({ title: l.n, tag: `${D.policies[l.p]} ${EFFECT[l.e] || l.e}`, year: l.y, why: l.what, card: lawCard(ctx, l) });
      return rows;
    },

    now(ctx) {
      prep(ctx.data); const y = ctx.year, rows = [];
      const ps = living(y), count = {};
      for (const x of ps) count[x.fam.id] = (count[x.fam.id] || 0) + 1;
      const top = Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([f, n]) => `${n} ${FAM[f].n.toLowerCase()}`);
      if (ps.length) rows.push({ title: `${ps.length} states on record`, why: top.join(", "), year: y });
      for (const l of lawsNear(y, 10, 0).sort((a, b) => b.cur - a.cur || b.y - a.y).slice(0, 6))
        rows.push({ title: l.n, tag: `${D.policies[l.p]} ${EFFECT[l.e] || l.e}`, year: l.y, why: l.what, card: lawCard(ctx, l) });
      return rows;
    },

    strip: d => d.laws.filter(l => l.cur).map(l => l.y),
  });
})();
