// Converts the Living Atlas data files (edition 2) into kernel records.
// Usage: node ingest/living-atlas/migrate.js /mnt/project-files/atlas/
// Writes data/living-atlas/{places,polities,events,measures}.jsonl.
// Places and polities are written as stubs: their owning workstreams' records win where they overlap,
// and these fill any fields the owners leave empty.
const fs = require('fs'), path = require('path');
const dir = process.argv[2];
if (!dir) throw new Error('usage: node migrate.js <living atlas folder>');
const files = ['entries.js', 'entries-time.js', 'entries-more.js', 'empires.js'];
const src = files.map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
const { ENTRIES, POP, EVENTS, EMPIRES } = new Function(src + ';return {ENTRIES, POP, EVENTS, EMPIRES}')();

const SRC = [{ cite: 'Living Atlas edition 2: written by Claude from general knowledge, not yet checked against sources' }];
const POP_SRC = [{ cite: 'Living Atlas population estimates, after Chandler, Modelski and site studies; not yet checked' }];
const out = path.join(__dirname, '..', '..', 'data', 'living-atlas');
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const write = (name, recs) => fs.writeFileSync(path.join(out, name), recs.map(r => JSON.stringify(r)).join('\n') + '\n');
const when = (x, r) => {
  if (x.start !== undefined && x.start !== null) r.start = x.start;
  r.end = x.end === undefined ? null : x.end;
  if (x.sa) r.start_approx = true;
  if (x.ea) r.end_approx = true;
  return r;
};

const places = ENTRIES.map((e, i) => {
  const r = { id: 'place:' + e.id, kind: 'place', stub: true, name: e.name };
  if (e.alt) r.alt_names = [].concat(e.alt);
  r.subtype = e.layer === 'wonders' ? 'wonder' : 'city';
  r.lenses = e.layer === 'wonders' ? ['geography', 'ideas'] : ['geography', 'population'];
  if (e.causes && e.causes.length) r.lenses.push('order');
  Object.assign(r, { today: e.today, lat: e.lat, lon: e.lon });
  when(e, r);
  if (e.causes) r.causes = e.causes;
  if (e.seven) r.tags = ['seven_wonders'];
  if (e.lost) r.lost = e.lost;
  Object.assign(r, { what: e.what, why: e.why, links: (e.links || []).map(l => 'place:' + l) });
  Object.assign(r, { sources: SRC, status: 'draft', legacy: { layer: e.layer, order: i } });
  return r;
});

const polities = EMPIRES.map((e, i) => {
  const r = { id: 'polity:' + e.id, kind: 'polity', stub: true, name: e.name, subtype: 'empire', lenses: ['military', 'order'] };
  when(e, r);
  r.peak = e.peak;
  if (e.capital) r.capital = 'place:' + e.capital;
  if (e.cap) r.capital_point = { lon: e.cap[0], lat: e.cap[1], name: e.capName };
  r.ext = { historical_basemaps_names: e.match };
  Object.assign(r, { what: e.what, why: e.why, sources: SRC, status: 'draft', legacy: { order: i } });
  return r;
});

const events = [], seen = new Set();
for (const [pid, list] of Object.entries(EVENTS)) {
  list.forEach(([year, text, bad], i) => {
    let id = 'event:' + pid + '_' + (year < 0 ? 'bc' + -year : year);
    while (seen.has(id)) id += '_b';
    seen.add(id);
    const r = { id, kind: 'event', name: text, place: 'place:' + pid, start: year, end: year, lenses: bad ? ['order'] : ['geography'] };
    if (bad) r.destructive = true;
    Object.assign(r, { sources: SRC, status: 'draft', legacy: { order: i } });
    events.push(r);
  });
}

const measures = Object.entries(POP).map(([pid, pts]) => ({
  id: 'm:population:' + pid + ':living_atlas', kind: 'measure', of: 'place:' + pid, metric: 'population', unit: 'people',
  points: pts, lenses: ['population'], sources: POP_SRC, status: 'draft',
}));

fs.mkdirSync(out, { recursive: true });
write('places.jsonl', places);
write('polities.jsonl', polities);
write('events.jsonl', events);
write('measures.jsonl', measures);
console.log(`places ${places.length}, polities ${polities.length}, events ${events.length}, measures ${measures.length}`);
