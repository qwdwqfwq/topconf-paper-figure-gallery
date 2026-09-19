# -*- coding: utf-8 -*-
"""Full-enumeration QA contact sheets for one venue's selected figures.

Usage: python enum_sheets.py <venue> [page_size=30]
Writes data/enum_<venue>_<page>.png and data/enum_<venue>_ids.txt
(grid order, one id per line, page headers included).
"""
import sys, json
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
venue = sys.argv[1]
page_size = int(sys.argv[2]) if len(sys.argv) > 2 else 30
COLS = 5
ROWS = (page_size + COLS - 1) // COLS
TW, TH, GAP, LABEL = 380, 260, 12, 40

sel = json.loads((ROOT / "data/selected.json").read_text(encoding="utf-8"))["selected"]
items = sorted((r for r in sel if r["venue"] == venue), key=lambda r: r["id"])
print(venue, "selected:", len(items))

id_lines = []
for pg, start in enumerate(range(0, len(items), page_size)):
    chunk = items[start:start + page_size]
    sheet = Image.new("RGB", (COLS * (TW + GAP) + GAP, ROWS * (TH + LABEL + GAP) + GAP), "white")
    d = ImageDraw.Draw(sheet)
    id_lines.append(f"=== page {pg} ===")
    for k, r in enumerate(chunk):
        rr, cc = divmod(k, COLS)
        x, y = GAP + cc * (TW + GAP), GAP + rr * (TH + LABEL + GAP)
        p = ROOT / "images" / venue / "all" / f"{r['id']}.png"
        if p.exists():
            im = Image.open(p).convert("RGB")
            s = min(TW / im.width, TH / im.height)
            im = im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)
            tile = Image.new("RGB", (TW, TH), "white")
            tile.paste(im, ((TW - im.width) // 2, (TH - im.height) // 2))
            sheet.paste(tile, (x, y))
        d.text((x, y + TH + 2), f"{start + k:03d} {r['id']}", fill="black")
        d.text((x, y + TH + 18), r["title"][:60], fill=(40, 40, 90))
        id_lines.append(f"{start + k:03d} {r['id']}  {r['title'][:80]}")
    out = ROOT / "data" / f"enum_{venue}_{pg}.png"
    sheet.save(out)
    print(out)

(ROOT / "data" / f"enum_{venue}_ids.txt").write_text("\n".join(id_lines), encoding="utf-8")
