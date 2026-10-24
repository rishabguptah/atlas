"""Inline the lab data into lab.src.html and write a single-file page.

Usage: python3 ingest/order-chaos/build_page.py LAND_TOPOJSON OUT.html
LAND_TOPOJSON is any world land TopoJSON with an object named "land" (Natural Earth 50m works).
Run fragility.py and curated.py first.
"""
import json, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE.parents[1] / "data/order-chaos"


def jsonl(name):
    return [json.loads(l) for l in (DATA / name).read_text().splitlines() if l.strip()]


def main(land, out):
    html = (HERE / "lab.src.html").read_text()
    parts = {
        "/*LAB*/null": (DATA / "lab.json").read_text(),
        "/*LAND*/null": Path(land).read_text(),
        "/*SHOCKS*/null": json.dumps([{k: r[k] for k in ("id", "name", "start", "end", "subtype")} for r in jsonl("shocks.jsonl")]),
        "/*CYCLES*/null": json.dumps([{k: r[k] for k in ("id", "name", "start", "end", "phases", "polity")} for r in jsonl("secular-cycles.jsonl")]),
    }
    for k, v in parts.items():
        assert k in html, k
        html = html.replace(k, v.replace("</", "<\\/"))
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    Path(out).write_text(html)
    print(out, f"{len(html) / 1e6:.2f} MB")


if __name__ == "__main__":
    main(*sys.argv[1:3])
