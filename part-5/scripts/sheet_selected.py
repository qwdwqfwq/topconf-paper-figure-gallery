# -*- coding: utf-8 -*-
"""Contact sheets for top-scored selected figures (QA for the heuristic).
Usage: python sheet_selected.py icml 60
"""
import sys, json
from pathlib import Path
from PIL import Image, ImageDraw
ROOT = Path(__file__).resolve().parents[1]
venue = sys.argv[1] if len(sys.argv) > 1 else "icml"
limit = int(sys.argv[2]) if len(sys.argv) > 2 else 60
sel = json.loads((ROOT / "data/selected.json").read_text(encoding="utf-8"))["selected"]
items = [r for r in sel if r["venue"] == venue][:limit]
TW, TH, COLS, GAP, LABEL = 360, 250, 4, 14, 46
rows = (len(items) + COLS - 1) // COLS
sheet = Image.new("RGB", (COLS * (TW + GAP) + GAP, rows * (TH + LABEL + GAP) + GAP), "white")
d = ImageDraw.Draw(sheet)
for k, r in enumerate(items):
    rr, cc = divmod(k, COLS)
    x, y = GAP + cc * (TW + GAP), GAP + rr * (TH + LABEL + GAP)
    p = ROOT / "images" / venue / "all" / f"{r['id']}.png"
    im = Image.open(p).convert("RGB")
    s = min(TW / im.width, TH / im.height)
    im = im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)
    tile = Image.new("RGB", (TW, TH), "white")
    tile.paste(im, ((TW - im.width) // 2, (TH - im.height) // 2))
    sheet.paste(tile, (x, y))
    title = r["title"][:62]
    d.text((x, y + TH + 2), f"{r['id']} s={r['score']} {r['pattern']}", fill="black")
    d.text((x, y + TH + 18), title, fill=(40, 40, 90))
    d.text((x, y + TH + 32), f"vec={r['vec']} span={r['spans']} bmp={r['bitmap_frac']} sat={r['sat']}", fill=(120, 60, 0))
out = ROOT / "data" / f"sel_{venue}.png"
sheet.save(out)
print(out, len(items))
