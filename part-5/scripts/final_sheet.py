# -*- coding: utf-8 -*-
import json, textwrap
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
ROOT = Path(__file__).resolve().parents[1]
figs = json.loads((ROOT/"data"/"figures.json").read_text(encoding="utf-8"))
font = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 15)
font_s = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 12)
CELL_W, CELL_H, COLS, PAD, LABEL_H = 470, 380, 4, 10, 50
for venue in ("iclr", "icml", "neurips"):
    items = [f for f in figs if f["venue"] == venue]
    rows = (len(items)+COLS-1)//COLS
    sheet = Image.new("RGB", (COLS*(CELL_W+PAD)+PAD, rows*(CELL_H+PAD)+PAD), "white")
    d = ImageDraw.Draw(sheet)
    for k, m in enumerate(items):
        r, c = divmod(k, COLS)
        x, y = PAD+c*(CELL_W+PAD), PAD+r*(CELL_H+PAD)
        im = Image.open(ROOT/m["image"]).convert("RGB")
        im.thumbnail((CELL_W, CELL_H-LABEL_H))
        sheet.paste(im, (x+(CELL_W-im.width)//2, y))
        d.rectangle([x, y, x+CELL_W, y+CELL_H], outline=(160,160,160))
        d.text((x+4, y+CELL_H-LABEL_H+2), f"{m['id']} {m['year']} {m['pattern']}", fill="black", font=font)
        d.text((x+4, y+CELL_H-LABEL_H+22), textwrap.shorten(m["title"], 60, placeholder="..."), fill=(30,30,120), font=font_s)
    out = ROOT/"data"/f"final_{venue}.png"
    sheet.save(out)
    print(out.name, len(items))
