// Real roads for the recurring travel systems: runs the shared motion model (views/atlas/world/route.js) between
// each flow's consecutive stops, in the middle year of the flow and its main departure month, and writes simplified
// paths to data/world/flow-paths.json ({flow id: [[lon, lat], ...]}). views/atlas/lenses/living.py attaches them.
// Usage: python3 -c "...motion.py build..." > motion.json; node ingest/world/paths.js motion.json
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "../..");
global.window = global;
global.LENS_DATA = { motion: JSON.parse(fs.readFileSync(process.argv[2], "utf8")) };
global.ATLAS = {};
require(path.join(ROOT, "views/atlas/world/route.js"));
const W = ATLAS.world;
const flows = JSON.parse(fs.readFileSync(path.join(ROOT, "data/world/flows.json"), "utf8")).flows;
const out = {};
// Douglas-Peucker in degrees, enough for a map line.
function simplify(p, eps) {
  if (p.length < 3) return p;
  const [a, b] = [p[0], p[p.length - 1]], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1e-9;
  let m = 0, k = 0;
  for (let i = 1; i < p.length - 1; i++) { const d = Math.abs(dy * (p[i][0] - a[0]) - dx * (p[i][1] - a[1])) / L; if (d > m) { m = d; k = i; } }
  return m <= eps ? [a, b] : simplify(p.slice(0, k + 1), eps).slice(0, -1).concat(simplify(p.slice(k), eps));
}
let n = 0, fail = 0;
const t0 = Date.now();
for (const f of flows) {
  const stops = (f.stops || []).filter(s => s.lon != null);
  if (stops.length < 2) continue;
  const y = Math.round(((f.start ?? 1500) + Math.min(f.end ?? 1900, 2000)) / 2), m = (f.depart && f.depart.months && f.depart.months[0]) || 4;
  const pref = f.mode === "sea" ? "sea" : f.mode === "land" ? "land" : "fast";
  let pts = [], ok = true;
  for (let i = 1; i < stops.length; i++) {
    const a = [stops[i - 1].lon, stops[i - 1].lat], b = [stops[i].lon, stops[i].lat];
    let r = null;
    try { r = W.route(a, b, { y: y === 0 ? 1 : y, m }, { pref }); } catch (e) { r = null; }
    let seg = r && r.pts && r.pts.length > 1 ? r.pts : null;
    if (!seg) { ok = false; seg = [a, b]; }
    // The router works on half-degree cells: pin the ends to the real stops.
    seg = [a, ...seg.slice(1, -1), b];
    pts = pts.concat(i > 1 ? seg.slice(1) : seg);
    n++;
  }
  if (!ok) fail++;
  out[f.id] = simplify(pts, 0.08).map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
}
fs.writeFileSync(path.join(ROOT, "data/world/flow-paths.json"), JSON.stringify(out));
console.error(`${Object.keys(out).length} flows, ${n} legs, ${fail} with a straight fallback, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
