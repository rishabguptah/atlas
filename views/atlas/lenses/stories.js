// Stories tab: every Story the Atlas can tell, in one list, each one a tap from playing on the map. It also
// starts the Director (views/atlas/world/director.js) and plays the cold open: the first time you come (or after
// half a day away) the Atlas opens on Constantinople in 1453 instead of an empty map.
// Deep link: #story=<story id> plays that story on load; #nostory skips the cold open.
(function () {
  const A = window.ATLAS;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const COLD = "story:constantinople_1453", COLD_KEY = "atlas.coldopen.v1", COLD_GAP = 12 * 3600e3;
  const GROUPS = [["tour", "Guided tours"], ["answer", "Your answers"], ["whatif", "What ifs"], ["storyline", "Up close: Europe 1789–1914"], ["quest", "Trails"],
    ["object", "Object journeys"], ["life", "Lives"], ["simulation", "Living world"]];
  let api = null, el = null;

  const css = document.createElement("style");
  css.textContent = `
.sty { display: grid; gap: 12px; padding: 12px max(16px, env(safe-area-inset-right, 0px)) 24px 14px; }
.sty .lede { margin: 0; font-size: 14.5px; color: var(--ink-soft); }
.sty h3 { font-family: var(--mono); font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: .12em; color: var(--ink-soft); margin: 6px 0 0; display: flex; justify-content: space-between; }
.sty .st { all: unset; box-sizing: border-box; cursor: pointer; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 12px; align-items: start; border: 1px solid var(--rule); background: var(--card); padding: 9px 12px; border-radius: 3px; }
.sty .st:hover, .sty .st:focus-visible { border-color: var(--ink); }
.sty .st .pl { grid-row: 1 / 3; width: 30px; height: 30px; display: grid; place-items: center; background: #221f1a; color: #d8a32c; font-family: "Pixelify Sans", ui-monospace, monospace; font-size: 14px; box-shadow: inset -2px -2px 0 rgba(0,0,0,.3); }
.sty .st b { font-family: var(--fell); font-weight: 400; font-size: 16px; line-height: 1.25; }
.sty .st small { font-size: 13px; color: var(--ink-soft); line-height: 1.35; }
.sty .st .m { font-family: var(--mono); font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-soft); }
.sty .st.seen .pl { color: #8d7a4c; }
.sty .hero { border: 0; background: #221f1a; color: #f6f0dc; box-shadow: 0 0 0 3px #f6f0dc inset, 0 0 0 5px #221f1a inset; padding: 14px 16px; }
.sty .hero b { color: #f6f0dc; font-family: "Pixelify Sans", ui-monospace, monospace; font-size: 16px; }
.sty .hero small, .sty .hero .m { color: #b9b09a; }
.sty .hero .pl { background: #d8a32c; color: #221f1a; }
.sty .keys { font-size: 12.5px; color: var(--ink-soft); margin: 0; }
.sty kbd { font-family: var(--mono); font-size: 11px; border: 1px solid var(--rule); border-radius: 3px; padding: 0 4px; }`;
  document.head.appendChild(css);

  const seen = () => { try { return JSON.parse(localStorage.getItem("atlas.stories.v1") || "{}"); } catch { return {}; } };
  const span = s => { const ts = s.scenes.map(c => c.t).filter(Number.isFinite); if (!ts.length) return ""; const a = Math.min(...ts), b = Math.max(...ts); return a === b ? api.fmtYear(a) : `${api.fmtYear(a)} to ${api.fmtYear(b)}`; };
  function card(s, hero) {
    const sn = seen()[s.id];
    return `<button class="st${hero ? " hero" : ""}${sn ? " seen" : ""}" data-id="${esc(s.id)}"><span class="pl" aria-hidden="true">${sn ? "↺" : "▶"}</span><b>${esc(s.title)}</b>
      <small>${s.blurb ? esc(s.blurb) + " " : ""}<span class="m">${s.scenes.length} scenes · ${esc(span(s))}${s.live ? " · live draft" : ""}</span></small></button>`;
  }
  function liveAnswer() {
    const ans = api.answer;
    return ans && ans.steps && ans.steps.length ? A.world.stories.from.answer(ans) : null;
  }
  function render() {
    if (!el || el.hidden) return;
    const W = A.world.stories, all = W.list(), cold = all.find(s => s.id === COLD), ans = liveAnswer();
    if (ans) all.push(ans);
    const groups = GROUPS.map(([k, n]) => [n, all.filter(s => s.kind === k && s.id !== COLD)]).filter(g => g[1].length);
    el.innerHTML = `<div class="sty">
      <p class="lede">Every story in the Atlas plays on the map: it flies, the year moves, one line tells you what you are looking at. Press <kbd>Space</kbd> for the next scene and <b>Why?</b> when you want the reason.</p>
      ${cold ? card(cold, true) : ""}
      ${groups.map(([n, list]) => `<h3><span>${esc(n)}</span><span>${list.length}</span></h3>${list.map(s => card(s)).join("")}`).join("")}
      ${all.length < 3 ? `<p class="lede">More stories arrive as the page finishes loading.</p>` : ""}
      <p class="keys"><kbd>Space</kbd> or <kbd>→</kbd> next · <kbd>←</kbd> back · <kbd>Enter</kbd> Why? · <kbd>H</kbd> how do we know · <kbd>P</kbd> play by itself · <kbd>Esc</kbd> back to the map</p>
    </div>`;
  }
  function play(id) {
    const ans = liveAnswer();
    const s = ans && ans.id === id ? ans : A.world.stories.get(id);
    if (s) A.world.director.play(s);
  }

  // The cold open: a scene before anything else, unless you were here in the last twelve hours.
  function coldOpen() {
    const h = location.hash || "";
    const m = h.match(/story=([^&]+)/);
    if (m) { const id = decodeURIComponent(m[1]); return waitFor(id, s => A.world.director.play(s)); }
    if (/nostory/.test(h)) return;
    let last = 0; try { last = +localStorage.getItem(COLD_KEY) || 0; } catch { /* no storage: play it */ }
    if (Date.now() - last < COLD_GAP) return;
    waitFor(COLD, s => {
      if (document.activeElement && document.activeElement.closest && document.activeElement.closest("input, textarea")) return;  // someone is already typing
      try { localStorage.setItem(COLD_KEY, String(Date.now())); } catch { /* fine */ }
      A.world.director.play(s);
    });
  }
  // Big lens data may land after the first paint: look again for a few seconds.
  function waitFor(id, fn, n = 0) {
    const s = A.world.stories.get(id);
    if (s) return fn(s);
    if (n < 30) setTimeout(() => waitFor(id, fn, n + 1), 300);
  }

  ATLAS.tab({
    id: "stories", name: "Stories",
    mount(pane, a) {
      el = pane; api = a;
      A.world.director.init(a);
      el.addEventListener("click", ev => { const b = ev.target.closest("[data-id]"); if (b) play(b.dataset.id); });
      // Refresh the list when a story ends, so finished ones show as seen.
      A.world.director.onEnd(() => render());
      setTimeout(coldOpen, 350);
    },
    show() { render(); },
  });
})();
