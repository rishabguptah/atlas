# Usage: python3 views/atlas/chrome/preview.py OUT_DIR [BG_WIDE.webp BG_PHONE.webp]
# Writes OUT_DIR/index.html: the interface directions over a picture of the pixel map, built from the same kit and CSS as the Atlas.
import sys, os, base64
here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, here)
import kit
out = sys.argv[1]
bgs = sys.argv[2:4]
s = open(os.path.join(here, 'preview.src.html'), encoding='utf-8').read()
css = kit.css()
for name, p in zip(('bg-wide',), bgs):
    css += ':root { --%s: url("data:image/webp;base64,%s"); }\n' % (name, base64.b64encode(open(p, 'rb').read()).decode())
s = s.replace('/*__KIT__*/', css).replace('/*__CHROME__*/', open(os.path.join(here, 'chrome.css'), encoding='utf-8').read()).replace('/*__ICONS__*/', kit.icons_js())
os.makedirs(out, exist_ok=True)
open(os.path.join(out, 'index.html'), 'w', encoding='utf-8').write(s)
print(os.path.join(out, 'index.html'), len(s))
