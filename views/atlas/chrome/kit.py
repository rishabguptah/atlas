# The Atlas chrome kit: the chronicle around the pixel world (art direction D1-D4).
# One place makes the interface's colour tokens (from views/pixel/palette.js), its 9-slice pixel frames
# and its pixel icons. build.py calls css() and icons_js() and inlines them; preview.py uses the same calls.
# Frames and icons are text grids, 1 art px = 2 CSS px in the chrome (the map itself uses 3).
import re, os, json, colorsys
from urllib.parse import quote

HERE = os.path.dirname(os.path.abspath(__file__))
PALETTE = os.path.join(HERE, '..', '..', 'pixel', 'palette.js')

# Heraldic tinctures, one per lens family (D4). palette.js carries them as TINCTURE when present.
TINCTURES = {'land': '#3f8f5e', 'power': '#c0392b', 'wealth': '#d8a32c', 'peoples': '#d2742c', 'mind': '#3a6fb8', 'shocks': '#8a4fa0'}


def palette():
    """Hex values out of palette.js: KEYS, UI and (if there) TINCTURE, without running JS."""
    src = open(PALETTE, encoding='utf-8').read()
    def block(name):
        m = re.search(r'const ' + name + r'\s*=\s*\{(.*?)\};', src, re.S)
        return dict(re.findall(r'(\w+):\s*"(#[0-9a-fA-F]{6})"', m.group(1))) if m else {}
    t = block('TINCTURE')
    return {'keys': block('KEYS'), 'ui': block('UI'), 'tincture': {k: t.get(k, v) for k, v in TINCTURES.items()}}


def _rgb(h): return tuple(int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))
def _hex(r, g, b): return '#%02x%02x%02x' % tuple(max(0, min(255, round(v * 255))) for v in (r, g, b))


def ramp(base):
    """Five steps, hue-shifted (D3): shadows lean blue-violet, highlights lean warm yellow."""
    h, l, s = colorsys.rgb_to_hls(*_rgb(base))
    def toward(h0, target, t):
        d = ((target - h0 + 0.5) % 1) - 0.5
        return (h0 + d * t) % 1
    out = []
    for dl, hue_t, ds in ((-0.24, 0.16, -0.10), (-0.12, 0.08, -0.04), (0, 0, 0), (0.13, 0.08, 0.02), (0.30, 0.16, -0.10)):
        target = 0.70 if dl < 0 else 0.14
        hh = toward(h, target, hue_t) if dl else h
        out.append(_hex(*colorsys.hls_to_rgb(hh, max(0.04, min(0.96, l + dl)), max(0, min(1, s + ds)))))
    return out


def tokens():
    p = palette()
    k, ui = p['keys'], p['ui']
    ink, vel = ui.get('ink', '#221f1a'), ui.get('paper', '#f6f0dc')
    light = {
        'ink': ink, 'ink-2': k.get('K', '#4a4035'), 'ink-soft': '#5e5444',
        'vellum': vel, 'vellum-2': '#ece3c6', 'vellum-3': k.get('W', '#d9cfb2'), 'vellum-hi': '#fffaea',
        'gold': p['tincture']['wealth'], 'gold-2': k.get('G', '#8a6418'), 'gold-hi': k.get('y', '#e8c050'),
        'rubric': k.get('r', '#b8382a'), 'lapis': k.get('B', '#25466a'),
        'shade': 'rgba(34, 31, 26, .55)', 'wash': 'rgba(34, 31, 26, .07)',
        'sea': '#264658', 'hud': '#1d1a16', 'hud-ink': vel,
    }
    # Night chronicle: candlelit umber vellum, the same frames, the same tinctures one step brighter.
    dark = dict(light, **{
        'ink': '#f1e7cc', 'ink-2': '#d9cba6', 'ink-soft': '#b5a785',
        'vellum': '#2b251d', 'vellum-2': '#342d23', 'vellum-3': '#4a3f30', 'vellum-hi': '#3d3427',
        'gold-2': '#a77a22', 'lapis': '#8fb4e0', 'rubric': '#e0705e', 'line': '#0e0c09', 'wash': 'rgba(241, 231, 204, .08)', 'shade': 'rgba(0, 0, 0, .6)',
    })
    tint = {}
    for fam, base in p['tincture'].items():
        r = ramp(base)
        tint.update({f't-{fam}': base, f't-{fam}-dk': r[1], f't-{fam}-dkk': r[0], f't-{fam}-lt': r[3], f't-{fam}-hi': r[4]})
    return light, dark, tint


