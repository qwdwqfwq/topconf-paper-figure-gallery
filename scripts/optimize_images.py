# -*- coding: utf-8 -*-
"""Downscale final images for the web (max 1500px) and compare PNG vs JPEG size."""
import io
from pathlib import Path
from PIL import Image
ROOT = Path(__file__).resolve().parents[1]
tests = ["iclr/final/iclr2023-03.png", "icml/final/icml2023-02.png",
         "neurips/final/neurips2024-19.png", "neurips/final/neurips2025-38.png"]
for t in tests:
    p = ROOT / "images" / t
    im = Image.open(p).convert("RGB")
    if im.width > 1500:
        im = im.resize((1500, round(im.height*1500/im.width)), Image.LANCZOS)
    buf = io.BytesIO(); im.save(buf, "PNG", optimize=True)
    png_kb = buf.tell()/1024
    buf = io.BytesIO(); im.save(buf, "JPEG", quality=88, optimize=True, progressive=True)
    jpg_kb = buf.tell()/1024
    print(f"{t.split('/')[-1]}: orig {p.stat().st_size/1024:.0f}KB -> png {png_kb:.0f}KB jpg {jpg_kb:.0f}KB {im.size}")
