// Checks that the kernel reproduces the Living Atlas data exactly.
// Usage: node views/living-atlas/roundtrip.test.js <living atlas folder> <exported.js>
const fs = require('fs'), path = require('path'), assert = require('assert');
const [dir, exported] = process.argv.slice(2);
const load = src => new Function(src + ';return {ENTRIES, POP, EVENTS, EMPIRES}')();
const a = load(['entries.js', 'entries-time.js', 'entries-more.js', 'empires.js'].map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n'));
const b = load(fs.readFileSync(exported, 'utf8'));
const norm = x => JSON.parse(JSON.stringify(x));
const byId = l => Object.fromEntries(norm(l).map(e => [e.id, e]));
const sortEv = o => Object.fromEntries(Object.entries(norm(o)).map(([k, v]) => [k, v.slice().sort((x, y) => x[0] - y[0])]));
assert.deepStrictEqual(byId(b.ENTRIES), byId(a.ENTRIES));
assert.deepStrictEqual(b.ENTRIES.map(e => e.id), a.ENTRIES.map(e => e.id));
assert.deepStrictEqual(norm(b.POP), norm(a.POP));
assert.deepStrictEqual(sortEv(b.EVENTS), sortEv(a.EVENTS));
assert.deepStrictEqual(byId(b.EMPIRES), byId(a.EMPIRES));
console.log(`round trip ok: ${a.ENTRIES.length} places, ${Object.keys(a.POP).length} population series, ${a.EMPIRES.length} empires`);
