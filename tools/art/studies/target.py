# Target frame: v2 terrain + realm tints + pixel borders for one year, same crop as the study.
import sys, json, math, numpy as np
from PIL import Image, ImageDraw
OUT, NAME, YEAR = sys.argv[1], sys.argv[2], sys.argv[3]
VIEW = {'med': (-8, 40, 29, 47, 400), 'aegean': (19, 31, 34, 42, 300)}[NAME]
lon0, lon1, lat0, lat1, W = VIEW
step = (lon1 - lon0) / W; ys = step * math.cos(math.radians((lat0 + lat1) / 2)); H = int((lat1 - lat0) / ys)
img = np.load(f'{OUT}/{NAME}_v2.npy').astype(float); src = np.load(f'{OUT}/{NAME}_src.npy')
cls = src[..., 0]; water = np.isin(cls, [0, 1, 2, 3])
topo = json.load(open(f'/mnt/project-files/atlas/borders-precise/l1/world_{YEAR}.json'))
sc, tr = topo['transform']['scale'], topo['transform']['translate']
arcs = []
for a in topo['arcs']:
    x = y = 0; pts = []
    for dx, dy in a: x += dx; y += dy; pts.append((x * sc[0] + tr[0], y * sc[1] + tr[1]))
    arcs.append(pts)
def ring(ix):
    pts = []
    for i in ix:
        a = arcs[i] if i >= 0 else arcs[~i][::-1]
        pts.extend(a if not pts else a[1:])
    return pts
S = 4  # supersample the id buffer, then take the majority-free nearest centre sample
idimg = Image.new('I', (W * S, H * S), 0); dr = ImageDraw.Draw(idimg)
toxy = lambda p: ((p[0] - lon0) / step * S, (lat1 - p[1]) / ys * S)
realms = []
for g in topo['objects']['realms1']['geometries']:
    polys = g['arcs'] if g['type'] == 'MultiPolygon' else [g['arcs']]
    realms.append(g['properties']); rid = len(realms)
    for poly in polys:
        for k, r in enumerate(poly):
            pts = [toxy(p) for p in ring(r)]
            if len(pts) > 2: dr.polygon(pts, fill=rid if k == 0 else 0)
ids = np.array(idimg)[S // 2::S, S // 2::S][:H, :W]
ids[water] = 0
hexrgb = lambda s: np.array([int(s[i:i + 2], 16) for i in (1, 3, 5)], float)
# heraldic realm tints (muted), picked by realm n so a realm keeps its colour across years
TINT = ['#b04a3c', '#c88a34', '#5f8a46', '#3f6aa0', '#7a5698', '#b8683c', '#3f8a84', '#9a9038', '#c46a5c', '#985078', '#5a70b8', '#a8804c']
out = img.copy(); yy, xx = np.mgrid[0:H, 0:W]
for rid in np.unique(ids):
    if rid == 0: continue
    m = ids == rid; c = hexrgb(TINT[realms[rid - 1]['n'] % len(TINT)])
    out[m] = out[m] * (1 - .30) + (out[m] / 255 * c) * .30 + c * .12 - 255 * .02   # multiply-ish wash that keeps terrain readable
    # 1-px inner glow along the realm edge in the realm colour (CK3/EU4 feel, in pixels)
    e = m & ((np.roll(ids, 1, 0) != rid) | (np.roll(ids, -1, 0) != rid) | (np.roll(ids, 1, 1) != rid) | (np.roll(ids, -1, 1) != rid))
    inner = m & ~e & ((np.roll(e, 1, 0)) | (np.roll(e, -1, 0)) | (np.roll(e, 1, 1)) | (np.roll(e, -1, 1)))
    out[inner] = out[inner] * .45 + c * .55
# borders: 1 art px dark line where two land realms meet; lighter dashed line where unclaimed land meets a realm
diff = (ids != np.roll(ids, 1, 1)) | (ids != np.roll(ids, 1, 0))
bothland = ~water & ~np.roll(water, 1, 1) & ~np.roll(water, 1, 0)
hard = diff & bothland & (ids > 0) & (np.roll(ids, 1, 1) > 0) & (np.roll(ids, 1, 0) > 0)
out[hard] = hexrgb('#3b2a20'); soft = diff & bothland & ~hard & ((xx + yy) % 3 != 0); out[soft] = hexrgb('#6a5440')
Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).resize((W * 3, H * 3), Image.NEAREST).save(f'{OUT}/{NAME}_target_{YEAR}.png')
np.save(f'{OUT}/{NAME}_target_{YEAR}.npy', np.clip(out, 0, 255).astype(np.uint8))
# label anchors: centroid, area and long-axis angle for each realm big enough to name
labs = []
for rid in np.unique(ids):
    if rid == 0: continue
    py, px = np.nonzero(ids == rid)
    if len(px) < 120: continue
    cx, cy = px.mean(), py.mean(); C = np.cov(np.vstack([px - cx, py - cy])); ev, evec = np.linalg.eigh(C)
    v = evec[:, 1]; ang = math.degrees(math.atan2(v[1], v[0]))
    if ang > 90: ang -= 180
    if ang < -90: ang += 180
    ang = max(-28, min(28, ang))
    labs.append({'name': realms[rid - 1]['name'], 'x': round(float(cx), 1), 'y': round(float(cy), 1), 'area': int(len(px)), 'ang': round(ang, 1),
                 'span': round(float(2.2 * math.sqrt(ev[1])), 1)})
labs.sort(key=lambda d: -d['area'])
json.dump({'w': W, 'h': H, 'lon0': lon0, 'lat1': lat1, 'step': step, 'ys': ys, 'labels': labs}, open(f'{OUT}/{NAME}_labels_{YEAR}.json', 'w'))
print(len(labs), [l['name'] for l in labs[:14]])
