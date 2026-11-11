// Atlas smoke walk: builds and serves the page the way perf.js does, then walks it in a real Chromium and fails
// (exit 1) on any page error or console error. perf.js only watches the first paint and year steps; this walks the
// rest: every tab, every lens chip, the map style switches, the shortcuts, the sky, and a run of years, in light,
// dark and phone sizes.
//
//   node tools/perf/smoke.js [--out report.json]
//
// Needs Python 3 (for build.py) and Playwright with Chromium. Data the fixture lacks comes back as a 404, which the
// page handles; "Failed to load resource" console lines are expected for those and are not counted.
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), http = require("http"), zlib = require("zlib"), os = require("os");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "../.."), FIX = path.join(__dirname, "fixture");
const args = process.argv.slice(2), outArg = args.indexOf("--out"), OUT = outArg >= 0 ? args[outArg + 1] : null;
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-smoke-"));

// ---- build and serve, as perf.js does
let inputs = process.env.ATLAS_DIR || "/mnt/project-files/atlas";
if (!fs.existsSync(path.join(inputs, "entries.js"))) {
  inputs = path.join(DIR, "inputs"); fs.mkdirSync(inputs);
  execFileSync("tar", ["xzf", path.join(FIX, "atlas-inputs.tgz"), "-C", inputs]);
}
execFileSync("python3", [path.join(ROOT, "views/atlas/build.py"), path.join(DIR, "raw.html"), inputs], { stdio: ["ignore", "ignore", "inherit"] });
const LIBS = { "lib/d3.min.js": ["https://cdn.jsdelivr.net/npm/d3@7.8.5/dist/d3.min.js", "d3/dist/d3.min.js"],
  "lib/topojson-client.min.js": ["https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js", "topojson-client/dist/topojson-client.min.js"] };
let raw = fs.readFileSync(path.join(DIR, "raw.html"), "utf8");
for (const [local, [cdn, mod]] of Object.entries(LIBS)) {
  const file = [process.cwd(), ROOT].map(d => path.join(d, "node_modules", mod)).find(f => fs.existsSync(f));
  if (file) { fs.mkdirSync(path.join(DIR, "lib"), { recursive: true }); fs.copyFileSync(file, path.join(DIR, local)); raw = raw.split(cdn).join(local); }
}
fs.writeFileSync(path.join(DIR, "atlas.html"), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0">' + raw + "</body></html>");
const TYPES = { ".html": "text/html", ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".js": "text/javascript" };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "");
  if (u.includes("..")) { res.writeHead(400); return res.end(); }
  let file = path.join(DIR, u), gz = false;
  if (u.startsWith("borders-time/")) { file = path.join(FIX, u); if (!fs.existsSync(file) && fs.existsSync(file + ".gz")) { file += ".gz"; gz = true; } }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  let body = fs.readFileSync(file); if (gz) body = zlib.gunzipSync(body);
  res.writeHead(200, { "content-type": TYPES[path.extname(file.replace(/\.gz$/, ""))] || "application/octet-stream", "content-length": body.length });
  res.end(body);
});

const RUNS = [
  { name: "desktop light", viewport: { width: 1440, height: 900 }, colorScheme: "light" },
  { name: "desktop dark", viewport: { width: 1440, height: 900 }, colorScheme: "dark" },
  { name: "phone", viewport: { width: 390, height: 844 }, colorScheme: "light", isMobile: true, hasTouch: true },
];
const YEARS = [-3000, -500, 0, 750, 1100, 1453, 1650, 1800, 1914, 1945, 2000];
const KEYS = ["k", "k", "?", "Escape", "t", "t", "t", "0", ".", ",", "r", "n", "n", "Escape"];

