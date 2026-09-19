# -*- coding: utf-8 -*-
"""Build labeled contact sheets per venue-year for visual QA."""
import json, textwrap
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
matched = json.loads((DATA / "matched.json").read_text(encoding="utf-8"))
try:
    font = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 16)
    font_s = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 13)
except Exception:
    font = ImageFont.load_default(); font_s = font

CELL_W, CELL_H, COLS, PAD, LABEL_H = 500, 400, 3, 12, 58
groups = {}
for m in matched:
    if m.get("extract", {}).get("ok"):
        groups.setdefault((m["venue"], m["year"]), []).append(m)

for (venue, year), items in sorted(groups.items()):
    rows = (len(items) + COLS - 1) // COLS
    sheet = Image.new("RGB", (COLS*(CELL_W+PAD)+PAD, rows*(CELL_H+PAD)+PAD), "white")
    draw = ImageDraw.Draw(sheet)
    for k, m in enumerate(items):
        r, c = divmod(k, COLS)
        x, y = PAD + c*(CELL_W+PAD), PAD + r*(CELL_H+PAD)
        im = Image.open(ROOT / m["image"]).convert("RGB")
        im.thumbnail((CELL_W, CELL_H-LABEL_H))
        sheet.paste(im, (x + (CELL_W-im.width)//2, y))
        draw.rectangle([x, y, x+CELL_W, y+CELL_H], outline=(170, 170, 170))
        draw.text((x+5, y+CELL_H-LABEL_H+2), f"{m['id']}  {m['pattern']}", fill="black", font=font)
        draw.text((x+5, y+CELL_H-LABEL_H+24),
                  textwrap.shorten(m["title"], width=64, placeholder="..."),
                  fill=(30, 30, 120), font=font_s)
    out = ROOT / "data" / f"sheet_{venue}{year}.png"
    sheet.save(out)
    print(out.name, len(items))
