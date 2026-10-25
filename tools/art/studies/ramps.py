# Proposed hue-shifted terrain ramps (5 tones each), built in OKLCH. Shadows lean blue-violet, highlights warm.
import math, json
def oklch_to_srgb(L, C, h):
    a, b = C * math.cos(math.radians(h)), C * math.sin(math.radians(h))
    l_ = L + 0.3963377774 * a + 0.2158037573 * b; m_ = L - 0.1055613458 * a - 0.0638541728 * b; s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_ ** 3, m_ ** 3, s_ ** 3
    r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    f = lambda x: 255 * (12.92 * x if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055)
    return tuple(max(0, min(255, round(f(v)))) for v in (r, g, bb))
def srgb_to_oklch(rgb):
    f = lambda c: (c / 255) / 12.92 if c / 255 <= 0.04045 else ((c / 255 + 0.055) / 1.055) ** 2.4
    r, g, b = map(f, rgb)
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b; m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b; s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l, m, s = l ** (1 / 3), m ** (1 / 3), s ** (1 / 3)
    L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s; a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s; bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    return L, math.hypot(a, bb), math.degrees(math.atan2(bb, a)) % 360
hx = lambda c: '#%02x%02x%02x' % c
def mix_h(h, t, f):
    d = ((t - h + 540) % 360) - 180
    return (h + d * f) % 360
def ramp(L, C, h, dL=0.075, shift=0.22, n=5):
    out = []
    for i in range(n):
        k = i - (n - 1) / 2                     # -2..2, dark to light
        hh = mix_h(h, 285 if k < 0 else 85, abs(k) / 2 * shift)   # shadows to violet, lights to warm yellow
        cc = C * (1 - 0.18 * abs(k) / 2) if k < 0 else C * (1 - 0.30 * k / 2)
        out.append(hx(oklch_to_srgb(L + k * dL, cc, hh)))
    return out
# class: (L, C, h) of the mid tone. Chroma kept low for terrain (calm); water cool and quiet.
BASE = {
  0: (0.40, 0.050, 235), 1: (0.46, 0.055, 222), 2: (0.58, 0.060, 205), 3: (0.56, 0.065, 215), 4: (0.60, 0.075, 220),
  5: (0.93, 0.015, 230), 6: (0.70, 0.035, 120), 7: (0.47, 0.050, 165), 8: (0.56, 0.075, 140), 9: (0.50, 0.085, 150),
  10: (0.68, 0.085, 125), 11: (0.74, 0.070, 100), 12: (0.82, 0.070, 82), 13: (0.74, 0.050, 70), 14: (0.60, 0.050, 155),
  15: (0.66, 0.065, 112), 16: (0.62, 0.030, 55), 17: (0.90, 0.012, 250),
}
NAMES = ['deep ocean', 'sea', 'shelf', 'lake', 'river', 'ice', 'tundra', 'boreal forest', 'temperate forest', 'tropical forest',
         'grassland', 'steppe, savanna', 'sand desert', 'rock desert', 'wetland', 'hills', 'mountains', 'high peaks']
RAMPS = {c: ramp(*BASE[c], dL=0.06 if c in (0, 1, 2, 3, 4) else 0.075) for c in BASE}
EXTRA = {'foam': '#e6efe6', 'coast_ink': '#2a3a44', 'wave': '#6f98a6', 'river': '#4f8fb0', 'ink': '#221f1a', 'vellum': '#f6f0dc',
         'gold': '#d8a32c', 'gold_hi': '#f2d27a', 'gold_lo': '#9a6a1a', 'border': '#3b2a20', 'border_hi': '#f0e2c0'}
if __name__ == '__main__':
    print(json.dumps({'names': NAMES, 'ramps': RAMPS, 'extra': EXTRA}, indent=1))