# ---------- 9-slice frames ----------
# Each frame is a square grid; the corner size c is the slice. Keys: k ink, K ink-2, w vellum, W vellum-3, h vellum-hi,
# g gold, G gold-2, y gold-hi, d dark hud, D hud-2, '.' clear. Grids are drawn by a function so all four corners match.

def _frame(corner, edge, fill):
    """corner: the top-left c x c grid ('.' clear, 'F' fill); edge: keys from the outside in for the straight sides
    (shorter than c means fill after it). Mirrored to all four corners. A bevel follows: 'h' cells whose nearest side
    is the bottom or the right become 'W' (light from the top left)."""
    c = len(corner); n = 2 * c + 2
    depth = lambda y, x: min(y, x, n - 1 - y, n - 1 - x)
    g = [[edge[depth(y, x)] if depth(y, x) < len(edge) else fill for x in range(n)] for y in range(n)]
    for y in range(c):
        for x in range(c):
            ch = corner[y][x]
            if ch == 'F': continue
            g[y][x] = g[y][n - 1 - x] = g[n - 1 - y][x] = g[n - 1 - y][n - 1 - x] = ch
    for y in range(n):
        for x in range(n):
            if g[y][x] == 'h' and depth(y, x) < len(edge) and min(n - 1 - y, n - 1 - x) < min(y, x):
                g[y][x] = 'W'
    return c, [''.join(r) for r in g]


def frames():
    f = {}
    # Panel: 2-art-px ink frame, a highlight/shade bevel inside, a gold stud at each corner.
    f['panel'] = _frame(['..kkk',
                         '.kyGk',
                         'kygGk',
                         'kGGkk',
                         'kkkFF'], 'kkh', 'w')
    # Card: one ink line, a bevel, cut corners. Lives inside panels.
    f['card'] = _frame(['.kk', 'khh', 'khF'], 'kh', 'w')
    # The one card you should do next: gold inner rule.
    f['card-gold'] = _frame(['.kk', 'kgg', 'kgF'], 'kg', 'w')
    # Chip: an octagon, ink line, the middle is clear so CSS can tint it.
    f['chip'] = _frame(['..k', '.k.', 'k..'], 'k', '.')
    # Button: ink face with a gold rule.
    f['button'] = _frame(['..k', '.kG', 'kGK'], 'kG', 'K')
    # Quiet button: vellum face, ink line, bevel.
    f['button-q'] = _frame(['..k', '.kh', 'khF'], 'kh', 'w')
    # Plate (year cartouche): ink, gold, ink, vellum, with rounded scroll corners.
    f['plate'] = _frame(['...kk',
                         '..kgg',
                         '.kgkk',
                         'kgkFF',
                         'kgkFF'], 'kgkh', 'w')
    # Hud: dark frame for the map's instruments (minimap, compass, scale).
    f['hud'] = _frame(['..kk', '.kGG', 'kGkk', 'kGkF'], 'kGk', 'd')
    # Inset (input wells): sunk, shade along the top and left.
    f['inset'] = _frame(['.kk', 'kWW', 'kWF'], 'kW', 'h')
    return f


def _svg(rows, cmap):
    """Grid -> crisp SVG with one rect per horizontal run."""
    h, w = len(rows), len(rows[0])
    out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" shape-rendering="crispEdges">']
    for y, r in enumerate(rows):
        x = 0
        while x < w:
            ch = r[x]
            if ch in '. ':
                x += 1; continue
            x2 = x
            while x2 < w and r[x2] == ch: x2 += 1
            out.append(f'<rect x="{x}" y="{y}" width="{x2 - x}" height="1" fill="{cmap[ch]}"/>')
            x = x2
    out.append('</svg>')
    return ''.join(out)


