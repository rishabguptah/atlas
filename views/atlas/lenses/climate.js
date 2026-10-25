// Eruptions, famine & cold: every large eruption (VEI 4 and up, Smithsonian GVP), the famines on Wikidata and in the World
// Peace Foundation list, and the global temperature of the year (PAGES 2k). Each big eruption's card measures what the
// reconstruction shows in the years after it, so the volcano and the cold can be checked against each other.
(() => {
  const NAME = { 4: "large", 5: "very large", 6: "colossal", 7: "super-colossal" };
  let D = null, SRC, ER, FAM, T, T31, TS, FD;
  const prep = d => {
    if (D === d) return; D = d;
    SRC = (d.src || []).map(([cite, url]) => (url ? { cite, url } : { cite }));
    ER = (d.er || []).map(([name, y, lat, lon, vei, pm, gvp]) => ({ id: "gvp" + gvp, name, y, lat, lon, vei, pm, gvp }));
    FAM = (d.fam || []).map(([name, s, e, lat, lon, dl, dh, wd, src, cc]) => ({ id: wd || name, name, s, e, lat, lon, dl, dh, wd, cc: !!cc, sources: [SRC[src]] }));
    T = new Map((d.temp || []).map(([y, v]) => [y, v]));
    T31 = new Map((d.temp31 || []).map(([y, v, lo, hi]) => [y, [v, lo, hi]]));
    TS = (d.temp31 || []).map(r => r[1]).sort((a, b) => a - b);
    FD = new Map(d.famdec || []);
  };
  const big = n => n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + " million" : n >= 1e3 ? Math.round(n / 1e3) + ",000" : String(n);
  const deaths = e => e.dl == null ? "" : e.dl === e.dh ? `about ${big(e.dl)} deaths` : `${big(e.dl)} to ${big(e.dh)} deaths`;
  const deg = v => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(2) + " °C";
  const mean = (a, b) => { let s = 0, n = 0; for (let y = a; y <= b; y++) if (T.has(y)) { s += T.get(y); n++; } return n ? s / n : null; };
  // What PAGES 2k shows after an eruption: the mean of the 3 years after it against the 10 years before.
  const after = e => { if (e.y < 12 || e.y > 1997 || e.pm > 2) return null; const b = mean(e.y - 10, e.y - 1), a = mean(e.y + 1, e.y + 3); return b == null || a == null ? null : a - b; };
  const tsrc = () => SRC[D.tsrc] ? [SRC[D.tsrc]] : [];

  function erCard(ctx, e) {
    const dt = after(e);
    return {
      kick: `Eruption · VEI ${e.vei}`, title: `${e.name}, ${ctx.fmtYear(e.y)}`, year: e.y, lon: e.lon, lat: e.lat,
      meta: `${NAME[e.vei]} eruption (VEI ${e.vei})${e.pm ? ` · dated to within ±${e.pm} years` : ""} · GVP eruption ${e.gvp}`,
      body: `The Smithsonian Global Volcanism Program lists a confirmed eruption of ${e.name} of VEI ${e.vei} in ${ctx.fmtYear(e.y)}. Each VEI step is about ten times more erupted rock.`,
      why: dt == null ? (e.vei >= 6 ? "Eruptions this size can cool the world for a few years if they put enough sulfur into the stratosphere; the size of the blast alone does not decide it." : "")
        : `Global temperature in the 3 years after was ${deg(dt)} against the 10 years before (PAGES 2k median). ${dt <= -0.15 ? "A clear dip, the kind sulfur in the stratosphere leaves." : dt < 0 ? "A small dip, within normal year-to-year swings." : "No cooling shows: this one put little sulfur high enough, or other eruptions and cycles hide it."}`,
      sources: [SRC[D.esrc], { cite: `GVP eruption ${e.gvp}`, url: `https://volcano.si.edu/` }].concat(dt != null ? tsrc() : []),
    };
  }
  function famCard(ctx, f) {
    return {
      kick: "Famine", title: f.name, year: f.s, lon: f.lon, lat: f.lat,
      meta: `${ctx.fmtSpan(f.s, f.e)}${deaths(f) ? " · " + deaths(f) : ""}${f.cc ? " · pinned at the country's centre" : ""}`,
      body: `${f.name}, ${ctx.fmtSpan(f.s, f.e)}${deaths(f) ? `, ${deaths(f)}` : ""}.`,
      why: f.s >= 1870 ? "Since 1870 most famine deaths came with war, blockade or a government's choices more than with the weather alone (World Peace Foundation)." : "",
      sources: f.sources.concat(f.wd ? [{ cite: "Wikidata " + f.wd, url: "https://www.wikidata.org/wiki/" + f.wd }] : []),
    };
  }
  function tempCard(ctx, y) {
    const v = T.get(y), s = T31.get(y), rank = s ? TS.findIndex(x => x >= s[0]) / TS.length : null;
    return {
      kick: "Climate", title: `Global temperature, ${ctx.fmtYear(y)}`, year: y,
      meta: `${v != null ? deg(v) + " this year" : ""}${s ? ` · 31-year mean ${deg(s[0])} (95% range ${deg(s[1])} to ${deg(s[2])})` : ""} · against 1961-1990`,
      body: `The PAGES 2k reconstruction combines tree rings, corals, ice and lake records into one global series for 1 to 2000 CE.${rank != null ? ` The 31-year mean here is ${rank < .1 ? "among the coldest tenth" : rank > .9 ? "among the warmest tenth" : rank < .5 ? "on the cool side" : "on the warm side"} of those two thousand years.` : ""}`,
      why: "Single years swing with eruptions and El Niño; the 31-year mean shows the slow shifts (the medieval warmth, the Little Ice Age, the modern rise).",
      sources: tsrc(),
    };
  }

  ATLAS.lens({
    id: "climate", name: "Eruptions, famine & cold", family: "shocks", color: "#4f7aa8", on: false,
    guide: ["climate", "geography", "disease"],
    key: [["diamond", "Eruption of VEI 4 or more; bigger is larger, a VEI 6 or 7 stays a decade"], ["square", "Famine under way, bigger with more deaths"]],
    index: d => {
      prep(d);
      return [`Eruptions VEI 6+: ${ER.filter(e => e.vei >= 6).map(e => `${e.name} ${e.y}`).join(", ")}`,
        `Famines: ${FAM.filter(f => f.dl >= 1e5).map(f => `${f.name} ${f.s} ${deaths(f)}`).join("; ")}`,
        "Global temperature 1-2000 CE (PAGES 2k) for any year"].join("\n");
    },

    draw(ctx) {
      prep(ctx.data);
      const y = ctx.year, k = ctx.k || 1;
      // Eruptions: this year's bright, the last few fading (a VEI 6 or 7 stays a decade).
      const er = ER.filter(e => y >= e.y && y - e.y <= (e.vei >= 6 ? 10 : 3));
      ctx.pins(er, { key: e => e.id, shape: "diamond", size: e => 2 + e.vei * 0.9, fade: e => 1 - (y - e.y) / (e.vei >= 6 ? 12 : 5),
        always: e => e.vei >= 6 && y - e.y <= 3, label: e => e.vei >= 5 || k >= 3 ? `${e.name} ${ctx.fmtYear(e.y)}` : null, pri: e => e.vei,
        title: e => `${e.name} · VEI ${e.vei} · ${ctx.fmtYear(e.y)}`, card: e => erCard(ctx, e) });
      // Famines running this year (or ended in the last two), sized by deaths.
      const fam = FAM.filter(f => y >= f.s && y <= f.e + 2);
      ctx.pins(fam, { key: f => f.id, shape: "square", size: f => f.dl ? Math.min(9, 2 + Math.log10(f.dl) - 2) : 3.5, fade: f => y > f.e ? .5 : 1,
        label: f => f.name, pri: f => f.dl ? Math.min(7, Math.log10(f.dl)) : 3, always: f => f.dl >= 1e6 && y <= f.e,
        title: f => `${f.name} · ${ctx.fmtSpan(f.s, f.e)}${deaths(f) ? " · " + deaths(f) : ""}`, card: f => famCard(ctx, f) });
    },

    here(ctx, at) {
      prep(ctx.data);
      const y = ctx.year;
      const er = ctx.near(ER, at, Math.max(at.r || 0, 250)).sort((a, b) => b.vei - a.vei || Math.abs(a.y - y) - Math.abs(b.y - y)).slice(0, 5);
      const fam = ctx.near(FAM, at).sort((a, b) => Math.abs(a.s - y) - Math.abs(b.s - y)).slice(0, 4);
      return [...er.map(e => ({ title: `${e.name} erupts (VEI ${e.vei})`, year: e.y, why: (after(e) != null ? `World ${deg(after(e))} in the 3 years after` : NAME[e.vei] + " eruption"), card: erCard(ctx, e) })),
        ...fam.map(f => ({ title: f.name, year: f.s, why: deaths(f), card: famCard(ctx, f) }))];
    },

    now(ctx) {
      prep(ctx.data);
      const y = ctx.year, out = [];
      if (T.has(y) || T31.has(y)) {
        const s = T31.get(y);
        out.push({ title: `Global temperature ${T.has(y) ? deg(T.get(y)) : deg(s[0])} against 1961-90`, year: y, why: s ? `31-year mean ${deg(s[0])} · PAGES 2k` : "PAGES 2k", card: tempCard(ctx, y) });
      }
      for (const e of ER.filter(e => e.y === y).sort((a, b) => b.vei - a.vei).slice(0, 3)) out.push({ title: `${e.name} erupts (VEI ${e.vei})`, year: e.y, why: after(e) != null ? `World ${deg(after(e))} in the 3 years after` : NAME[e.vei] + " eruption", card: erCard(ctx, e) });
      for (const f of FAM.filter(f => y >= f.s && y <= f.e).sort((a, b) => (b.dl || 0) - (a.dl || 0)).slice(0, 4)) out.push({ title: f.name, year: f.s, why: deaths(f), card: famCard(ctx, f) });
      const dec = Math.floor(y / 10) * 10;
      if (FD.has(dec)) out.push({ title: `Famine deaths in the ${dec}s: about ${big(FD.get(dec))}`, year: dec, why: "Worldwide, World Peace Foundation list" });
      return out;
    },

    strip: d => { prep(d); return ER.filter(e => e.vei >= 6).map(e => e.y).concat(FAM.filter(f => f.dl >= 1e6).map(f => f.s)); },
  });
})();
