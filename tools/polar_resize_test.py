"""Polar chart resize test (headless Chromium via Playwright).

Draws the chart from a view file at one canvas size, resizes the canvas,
then measures the chart's outer ring against the final canvas: fully
inside, centered, filling the short side. Reproduces the frozen-size bug
the chart had until 2026-09-27 (2/10 before the fix, 10/10 after).

Usage:  python3 tools/polar_resize_test.py full.liquid.txt
Needs:  pip install playwright && playwright install chromium

Data: uses fixtures/storefront_en.json, which is synthetic. That is fine
here because the test checks geometry only; don't use it to check logic.
"""
import json, os, re, sys
from playwright.sync_api import sync_playwright

src_file = sys.argv[1]
s = open(src_file).read()
pat = re.compile(r'<script type="text/javascript">\n(.*?)\n</script>', re.S)
map_js = [b for b in pat.findall(s) if 'var A = {{ aurora | json }}' in b][0]
aurora = json.load(open(os.path.join(os.path.dirname(__file__), '..', 'fixtures', 'storefront_en.json')))['aurora']
map_js = map_js.replace('{{ aurora | json }}', json.dumps(aurora)).replace(
    '{{ trmnl.plugin_settings.custom_fields_values.use_real_map | default: false }}', 'false')

# (label, size when drawn, final size): drawn-too-small, too-large, near-zero height,
# never measured, and unchanged, across the aspect ratios of the reported views.
CASES = [
  ("Full OG portrait: measured too large",   (480, 520), (480, 360)),
  ("Full X portrait: measured too small",    (300, 300), (700, 560)),
  ("Full X landscape: measured too small",   (300, 300), (620, 700)),
  ("HalfVert X portrait: measured tiny",     (120, 90),  (560, 520)),
  ("HalfVert X landscape: measured tiny",    (120, 90),  (740, 420)),
  ("HalfVert OG portrait: measured too wide",(330, 300), (230, 300)),
  ("Quadrant X: measured ~no height",        (400, 6),   (400, 540)),
  ("Quadrant X: never measured (0x0)",       (0, 0),     (400, 540)),
  ("control: size never changes (wide)",     (700, 400), (700, 400)),
  ("control: size never changes (tall)",     (300, 600), (300, 600)),
]
page_html = """<!doctype html><html><body style="margin:0">
<div id="aurora-canvas" style="position:relative;width:%dpx;height:%dpx"></div>
<script>%s</script></body></html>"""

fails = 0
with sync_playwright() as p:
    b = p.chromium.launch()
    for label, (w0, h0), (w1, h1) in CASES:
        pg = b.new_page(viewport={"width": 1200, "height": 900})
        pg.set_content(page_html % (w0, h0, map_js))
        pg.wait_for_timeout(900)            # chart draws (incl. any retries)
        pg.evaluate("([w,h]) => { const e=document.getElementById('aurora-canvas'); e.style.width=w+'px'; e.style.height=h+'px'; }", [w1, h1])
        pg.wait_for_timeout(200)
        m = pg.evaluate("""() => {
          const c = document.getElementById('aurora-canvas').getBoundingClientRect();
          const rims = [...document.querySelectorAll('#aurora-canvas circle[fill="none"]')];
          if (!rims.length) return {drawn:false};
          rims.sort((a,b)=>b.getBoundingClientRect().width-a.getBoundingClientRect().width);
          const r = rims[0].getBoundingClientRect();
          return {drawn:true, cw:c.width, ch:c.height,
            inside: r.left>=c.left-1 && r.top>=c.top-1 && r.right<=c.right+1 && r.bottom<=c.bottom+1,
            fill: r.width/Math.min(c.width,c.height),
            off: Math.hypot((r.left+r.width/2)-(c.left+c.width/2),(r.top+r.height/2)-(c.top+c.height/2))};
        }""")
        ok = m.get("drawn") and m["inside"] and m["fill"] > 0.9 and m["off"] < 2
        fails += 0 if ok else 1
        detail = "NOT DRAWN" if not m.get("drawn") else "inside=%s fill=%.2f off-center=%.0fpx" % (m["inside"], m["fill"], m["off"])
        print(("PASS " if ok else "FAIL ") + label.ljust(42) + detail)
        pg.close()
    b.close()
print("\n%d/%d cases correct" % (len(CASES)-fails, len(CASES)))
