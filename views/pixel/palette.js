// Pixel map palette: one set of colours for terrain, borders and sprites. See SPEC.md.
(function (global) {
  // Sprite keys: one character per colour. 'x'/'X' are the team colour and its shade, set per sprite instance.
  const KEYS = {
    k: "#221f1a", K: "#4a4035", w: "#f6f0dc", W: "#d9cfb2", s: "#e0a878", S: "#b07850",
    r: "#b8382a", R: "#7c2018", o: "#d8782c", y: "#e8c050", g: "#c89a2a", G: "#8a6418",
    l: "#7fae4a", L: "#4f7a32", e: "#2f5a2e", b: "#3a6a9a", B: "#25466a", c: "#7fc0d0",
    n: "#8a5a32", N: "#5e3a1e", t: "#c8a46a", m: "#9aa0a2", M: "#62686c", p: "#7a4a8a", P: "#4e2c5c",
    v: "#e8e4dc", d: "#3a3430", z: "#c8c8b0",
  };
  // Terrain ramps: five tones, dark to light, made from one mid colour. Every ramp shifts hue: shadows lean
  // blue-violet, highlights lean warm yellow (art direction D3), and terrain stays at or under 45% saturation.
  const hsl = hex => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return [0, 0, l];
    const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, d / (1 - Math.abs(2 * l - 1)), l];
  };
  const hex = (h, s, l) => {
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return "#" + [r, g, b].map(v => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("");
  };
  // Turn hue a toward hue b by at most deg degrees.
  const toward = (a, b, deg) => { const d = ((b - a + 540) % 360) - 180; return (a + Math.sign(d) * Math.min(Math.abs(d), deg) + 360) % 360; };
  function ramp(mid, spread = 1) {
    const [h, s, l] = hsl(mid);
    const DL = [-0.19, -0.095, 0, 0.08, 0.15], HS = [22, 10, 0, 7, 14], SS = [0.7, 0.86, 1, 0.92, 0.8];
    return DL.map((dl, i) => hex(i < 2 ? toward(h, 255, HS[i]) : i > 2 ? toward(h, 50, HS[i]) : h,
      Math.min(0.45, s * SS[i]), Math.max(0.04, Math.min(0.97, l + dl * spread))));
  }
  const RAMPS = {
    // water: quiet, low-contrast ramps (D7)
    deep: ramp("#294660", 0.35), sea: ramp("#2f5170", 0.4), shelf: ramp("#3d6c82", 0.5), shore: ramp("#5c90a0", 0.5),
    lake: ramp("#4a7c92", 0.5), river: ramp("#4f86a2", 0.6),
    // land biomes and their regional variants
    tundra: ramp("#9a9a80", 0.8), taiga: ramp("#3e5c4c"), forest: ramp("#4e7242"), forest_med: ramp("#5e6c40"),
    jungle: ramp("#2e6846"), grass: ramp("#86a456", 0.85), grass_med: ramp("#9c9e64", 0.85), grass_monsoon: ramp("#78a052", 0.85),
    steppe: ramp("#b0aa78", 0.8), savanna: ramp("#bca472", 0.8), prairie: ramp("#b0ac74", 0.8), steppe_outback: ramp("#b8946e", 0.8),
    sand: ramp("#dac498", 0.65), sand_arabia: ramp("#d4b896", 0.7), sand_gobi: ramp("#c4b898", 0.7), sand_outback: ramp("#c4906c", 0.75),
    rock_desert: ramp("#c0a886", 0.7), rock_outback: ramp("#ac7c60", 0.8), wetland: ramp("#6c8a6c", 0.8),
    rock: ramp("#8a7c6e", 1.15), alpine: ramp("#a69a7c", 0.8), snow: ramp("#e2e6e6", 0.7), ice: ramp("#c9d3d6", 0.6),
    beach: ramp("#e0d2a6", 0.6), paddy: ramp("#98b868", 0.8), irrigated: ramp("#7aa056", 0.85), cliff: ramp("#6e6058", 1),
  };
  // Terrain classes (ids from SPEC.md): [dark, mid, light], the middle three tones of each class's ramp.
  const CLASS_RAMP = ["deep", "sea", "shelf", "lake", "river", "ice", "tundra", "taiga", "forest", "jungle", "grass", "steppe",
                      "sand", "rock_desert", "wetland", "steppe", "rock", "snow"];
  const TERRAIN = CLASS_RAMP.map(n => RAMPS[n].slice(1, 4));
  const UI = { ink: "#221f1a", paper: "#f6f0dc", coast: "#e8e0c0", foam: "#a8d0cc", border: "#2a2018", grid: "#ffffff" };
  // Realm tints: muted heraldic colours that read on any terrain.
  const REALM = ["#c0504a", "#d89a3a", "#6a9a4a", "#4a7ab0", "#8a62a8", "#c87848", "#4a9a94", "#a8a040",
                 "#d47a6a", "#a85a88", "#6a80c8", "#b89058", "#7a5a3a", "#5a6a7a", "#b0486a", "#3a7a5a"];
  // Lens families as heraldic tinctures (art direction D4): one hue per family, used by marks, chips, key and panel.
  // The one definition: grammar.js, the page tokens and kit.py all read these. Purpure re-stepped from #8a4fa0 so it
  // parts from Azure under deuteranopia.
  const LENS = { land: "#3f8f5e", power: "#c0392b", wealth: "#d8a32c", peoples: "#d2742c", mind: "#3a6fb8", shocks: "#903f85" };
  // The same six, one step lighter, for panel text and swatches in the dark chronicle. The map itself keeps LENS.
  const LENS_DARK = { land: "#6cbf8a", power: "#e86a5a", wealth: "#e8bf5a", peoples: "#ee9a58", mind: "#7aa6e8", shocks: "#c47ab8" };
  // Colour discipline: realm tints step back so the six tinctures are the loudest colours on the map. A realm's
  // colour moves 35% of the way to vellum and keeps at most 0.30 saturation (sprites keep the full team colour).
  const quietCache = new Map();
  const quiet = c => {
    if (!/^#[0-9a-f]{6}$/i.test(c || "")) return c;
    let q = quietCache.get(c);
    if (!q) {
      const p = UI.paper, m = "#" + [1, 3, 5].map(i => Math.round(parseInt(c.slice(i, i + 2), 16) * 0.65 + parseInt(p.slice(i, i + 2), 16) * 0.35).toString(16).padStart(2, "0")).join("");
      const [h, s, l] = hsl(m); quietCache.set(c, q = hex(h, Math.min(0.3, s), l));
    }
    return q;
  };
  // The pixel world keeps its day inks whatever the page theme (night is a mood painted over the map, not other inks), so
  // a mark's var(--token) is read from the page's light :root values rather than the dark ones the page shows now.
  let DAY = null, daySheets = -1;
  function dayTokens() {
    const n = document.styleSheets.length;
    if (DAY && n === daySheets) return DAY;
    DAY = new Map(); daySheets = n;
    for (const sh of document.styleSheets) {
      let rules; try { rules = sh.cssRules; } catch (e) { continue; } // a cross-origin sheet (fonts)
      for (const r of rules) { // plain style rules only: the dark blocks sit in @media or under :root[data-theme="dark"]
        if (!r.selectorText || !r.style || !r.selectorText.split(",").some(x => x.trim() === ":root")) continue;
        for (let i = 0; i < r.style.length; i++) { const p = r.style[i]; if (p.startsWith("--")) DAY.set(p, r.style.getPropertyValue(p).trim()); }
      }
    }
    return DAY;
  }
  const VAR = /var\(\s*(--[\w-]+)\s*(,[^()]*)?\)/g;
  // day(css colour) -> the same colour with every var() it can resolve replaced by the token's light value
  const day = c => {
    if (typeof c !== "string" || !c.includes("var(") || typeof document === "undefined") return c;
    const T = dayTokens();
    for (let n = 0; n < 8 && c.includes("var("); n++) { const next = c.replace(VAR, (m, name) => T.has(name) ? T.get(name) : m); if (next === c) break; c = next; }
    return c;
  };
  global.PIXEL_PALETTE = { KEYS, TERRAIN, RAMPS, CLASS_RAMP, UI, REALM, LENS, LENS_DARK, quiet, day, ramp };
})(typeof window !== "undefined" ? window : globalThis);
