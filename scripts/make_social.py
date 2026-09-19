# -*- coding: utf-8 -*-
"""Generate docs/social-preview.png (1280x640, GitHub social card) and
refresh docs/banner.jpg with a 6-venue montage once final images exist."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageStat

ROOT = Path(__file__).resolve().parents[1]
figs = json.loads((ROOT / "data" / "figures.json").read_text(encoding="utf-8"))

VENUES = ["iclr", "icml", "neurips", "cvpr", "acl", "aaai"]
COLORS = {"iclr": (79, 70, 229), "icml": (13, 148, 136), "neurips": (225, 29, 72),
          "cvpr": (249, 115, 22), "acl": (37, 99, 235), "aaai": (124, 58, 237)}


def font(size, bold=True):
    candidates = [
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
    ]
    for c in candidates:
        try:
            return ImageFont.truetype(c, size)
        except Exception:
            pass
    return ImageFont.load_default()


def top_picks(n_per_venue=2):
    picks = []
    for v in VENUES:
        items = [f for f in figs if f["venue"] == v]
        items.sort(key=lambda f: -(f.get("score") or 0))
        picks.extend(items[:n_per_venue])
    return picks


def rounded_tile(path, tw, th, radius=14):
    im = Image.open(ROOT / path).convert("RGB")
    s = min(tw / im.width, th / im.height)
    im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)
    tile = Image.new("RGB", (tw, th), "white")
    tile.paste(im, ((tw - im.width) // 2, (th - im.height) // 2))
    mask = Image.new("L", (tw, th), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, tw - 1, th - 1], radius=radius, fill=255)
    out = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    out.paste(tile, (0, 0), mask)
    return out


def gradient_bg(W, H, top=(15, 20, 48), bot=(52, 32, 96)):
    g = Image.new("RGB", (1, H))
    for y in range(H):
        t = y / H
        g.putpixel((0, y), tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)))
    return g.resize((W, H))


def make_social():
    W, H = 1280, 640
    img = gradient_bg(W, H).convert("RGBA")
    d = ImageDraw.Draw(img)
    picks = top_picks(1)[:6]
    TW, TH, GAP = 290, 172, 16
    grid_w = 3 * TW + 2 * GAP
    x0, y0 = (W - grid_w) // 2, 250
    for k, f in enumerate(picks[:6]):
        r, c = divmod(k, 3)
        x, y = x0 + c * (TW + GAP), y0 + r * (TH + GAP)
        sh = Image.new("RGBA", (TW + 24, TH + 24), (0, 0, 0, 0))
        sd = ImageDraw.Draw(sh)
        sd.rounded_rectangle([12, 10, TW + 11, TH + 11], radius=16, fill=(0, 0, 0, 160))
        sh = sh.filter(ImageFilter.GaussianBlur(9))
        img.alpha_composite(sh, (x - 12, y - 10))
        tile = rounded_tile(f["image"], TW, TH)
        img.alpha_composite(tile, (x, y))
        # venue color bar
        bar = Image.new("RGBA", (6, TH - 18), COLORS[f["venue"]] + (255,))
        img.alpha_composite(bar, (x, y + 9))
    # title block
    f1 = font(58); f2 = font(26, bold=False); f3 = font(22, bold=False)
    title = "Top-Conf Figure Gallery"
    sub = "Figure 1 / Teaser inspiration from 6 top ML conferences"
    sub2 = "ICLR · ICML · NeurIPS · CVPR · ACL · AAAI   |   2023–2025"
    tw = d.textlength(title, font=f1)
    d.text(((W - tw) // 2, 56), title, font=f1, fill=(255, 255, 255, 255))
    tw = d.textlength(sub, font=f2)
    d.text(((W - tw) // 2, 140), sub, font=f2, fill=(214, 218, 235, 255))
    tw = d.textlength(sub2, font=f3)
    d.text(((W - tw) // 2, 186), sub2, font=f3, fill=(165, 180, 252, 255))
    out = ROOT / "docs" / "social-preview.png"
    img.convert("RGB").save(out, quality=92)
    print(out, out.stat().st_size // 1024, "KB")


def make_banner():
    picks = top_picks(2)[:8]
    if len(picks) < 8:
        return
    W, H = 1280, 460
    banner = gradient_bg(W, H, (19, 24, 58), (46, 30, 88)).convert("RGBA")
    TW, TH, COLS, GAP = 286, 168, 4, 14
    grid_w = COLS * TW + (COLS - 1) * GAP
    x0, y0 = (W - grid_w) // 2, 46
    for k, f in enumerate(picks[:8]):
        r, c = divmod(k, COLS)
        x, y = x0 + c * (TW + GAP), y0 + r * (TH + GAP)
        sh = Image.new("RGBA", (TW + 24, TH + 24), (0, 0, 0, 0))
        ImageDraw.Draw(sh).rounded_rectangle([12, 12, TW + 11, TH + 11], radius=14,
                                             fill=(0, 0, 0, 150))
        sh = sh.filter(ImageFilter.GaussianBlur(8))
        banner.alpha_composite(sh, (x - 12, y - 10))
        banner.alpha_composite(rounded_tile(f["image"], TW, TH), (x, y))
    out = ROOT / "docs" / "banner.jpg"
    banner.convert("RGB").save(out, "JPEG", quality=88)
    print(out, out.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    make_banner()
    make_social()
