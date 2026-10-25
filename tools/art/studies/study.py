# Palette and era studies rendered on the real terrain rasters (L1), one art px -> 3 screen px.
import sys, math, json, numpy as np
from PIL import Image
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from ramps import RAMPS, EXTRA
T = '/mnt/project-files/atlas/pixel/terrain/terrain_l1.png'
OUT = sys.argv[1]
src = np.array(Image.open(T).convert('RGB'))
H1, W1 = src.shape[:2]
def crop(lon0, lon1, lat0, lat1, w):
    step = (lon1 - lon0) / w; lat_c = (lat0 + lat1) / 2; ys = step * math.cos(math.radians(lat_c)); h = int((lat1 - lat0) / ys)
    lons = lon0 + (np.arange(w) + .5) * step; lats = lat1 - (np.arange(h) + .5) * ys
    cx = ((lons + 180) / 360 * W1).astype(int).clip(0, W1 - 1); cy = ((90 - lats) / 180 * H1).astype(int).clip(0, H1 - 1)
    return src[cy][:, cx]
hexrgb = lambda s: tuple(int(s[i:i + 2], 16) for i in (1, 3, 5))
B4 = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16
WATER = {0, 1, 2, 3, 4}
def h32(x, y): return ((x * 374761393 + y * 668265263) ^ 0x5bd1e995) * 1274126177 & 0xffffffff
def render(a, ramps, mode='v2', ox=0, oy=0):
    cls, hs, el = a[..., 0].astype(int), a[..., 1].astype(float), a[..., 2].astype(float)
    h, w = cls.shape; out = np.zeros((h, w, 3), np.uint8)
    n = len(ramps[0]); pal = {c: np.array([hexrgb(x) for x in ramps[c]]) for c in ramps}
    yy, xx = np.mgrid[0:h, 0:w]
    land = ~np.isin(cls, list(WATER - {4}))
    for c in np.unique(cls):
        m = cls == c; P = pal.get(int(c), pal[10])
        if mode == 'v2' and c in (0, 1):
            # quiet water: depth picks the base, a low-frequency (2x-scaled) Bayer dither blends neighbours
            d = np.clip(el / 255, 0, 1); t = 1.2 + (1 - d) * 1.6
            b = B4[((yy + oy) // 2) % 4, ((xx + ox) // 2) % 4]
            idx = np.clip(np.floor(t + (b - .5) * .45), 0, n - 1).astype(int)
        elif mode == 'v2' and c == 2:
            idx = np.clip(np.floor(2.4 + B4[(yy + oy) % 4, (xx + ox) % 4] * .9), 0, n - 1).astype(int)
        else:
            t = (hs - 128) / 40 * (n - 1) / 2 + (n - 1) / 2
            idx = np.clip(np.floor(t + B4[(yy + oy) % 4, (xx + ox) % 4] - .5), 0, n - 1).astype(int)
        out[m] = P[idx[m]]
    if mode == 'v2':
        # coast: foam on the first water ring, a lighter shelf on the second
        L = land.astype(np.uint8); nb = np.zeros_like(L)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)): nb |= np.roll(np.roll(L, dy, 0), dx, 1)
        ring1 = (~land) & (nb > 0)
        nb2 = np.zeros_like(L); R1 = ring1.astype(np.uint8)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)): nb2 |= np.roll(np.roll(R1, dy, 0), dx, 1)
        ring2 = (~land) & (nb2 > 0) & ~ring1
        out[ring2] = (out[ring2] * .6 + pal[2][4] * .4).astype(np.uint8)
        out[ring1] = hexrgb(EXTRA['foam'])
        # 1-px dark coast edge on land side, only on the south/east faces (light from NW)
        W_ = (~land).astype(np.uint8); edge = land & ((np.roll(W_, -1, 0) > 0) | (np.roll(W_, -1, 1) > 0))
        out[edge] = (out[edge] * .72).astype(np.uint8)
        # sparse wave glyphs on deep water, world-anchored grid
        wave = np.array(hexrgb(EXTRA['wave']))
        for gy in range(0, h - 3, 11):
            for gx in range(0, w - 6, 17):
                r = h32(gx + ox, gy + oy); x0 = gx + (r & 7); y0 = gy + ((r >> 3) & 3)
                if (r >> 8) % 3: continue
                win = cls[y0:y0 + 4, x0 - 2:x0 + 8] if x0 >= 2 else None
                if win is None or win.size < 40 or not np.all(np.isin(win, [0, 1])): continue
                for dx, dy in ((0, 1), (1, 0), (2, 0), (3, 1), (4, 1), (5, 0)): out[y0 + dy, x0 + dx] = wave
        # tree stamps: canopy blob with a warm highlight and violet shadow, on a jittered world grid
        for c in (7, 8, 9):
            P = pal[c]
            for gy in range(1, h - 3, 3):
                for gx in range(1, w - 3, 3):
                    r = h32(gx + ox + c, gy + oy); x0 = gx + (r & 1); y0 = gy + ((r >> 1) & 1)
                    if cls[y0, x0] != c or (r >> 4) % 4 == 0: continue
                    out[y0, x0] = P[4]; out[y0, x0 + 1] = P[3]; out[y0 + 1, x0] = P[2]; out[y0 + 1, x0 + 1] = P[1]; out[y0 + 2, x0 + 1] = P[0]
        # peak stamps: lit NW face, shaded SE face, snow cap on high peaks
        for gy in range(2, h - 4, 6):
            for gx in range(3, w - 4, 8):
                r = h32(gx + ox, gy + oy + 99); x0 = gx + (r & 3) - 1; y0 = gy + ((r >> 2) & 1)
                c = cls[y0, x0]
                if c not in (16, 17) or (el[y0, x0] < 60 and (r >> 5) % 3) or (r >> 5) % 2: continue
                P = pal[16]; lit, sh, ink = P[4], P[0], np.array(hexrgb('#3a2c26'))
                rows = [(0, [0]), (1, [-1, 0, 1]), (2, [-2, -1, 0, 1, 2])]
                for dy, xs in rows:
                    for dx in xs: out[y0 + dy, x0 + dx] = lit if dx <= 0 else sh
                out[y0 + 3, x0 - 3:x0 + 4] = ink
                if c == 17 or el[y0, x0] > 100: out[y0, x0] = hexrgb('#f4f1ea'); out[y0 + 1, x0 - 1] = hexrgb('#e8e4dc')
    return out
def up(img, k=3): return Image.fromarray(img).resize((img.shape[1] * k, img.shape[0] * k), Image.NEAREST)
CUR = {i: t for i, t in enumerate(json.load(open(OUT + '/cur_palette.json')))}
VIEWS = {'med': (-8, 40, 29, 47, 400), 'aegean': (19, 31, 34, 42, 300), 'asia': (60, 150, 5, 55, 420), 'nile': (24, 40, 20, 33, 300)}
res = {}
for name, v in VIEWS.items():
    a = crop(*v)
    up(render(a, CUR, 'cur')).save(f'{OUT}/{name}_current.png')
    img = render(a, RAMPS, 'v2'); np.save(f'{OUT}/{name}_v2.npy', img); np.save(f'{OUT}/{name}_src.npy', a)
    up(img).save(f'{OUT}/{name}_v2.png')
    print(name, a.shape)
