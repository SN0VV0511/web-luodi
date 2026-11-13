#!/usr/bin/env python3
"""Apply the SN0VV handbook refresh layer to a standalone HTML page (idempotent).

- Raises every CSS font-size below 12px (px or em/rem < 1) to a 12px floor, in <style>
  blocks and in style="" attributes. Rules whose selector targets SVG are left alone, because
  SVG text is sized in viewBox units and scales with the drawing.
- Injects/refreshes <style id="sn0vv-handbook"> with the shared handbook tokens
  (design-system/sn0vv-city/handbook-tokens.css) plus an optional page-specific CSS file.

Usage: handbook-refresh.py PAGE.html [--extra page.css] [--tokens path] [--dry-run]
"""
from __future__ import annotations
import argparse, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
TOKENS = ROOT / "design-system" / "sn0vv-city" / "handbook-tokens.css"
FLOOR = 12.0
SIZE = re.compile(r"font-size\s*:\s*(\d*\.?\d+)(px|em|rem)\b(\s*!important)?", re.I)
RULE = re.compile(r"([^{}]+)\{([^{}]*)\}")
BLOCK_ID = "sn0vv-handbook"

def floor_decls(text: str, counter: list[int]) -> str:
    def sub(m: re.Match) -> str:
        val, unit, imp = float(m.group(1)), m.group(2).lower(), m.group(3) or ""
        if unit == "px" and val < FLOOR and val > 0:
            counter[0] += 1
            return f"font-size:{FLOOR:g}px{imp}"
        if unit in ("em", "rem") and val < 1:
            counter[0] += 1
            return f"font-size:max({FLOOR:g}px,{m.group(1)}{unit}){imp}"
        return m.group(0)
    return SIZE.sub(sub, text)

def floor_css(css: str, counter: list[int]) -> str:
    def rule(m: re.Match) -> str:
        sel, body = m.group(1), m.group(2)
        if re.search(r"\bsvg\b|\btext\b|tspan", sel):
            return m.group(0)
        return sel + "{" + floor_decls(body, counter) + "}"
    return RULE.sub(rule, css)

def process(html: str, extra: str) -> tuple[str, int]:
    counter = [0]
    # drop a previously injected block so re-runs stay idempotent
    html = re.sub(rf'\n?<style id="{BLOCK_ID}">.*?</style>', "", html, flags=re.S)
    html = re.sub(r"(<style[^>]*>)(.*?)(</style>)", lambda m: m.group(1) + floor_css(m.group(2), counter) + m.group(3), html, flags=re.S)
    # style="" attributes outside <svg> ... </svg>
    parts = re.split(r"(<svg\b.*?</svg>)", html, flags=re.S)
    for i in range(0, len(parts), 2):
        parts[i] = re.sub(r'style="([^"]*)"', lambda m: 'style="' + floor_decls(m.group(1), counter) + '"', parts[i])
    html = "".join(parts)
    block = f'\n<style id="{BLOCK_ID}">\n{TOKENS.read_text()}\n{extra}\n</style>'
    if "</head>" not in html:
        sys.exit("no </head> found")
    html = html.replace("</head>", block + "\n</head>", 1)
    return html, counter[0]

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("page"); ap.add_argument("--extra"); ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    p = pathlib.Path(a.page)
    extra = pathlib.Path(a.extra).read_text() if a.extra else ""
    out, n = process(p.read_text(encoding="utf-8"), extra)
    if not a.dry_run:
        p.write_text(out, encoding="utf-8")
    print(f"{p}: raised {n} sub-{FLOOR:g}px font sizes")

if __name__ == "__main__":
    main()
