# -*- coding: utf-8 -*-
"""Quick contact sheet of newest crops for a venue (default cvpr)."""
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
venue = sys.argv[1] if len(sys.argv) > 1 else "cvpr"
n = int(sys.argv[2]) if len(sys.argv) > 2 else 12
imgs = sorted((ROOT / "images" / venue / "all").glob("*.png"))[:n]
cols = 4
cell_w, cell_h = 460, 360
rows = (len(imgs) + cols - 1) // cols
sheet = Image.new("RGB", (cols * cell_w, rows * cell_h), "white")
d = ImageDraw.Draw(sheet)
for i, p in enumerate(imgs):
    im = Image.open(p).convert("RGB")
    im.thumbnail((cell_w - 12, cell_h - 34), Image.LANCZOS)
    x, y = (i % cols) * cell_w, (i // cols) * cell_h
    sheet.paste(im, (x + 6, y + 24))
    d.text((x + 6, y + 6), p.stem[:58], fill=(0, 0, 0))
out = ROOT / f"data/peek_{venue}.png"
sheet.save(out)
print("saved", out, "images:", len(imgs))
