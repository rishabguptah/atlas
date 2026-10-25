# Era grades on the v2 study: same pixels, different chronicle. Grade = per-pixel map; no new renderer.
import sys, numpy as np
from PIL import Image
OUT = sys.argv[1]; NAME = sys.argv[2] if len(sys.argv) > 2 else 'med'
img = np.load(f'{OUT}/{NAME}_v2.npy').astype(float); a = np.load(f'{OUT}/{NAME}_src.npy')
cls, hs, el = a[..., 0].astype(int), a[..., 1].astype(float), a[..., 2].astype(float)
h, w = cls.shape; yy, xx = np.mgrid[0:h, 0:w]
water = np.isin(cls, [0, 1, 2, 3]); land = ~water
hexrgb = lambda s: np.array([int(s[i:i + 2], 16) for i in (1, 3, 5)], float)
lum = (img @ np.array([.299, .587, .114])) / 255
B4 = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16
bay = B4[yy % 4, xx % 4]
def dist_from(mask, n=24):
    d = np.full(mask.shape, n, int); cur = mask.copy()
    for i in range(n):
        d[cur & (d == n)] = i
        nb = cur.copy()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)): nb |= np.roll(np.roll(cur, dy, 0), dx, 1)
        cur = nb
    return d
dcoast = dist_from(land)        # distance of water pixels from land
def ramp_map(t, stops):
    t = np.clip(t, 0, 1); xs = np.linspace(0, 1, len(stops)); cs = np.array([hexrgb(s) for s in stops])
    return np.stack([np.interp(t, xs, cs[:, k]) for k in range(3)], -1)
def quant(t, stops, dither=.5):
    n = len(stops); i = np.clip(np.floor(t * (n - 1) + .5 + (bay - .5) * dither), 0, n - 1).astype(int)
    return np.array([hexrgb(s) for s in stops])[i]
def shade(t): return np.clip(np.floor((hs - 128) / 36 + bay), -1, 1)
def save(o, tag): Image.fromarray(np.clip(o, 0, 255).astype(np.uint8)).resize((w * 3, h * 3), Image.NEAREST).save(f'{OUT}/{NAME}_era_{tag}.png')
ink = hexrgb('#221f1a')
# 1 Antiquity: terracotta and papyrus. Duotone land, ochre-teal sea, coast in red ochre.
o = img.copy()
o[land] = quant(lum * 1.15, ['#5a3220', '#8a4e2c', '#b87444', '#d8a46a', '#ecd2a0', '#f4e4bc'], .8)[land]
o[water] = quant(1 - np.clip(dcoast / 20, 0, 1), ['#2e4a48', '#3c5e58', '#557a6c', '#7a9a84'], .7)[water]
o[(dcoast == 1)] = hexrgb('#e9d6a8'); save(o, 'antiquity')
# 2 Medieval: illuminated manuscript. Lapis sea, vellum land with green and ochre, gold coastline, vermilion rivers.
o = img.copy()
o[land] = img[land] * .35 + hexrgb('#efe2bc') * .65
o[land & np.isin(cls, [7, 8, 9])] = img[land & np.isin(cls, [7, 8, 9])] * .55 + hexrgb('#5f8a4a') * .45
o[water] = quant(np.clip(dcoast / 14, 0, 1), ['#4a78c0', '#2f5aa8', '#22448a', '#1a3470'], .6)[water]
o[dcoast == 1] = hexrgb('#d8a32c'); o[dcoast == 2] = hexrgb('#f2d27a') * .5 + o[dcoast == 2] * .5
o[cls == 4] = hexrgb('#b8382a'); save(o, 'medieval')
# 3 Early modern: copperplate. Sepia monochrome land with hatched shading, water-lining along coasts.
sep = ['#2e2218', '#5a4430', '#8a7050', '#bca684', '#e6d8b8', '#f4ead2']
o = quant(lum * 1.1, sep, .9)
o[water] = hexrgb('#efe4c8')
wl = water & (dcoast % 3 == 1) & (dcoast < 13)
o[wl] = hexrgb('#9a8466') * (1 - dcoast[wl, None] / 26) + hexrgb('#efe4c8') * (dcoast[wl, None] / 26)
hatch = land & ((xx + yy) % 3 == 0) & (hs < 118); o[hatch] = hexrgb('#5a4430')
o[dcoast == 1] = hexrgb('#2e2218'); save(o, 'copperplate')
# 4 Long 19th century: Bartholomew layer tints from elevation, pastel sea bands by depth.
e = el * 25  # metres
lt = np.select([e < 100, e < 300, e < 600, e < 1000, e < 1500, e < 2500], [0, 1, 2, 3, 4, 5], 6)
LT = np.array([hexrgb(s) for s in ['#a9c98f', '#cfdc9f', '#ecdfa6', '#e2c58e', '#cfa074', '#b07c58', '#f2ece2']])
o = LT[lt]; o = o * (1 + np.clip((hs - 128) / 255, -.18, .12))[..., None]
dep = el * 40
st = np.select([dep < 200, dep < 1000, dep < 3000], [0, 1, 2], 3)
SB = np.array([hexrgb(s) for s in ['#dcecf0', '#c2e0ea', '#a6d0e0', '#8cbfd6']])
o[water] = SB[st][water]; o[dcoast == 1] = hexrgb('#5f8fae')
o[cls == 4] = hexrgb('#4f86b6'); save(o, 'bartholomew')
# 5 20th century: flat offset print. Two flat land colours, flat sea, halftone relief dots.
o = np.where(land[..., None], hexrgb('#efe5c8'), hexrgb('#a9cbd8'))
o[land & (el > 30)] = hexrgb('#e4d4ae')
dots = land & (hs < 112) & ((xx % 3 == 0) & (yy % 3 == 0)); o[dots] = hexrgb('#a08a6a')
o[water & (dcoast == 1)] = hexrgb('#5a8aa0'); o[cls == 4] = hexrgb('#5a8aa0'); save(o, 'offset')
# 6 Now: clean contemporary. The v2 ramps, desaturated a step, crisper coast.
g = lum[..., None] * 255; o = img * .78 + g * .22
o[dcoast == 1] = hexrgb('#f2f4f0'); save(o, 'now')
print('ok')