(async () => {
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const URL0 = `http://127.0.0.1:${server.address().port}/atlas.html`;
  const b = await chromium.launch();
  const report = { runs: [] }; let total = 0;
  for (const run of RUNS) {
    const ctx = await b.newContext({ viewport: run.viewport, colorScheme: run.colorScheme, isMobile: !!run.isMobile, hasTouch: !!run.hasTouch });
    const p = await ctx.newPage();
    let step = "load"; const errors = [], steps = [];
    p.on("pageerror", e => errors.push(`[${step}] ${e.message}`));
    p.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`[${step}] console: ${m.text()}`); });
    const go = async (name, fn) => { step = name; try { await fn(); } catch (e) { errors.push(`[${name}] walk: ${e.message.split("\n")[0]}`); } steps.push(name); await p.waitForTimeout(250); };
    await go("load", async () => { await p.goto(URL0, { waitUntil: "load", timeout: 120000 }); await p.waitForFunction(() => window.ATLAS && ATLAS.api && window.__map, null, { timeout: 90000 }); });
    // Every tab, by its own button where it has one, else through the API.
    const tabs = await p.evaluate(() => [...new Set(["guide", "now", "here", ...(ATLAS.tabs || []).filter(Boolean).map(d => d.id)])]);
    for (const t of tabs) await go("tab " + t, async () => {
      const btn = p.locator(`.tab[data-tab="${t}"]:visible`).first();
      if (await btn.count()) await btn.click({ timeout: 3000 }); else await p.evaluate(id => ATLAS.api.setTab(id), t);
      await p.waitForTimeout(300);
    });
    await go("tab guide again", () => p.evaluate(() => ATLAS.api.setTab("guide")));
    // Every family chip, then every lens and style chip under it, on and back off.
    const fams = await p.locator(".layers:not(.sub) .chip[data-k]").evaluateAll(els => els.map(e => e.dataset.k));
    for (const f of fams) {
      await go("family " + f, async () => {
        await p.locator(`.layers:not(.sub) .chip[data-k="${f}"]`).first().click({ timeout: 3000 });
        const subs = await p.locator(".layers.sub .chip[data-k]:visible, .layers.sub [data-style]:visible").evaluateAll(els => els.map(e => e.dataset.k ? "k:" + e.dataset.k : "s:" + e.dataset.style));
        for (const s of subs) {
          step = `family ${f} > ${s}`;
          const sel = s.startsWith("k:") ? `.layers.sub .chip[data-k="${s.slice(2)}"]` : `.layers.sub [data-style="${s.slice(2)}"]`;
          await p.locator(sel).first().click({ timeout: 3000 }); await p.waitForTimeout(120);
          if (s.startsWith("k:")) { await p.locator(sel).first().click({ timeout: 3000 }); await p.waitForTimeout(80); }
        }
      });
    }
    // A run of years with whatever lenses are on, then a fly-in and back out.
    for (const y of YEARS) await go("year " + y, () => p.evaluate(y => ATLAS.api.setYear(y, false), y));
    await go("fly to Constantinople", () => p.evaluate(() => ATLAS.api.fly({ lon: 28.97, lat: 41.01, span: 8 }, 0)));
    await go("year step close in", () => p.evaluate(() => ATLAS.api.setYear(1454, false)));
    await go("whole world", () => p.keyboard.press("0"));
    // The shortcuts, with focus on the map.
    await p.mouse.click(run.viewport.width * 0.6, run.viewport.height * 0.5).catch(() => {});
    for (const k of KEYS) await go("key " + k, () => p.keyboard.press(k));
    // The page's own theme switch, both ways, so the sky follows it on a live page.
    await go("theme dark", () => p.evaluate(() => { document.documentElement.dataset.theme = "dark"; }));
    await go("theme light", () => p.evaluate(() => { document.documentElement.dataset.theme = "light"; }));
    await go("settle", () => p.waitForTimeout(1500));
    report.runs.push({ name: run.name, steps: steps.length, tabs, families: fams, errors: [...new Set(errors)] });
    total += new Set(errors).size;
    await ctx.close();
  }
  await b.close(); server.close();
  const lines = ["## Atlas smoke walk", "", "| run | steps | tabs | families | errors |", "|---|---:|---:|---:|---:|"];
  for (const r of report.runs) lines.push(`| ${r.name} | ${r.steps} | ${r.tabs.length} | ${r.families.length} | ${r.errors.length} |`);
  for (const r of report.runs) if (r.errors.length) lines.push("", `**${r.name}**`, ...r.errors.slice(0, 25).map(e => "- `" + e.slice(0, 240).replace(/`/g, "'") + "`"));
  const md = lines.join("\n");
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  if (total) { console.error(`smoke: ${total} distinct errors`); process.exit(1); }
})().catch(e => { console.error(e); server.close(); process.exit(1); });
