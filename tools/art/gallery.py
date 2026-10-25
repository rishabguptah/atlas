# Before/after gallery for two shots.js runs: python3 tools/art/gallery.py BEFORE_DIR AFTER_DIR OUT.html
# Each view gets a drag-to-compare frame; the step timings and page size of both runs sit at the top.
import sys, os, json, base64, html
before, after, out = sys.argv[1:4]
rep = lambda d: json.load(open(os.path.join(d, 'report.json'))) if os.path.exists(os.path.join(d, 'report.json')) else {}
rb, ra = rep(before), rep(after)
uri = lambda p: 'data:image/png;base64,' + base64.b64encode(open(p, 'rb').read()).decode()
names = sorted(f[:-4] for f in os.listdir(after) if f.endswith('.png') and os.path.exists(os.path.join(before, f)))
def steps(r): return ' · '.join(f"{k} sync {v['sync']['median']} / {v['sync']['p90']} ms, frame {v['frame']['median']} / {v['frame']['p90']} ms" for k, v in (r.get('step') or {}).items()) or 'no timing'
rows = ''.join(f'''<figure><figcaption>{html.escape(n)}</figcaption><div class="c" style="--x:50%"><img src="{uri(os.path.join(after, n + '.png'))}" alt="after">
<div class="t"><img src="{uri(os.path.join(before, n + '.png'))}" alt="before"></div><i></i><span class="l">Before</span><span class="r">After</span>
<input type="range" min="0" max="100" value="50" aria-label="Compare {html.escape(n)}" oninput="this.parentNode.style.setProperty('--x', this.value + '%')"></div></figure>''' for n in names)
open(out, 'w').write(f'''<!doctype html><meta charset="utf-8"><title>Atlas before and after</title>
<style>body{{background:#ece3c8;color:#221f1a;font:16px/1.5 Georgia,serif;margin:0;padding:24px max(16px,env(safe-area-inset-left))}}h1{{font:600 28px/1.1 monospace}}
figure{{margin:0 0 32px}}figcaption{{font:12px monospace;letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px}}
.c{{position:relative;border:3px solid #221f1a;max-width:1440px}}.c img{{display:block;width:100%;height:auto}}.t{{position:absolute;inset:0;clip-path:inset(0 calc(100% - var(--x)) 0 0)}}
.c i{{position:absolute;top:0;bottom:0;left:var(--x);width:3px;background:#f6f0dc;box-shadow:0 0 0 2px #221f1a}}.c span{{position:absolute;top:8px;background:#221f1a;color:#f6f0dc;font:11px monospace;padding:2px 6px}}
.l{{left:8px}}.r{{right:8px}}.c input{{position:absolute;inset:0;width:100%;height:100%;opacity:0;margin:0;cursor:ew-resize}}</style>
<h1>Atlas before and after</h1><p>Year step median / p90. Before: {html.escape(steps(rb))}. After: {html.escape(steps(ra))}.<br>
Page size: {rb.get('pageBytes', '?')} → {ra.get('pageBytes', '?')} characters. Page errors: {len(rb.get('errors', []))} → {len(ra.get('errors', []))}.</p>{rows}''')
print(out, len(names), 'views')
