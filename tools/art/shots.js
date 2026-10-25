// Canonical Atlas review: the same views every visual PR is judged on, plus year-step timing.
// Usage: node tools/art/shots.js OUT_DIR [URL]   (URL defaults to http://localhost:8765/atlas.html; see tools/art/README.md)
// Writes OUT_DIR/<view>.png and OUT_DIR/report.json ({views, step: {era: {median, p90}}, pageBytes, errors}).
const { chromium } = require("playwright");
const fs = require("fs");
const out = process.argv[2], url = process.argv[3] || "http://localhost:8765/atlas.html";
if (!out) { console.error("usage: node tools/art/shots.js OUT_DIR [URL]"); process.exit(1); }
fs.mkdirSync(out, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));

// [name, year, view, extra] at 1440x900 unless a viewport is given. Keep this list stable so screenshots compare across PRs.
const VIEWS = [
  ["01-world-1348", 1348, { lon: 20, lat: 20, zoom: 1 }],
  ["02-med-1348", 1348, { lon: 18, lat: 38, zoom: 4 }],
  ["03-italy-1348", 1348, { lon: 12, lat: 43, zoom: 12 }],
  ["04-world-500bce", -500, { lon: 40, lat: 30, zoom: 2 }],
  ["05-rome-117", 117, { lon: 15, lat: 40, zoom: 3 }],
  ["06-asia-1500", 1500, { lon: 110, lat: 30, zoom: 2.5 }],
  ["07-americas-1500", 1500, { lon: -80, lat: 15, zoom: 2 }],
  ["08-europe-1890", 1890, { lon: 15, lat: 50, zoom: 3 }],
  ["09-europe-1914", 1914, { lon: 15, lat: 48, zoom: 3 }],
  ["10-world-2000", 2000, { lon: 0, lat: 20, zoom: 1 }],
  ["11-key-1348", 1348, { lon: 18, lat: 38, zoom: 4 }, "key"],
  ["12-here-1348", 1348, { lon: 18, lat: 38, zoom: 4 }, "here"],
];

(async () => {
  const b = await chromium.launch();
  const errors = [];
  async function open(viewport, scheme = "light") {
    const ctx = await b.newContext({ viewport, colorScheme: scheme, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    p.on("pageerror", e => errors.push(e.message.slice(0, 300)));
    await p.addInitScript(() => { try { localStorage.clear(); } catch (e) { /* storage may be blocked */ } });
    await p.goto(url, { waitUntil: "load", timeout: 180000 });
    await p.waitForFunction(() => window.ATLAS && ATLAS.api, null, { timeout: 60000 });
    await wait(3000);
    return p;
  }
  const go = (p, y, v) => p.evaluate(([y, v]) => { ATLAS.api.setYear(y, false); ATLAS.api.fly(v, 0); }, [y, v]);

  const p = await open({ width: 1440, height: 900 });
  for (const [name, y, v, extra] of VIEWS) {
    await go(p, y, v); await wait(2500);
    if (extra === "key") { await p.keyboard.press("k"); await wait(700); }
    if (extra === "here") { await p.mouse.click(560, 470); await wait(1500); }
    await p.screenshot({ path: `${out}/${name}.png` });
    if (extra === "key") await p.keyboard.press("Escape");
  }

  // Year-step timing, 40 steps per era. sync = the setYear call itself; frame = until the next painted frame,
  // which includes waiting for vsync, so about 16.7 ms is the floor in headless Chromium and spikes above it are real.
  const step = {};
  for (const [era, y0, v] of [["500bce", -500, { lon: 30, lat: 35, zoom: 2 }], ["1300s", 1300, { lon: 15, lat: 45, zoom: 3 }], ["1800s", 1800, { lon: 10, lat: 48, zoom: 3 }]]) {
    await go(p, y0, v); await wait(2000);
    const ts = await p.evaluate(async y0 => {
      const r = [];
      for (let i = 1; i <= 40; i++) {
        const t0 = performance.now();
        ATLAS.api.setYear(y0 + i, false);
        const t1 = performance.now();
        await new Promise(res => requestAnimationFrame(() => setTimeout(res, 0)));
        r.push([t1 - t0, performance.now() - t0]);
      }
      return r;
    }, y0);
    const q = (k, i) => +ts.map(t => t[k]).sort((a, b) => a - b)[i].toFixed(1);
    step[era] = { sync: { median: q(0, 20), p90: q(0, 36) }, frame: { median: q(1, 20), p90: q(1, 36) } };
  }

  const dark = await open({ width: 1440, height: 900 }, "dark");
  await go(dark, 1348, { lon: 18, lat: 38, zoom: 4 }); await wait(2500);
  await dark.screenshot({ path: `${out}/13-dark-1348.png` });
  const phone = await open({ width: 390, height: 844 });
  await phone.screenshot({ path: `${out}/14-phone.png` });

  const pageBytes = await p.evaluate(() => document.documentElement.outerHTML.length);
  const report = { url, when: new Date().toISOString(), views: VIEWS.map(v => v[0]).concat(["13-dark-1348", "14-phone"]), step, pageBytes, errors };
  fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1));
  console.log(JSON.stringify({ step, pageBytes, errors: errors.length }));
  await b.close();
})();