def _uri(svg): return 'url("data:image/svg+xml,' + quote(svg, safe='') + '")'


def _png(rows, cmap):
    """Grid -> tiny PNG data URI (a 12x12 frame is ~150 bytes)."""
    import io, base64, zlib, struct
    h, w = len(rows), len(rows[0])
    raw = b''
    for r in rows:
        raw += b'\0'
        for ch in r:
            if ch in '. ': raw += b'\0\0\0\0'
            else:
                c = cmap[ch]
                if c.startswith('rgba'):
                    v = [float(t) for t in c[5:-1].split(',')]; raw += bytes([int(v[0]), int(v[1]), int(v[2]), round(v[3] * 255)])
                else: raw += bytes(int(c[i:i + 2], 16) for i in (1, 3, 5)) + b'\xff'
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    return 'url("data:image/png;base64,' + base64.b64encode(png).decode() + '")'


def _cmap(t):
    return {'k': t.get('line', t['ink']), 'K': t['ink-2'], 'w': t['vellum'], 'W': t['vellum-3'], 'h': t['vellum-hi'],
            'g': t['gold'], 'G': t['gold-2'], 'y': t['gold-hi'], 'd': t['hud'], 'D': '#2c2822'}


# ---------- icons ----------
# 12x12 art px (24 CSS px). x = the icon's tint (currentColor or a tincture), X = its shade, k ink, w vellum,
# y gold-hi, g gold. Inline <svg> so the tint follows CSS.
ICONS = {
    'play': [
        '............', '..kk........', '..kwk.......', '..kxxk......', '..kxxxk.....', '..kxxxxk....',
        '..kxxxxk....', '..kxxxk.....', '..kxxk......', '..kXk.......', '..kk........', '............'],
    'pause': [
        '............', '..kkk..kkk..', '..kwk..kwk..', '..kxk..kxk..', '..kxk..kxk..', '..kxk..kxk..',
        '..kxk..kxk..', '..kxk..kxk..', '..kxk..kxk..', '..kXk..kXk..', '..kkk..kkk..', '............'],
    'back': [
        '............', '.kk.....kk..', '.kxk...kxk..', '.kxxk.kxxk..', '.kxxxkxxxk..', '.kxxxxxxxk..',
        '.kxxxxxxxk..', '.kxxxkxxxk..', '.kxxk.kxxk..', '.kXk...kXk..', '.kk.....kk..', '............'][::1],
    # Land: a mountain with snow over a hill.
    'land': [
        '............', '.....kk.....', '....kwwk....', '...kwwxXk...', '...kxxxXk.k.', '..kxxxxXXkwk',
        '..kxxxXXXkxk', '.kxxxxXXXXXk', '.kxxxXXXXXXk', 'kxxxXXXXXXXk', 'kkkkkkkkkkkk', '............'],
    # Power: a crown.
    'power': [
        '............', '.k...kk...k.', 'kyk.kyyk.kyk', 'kxk.kxxk.kxk', 'kxxkxxxxkxxk', 'kxxxxxxxxxxk',
        'kxxxxxxxxxxk', 'kxyxxyyxxyxk', 'kxxxxxxxxxxk', 'kXXXXXXXXXXk', 'kkkkkkkkkkkk', '............'],
    # Wealth: a holed coin.
    'wealth': [
        '....kkkk....', '..kkyyyykk..', '.kyyxxxxxXk.', '.kyxxxxxxXk.', 'kyxxxkkxxxXk', 'kyxxk..kxxXk',
        'kyxxk..kxxXk', 'kyxxxkkxxxXk', '.kxxxxxxxXk.', '.kXxxxxxXXk.', '..kkXXXXkk..', '....kkkk....'],
    # Peoples: two figures.
    'peoples': [
        '............', '..kk....kk..', '.kwxk..kwxk.', '.kxxk..kxxk.', '..kk....kk..', '.kxxk..kxxk.',
        'kxxxxkkxxxxk', 'kxxxxkkxxxxk', 'kxXXxkkxXXxk', '.kXk....kXk.', '.kXk....kXk.', '.kk......kk.'],
    # Mind: an open book.
    'mind': [
        '............', '............', '.kkkk..kkkk.', 'kwwwwkkwwwwk', 'kwkkwxxwkkwk', 'kwwwwxxwwwwk',
        'kwkkwxxwkkwk', 'kwwwwxxwwwwk', 'kxxxxxxxxxxk', 'kXXXXkkXXXXk', '.kkkk..kkkk.', '............'],
    # Shocks: a lightning bolt.
    'shocks': [
        '......kkkk..', '.....kyxk...', '....kyxk....', '...kyxk.....', '..kyxxkkkk..', '.kxxxxxxk...',
        '.kkkkxxk....', '....kxk.....', '...kxk......', '..kXk.......', '..kk........', '............'],
    # Ask: a quill.
    'ask': [
        '.........kk.', '........kwk.', '.......kwxk.', '......kwxk..', '.....kwxk...', '....kwxk....',
        '...kwxk.....', '...kxk......', '..kkk.......', '.kk.........', 'kk..kkkkkk..', '............'],
    # This year: an hourglass.
    'year': [
        '.kkkkkkkkkk.', '.kggggggggk.', '..kwwwwwwk..', '...kxxxxk...', '....kxxk....', '.....kk.....',
        '.....kk.....', '....kwxk....', '...kwxxxk...', '..kxxxxxxk..', '.kggggggggk.', '.kkkkkkkkkk.'],
    # Here: a banner on a pole.
    'here': [
        '..kk........', '..kgkkkkk...', '..kgkxxxxk..', '..kgkxwxxxk.', '..kgkxxxxk..', '..kgkXXXk...',
        '..kgkkkk....', '..kgk.......', '..kgk.......', '..kgk.......', '.kkkkk......', '............'],
    # Codex: a closed book with a clasp.
    'codex': [
        '............', '.kkkkkkkkk..', '.kxxxxxxxkk.', '.kxyyyyyxkwk', '.kxyxxxyxkwk', '.kxyyyyyxkwk',
        '.kxxxxxxxkgk', '.kxxxxxxxkwk', '.kxxxxxxxkwk', '.kXXXXXXXkwk', '.kkkkkkkkkk.', '............'],
    # What if: a forked road.
    'whatif': [
        '.kk......kk.', 'kxxk....kxxk', '.kxxk..kxxk.', '..kxxkkxxk..', '...kxxxxk...', '....kxxk....',
        '....kxxk....', '....kxxk....', '....kxxk....', '....kXXk....', '....kXXk....', '....kkkk....'],
    # Surprise: a die.
    'die': [
        '............', '.kkkkkkkkkk.', '.kwwwwwwwwk.', '.kwkkwwwwwk.', '.kwkkwwwwwk.', '.kwwwkkwwwk.',
        '.kwwwkkwwwk.', '.kwwwwwkkwk.', '.kwwwwwkkwk.', '.kWWWWWWWWk.', '.kkkkkkkkkk.', '............'],
    # Key: a key.
    'key': [
        '............', '.kkkk.......', 'kyyyyk......', 'kykkyk......', 'kykkykkkkkk.', 'kyyyyyyyyyyk',
        '.kkkkkkykyk.', '......kykyk.', '.......k.k..', '............', '............', '............'],
    # Focus: an eye.
    'focus': [
        '............', '............', '...kkkkkk...', '.kkwwwwwwkk.', 'kwwwkkkkwwwk', 'kwwkxxwkkwwk',
        'kwwkxxkkkwwk', 'kwwwkkkkwwwk', '.kkwwwwwwkk.', '...kkkkkk...', '............', '............'],
    'close': [
        '............', '.kk......kk.', 'kxxk....kxxk', '.kxxk..kxxk.', '..kxxkkxxk..', '...kxxxxk...',
        '...kxxxxk...', '..kxxkkxxk..', '.kxxk..kxxk.', 'kXXk....kXXk', '.kk......kk.', '............'],
    'star': [
        '.....kk.....', '....kyyk....', '....kyyk....', 'kkkkkyykkkkk', 'kyyyyyyyyyyk', '.kyyyyyyyyk.',
        '..kyyyyyyk..', '..kyygGyyk..', '.kyyGkkGyyk.', '.kyGk..kGyk.', 'kkkk....kkkk', '............'],
    'next': [
        '............', '....kk......', '....kxk.....', '....kxxk....', 'kkkkkxxxk...', 'kwwwwxxxxk..',
        'kxxxxxxxxxk.', 'kXXXXxxxxk..', 'kkkkkxxxk...', '....kxxk....', '....kXk.....', '....kk......'],
    'seal': [
        '....kkkk....', '..kkxxxxkk..', '.kxxyxxyxxk.', '.kxxxyyxxxk.', 'kxxyyxxyyxxk', 'kxxxyyyyxxxk',
        'kxxyyxxyyxxk', '.kxxxyyxxxk.', '.kxxyxxyxxk.', '..kkxxxxkk..', '...kXkkXk...', '...kk..kk...'],
    'compass': [
        '.....kk.....', '....kyyk....', '....kyyk....', '...kkyykk...', '.kkwkyykwkk.', 'kwwwwkkxxxxk',
        'kwwwwkkxxxxk', '.kkwkXXkwkk.', '...kkXXkk...', '....kXXk....', '....kXXk....', '.....kk.....'],
}

