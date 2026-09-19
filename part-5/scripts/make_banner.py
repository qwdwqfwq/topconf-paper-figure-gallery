# -*- coding: utf-8 -*-
"""Compose a hero banner from selected figures (derivative montage)."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont
ROOT = Path(__file__).resolve().parents[1]
PICKS = [
 "images/neurips/final/neurips2023-02.jpg",  # DPO
 "images/icml/final/icml2023-02.jpg",         # BLIP-2
 "images/icml/final/icml2023-06.jpg",         # banana robot
 "images/iclr/final/iclr2024-28.jpg",         # MetaGPT
 "images/neurips/final/neurips2024-19.jpg",   # HippoRAG
 "images/iclr/final/iclr2024-17.jpg",         # CRITIC
 "images/neurips/final/neurips2024-27.jpg",   # SWE-agent
 "images/icml/final/icml2025-45.jpg",         # WoRMI
]
W, H = 1280, 460
banner = Image.new("RGB", (W, H), "#0f1430")
# diagonal gradient
top = (19, 24, 58); bot = (46, 30, 88)
grad = Image.new("RGB", (1, H))
for y in range(H):
    t = y / H
    grad.putpixel((0, y), tuple(int(top[i] + (bot[i]-top[i])*t) for i in range(3)))
banner.paste(grad.resize((W, H)), (0, 0))

TW, TH, COLS, ROWS, GAP = 286, 168, 4, 2, 14
grid_w = COLS*TW + (COLS-1)*GAP
x0, y0 = (W-grid_w)//2, 46
for k, p in enumerate(PICKS):
    r, c = divmod(k, COLS)
    x, y = x0 + c*(TW+GAP), y0 + r*(TH+GAP)
    im = Image.open(ROOT/p).convert("RGB")
    # fit contain on white so every figure stays complete
    s = min(TW/im.width, TH/im.height)
    im = im.resize((max(1,int(im.width*s)), max(1,int(im.height*s))), Image.LANCZOS)
    tile = Image.new("RGB", (TW, TH), "white")
    tile.paste(im, ((TW-im.width)//2, (TH-im.height)//2))
    # rounded mask
    mask = Image.new("L", (TW, TH), 0)
    d = ImageDraw.Draw(mask); d.rounded_rectangle([0, 0, TW-1, TH-1], radius=14, fill=255)
    # shadow
    sh = Image.new("RGBA", (TW+24, TH+24), (0,0,0,0))
    sd = ImageDraw.Draw(sh); sd.rounded_rectangle([12, 12, TW+11, TH+11], radius=14, fill=(0,0,0,150))
    sh = sh.filter(ImageFilter.GaussianBlur(8))
    banner.paste(sh, (x-12, y-10), sh)
    banner.paste(tile, (x, y), mask)
out = ROOT/"docs"/"banner.jpg"
out.parent.mkdir(exist_ok=True)
banner.save(out, "JPEG", quality=88)
print(out, out.stat().st_size//1024, "KB")