for _n, _g in ICONS.items():
    assert len(_g) == 12 and all(len(r) == 12 for r in _g), _n


def icon_svg(name):
    rows = ICONS[name]
    cls = {'x': 'x', 'X': 'X', 'k': 'k', 'w': 'w', 'W': 'W', 'y': 'y', 'g': 'g', 'G': 'G'}
    parts = ['<svg class="ico" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true">']
    for y, r in enumerate(rows):
        x = 0
        while x < 12:
            ch = r[x]
            if ch == '.':
                x += 1; continue
            x2 = x
            while x2 < 12 and r[x2] == ch: x2 += 1
            parts.append(f'<rect class="{cls[ch]}" x="{x}" y="{y}" width="{x2 - x}" height="1"/>')
            x = x2
    parts.append('</svg>')
    return ''.join(parts)


def icons_js():
    """`window.PXICON = {name: '<svg ...>'}`: tint with CSS (`--t`), ink and vellum follow the theme."""
    return 'window.PXICON = ' + json.dumps({n: icon_svg(n) for n in ICONS}, separators=(',', ':')) + ';'


def css():
    light, dark, tint = tokens()
    fr = frames()
    def block(t):
        lines = [f'--{k}: {v};' for k, v in t.items() if k != 'line']
        cm = _cmap(t)
        for name, (c, rows) in fr.items():
            lines.append(f'--f-{name}: {_png(rows, cm)};')
        return ' '.join(lines)
    hand = ['............', '...kkkk.....', '..kwwwwkkkk.', '.kwwwwwwwwwk', 'kwwwwwkkkkk.', 'kwwwwwwwk...',
            'kwwwwwkkk...', 'kwwwwwwwk...', '.kWwwwkkk...', '..kkkkk.....', '............', '............']
    knob = ['.kkkkkk.', 'kyyyyyGk', 'kyggggGk', 'kyggggGk', 'kygkkgGk', 'kygkkgGk', 'kyggggGk', 'kyggggGk',
            'kGGGGGGk', '.kGGGGk.', '..kGGk..', '...kk...']
    hand_css = '--hand: ' + _png(hand, _cmap(light)) + '; --knob: ' + _png(knob, _cmap(light)) + ';'
    slices = hand_css + ' ' + ' '.join(f'--s-{n}: {c};' for n, (c, _) in fr.items())
    tints = ' '.join(f'--{k}: {v};' for k, v in tint.items())
    return (':root { ' + block(light) + ' ' + slices + ' ' + tints + ' }\n'
            '@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ' + block(dark) + ' color-scheme: dark; } }\n'
            ':root[data-theme="dark"] { ' + block(dark) + ' color-scheme: dark; }\n')


if __name__ == '__main__':
    import sys
    print(css()[:600])
    print(tokens()[2])
