# -*- coding: utf-8 -*-
"""Dump contact sheets of SELECTED figures matching a noise signature, for
bulk visual QA. Writes data/suspect_<mode>_<venue>_<page>.png and id lists.

Modes:
  chart (default): grey multi-panel chart pages with many tick labels
  frames: qualitative example / result-frame pages (bitmaps + captions)
"""
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw
ROOT = Path(__file__).resolve().parents[1]
MODE = sys.argv[1] if len(sys.argv) > 1 else "chart"
sel = json.loads((ROOT / "data/selected.json").read_text(encoding="utf-8"))["selected"]
VENUES = ("iclr", "icml", "neurips", "cvpr", "acl", "aaai")
TW, TH, COLS, GAP, LABEL = 360, 250, 4, 14, 44


def suspect_chart(r):
    return (r["curves"] < 160 and r["paths"] < 320 and r["rects"] < 90
            and r["sat"] < 0.11 and r["bitmap_frac"] < 0.35 and r["spans"] > 70
            and r["white"] > 0.58 and r["vec"] < 85 and r["label_density"] < 48)


def suspect_frames(r):
    # photo/result-frame pages and text-heavy example pages, almost no drawn structure
    a = (r["vec"] < 26 and r["chars"] > 800 and r["bitmap_frac"] > 0.08
         and r["spans"] < 130 and r["rects"] < 40)
    b = (0.30 < r["bitmap_frac"] < 0.78 and r["spans"] < 60 and r["white"] < 0.58
         and r["sat"] < 0.16 and r["rects"] < 45 and r["paths"] < 900)
    c = (r["bitmap_frac"] > 0.78 and r["label_density"] < 45 and r["sat"] < 0.13
         and r["rects"] < 120 and r["spans"] < 120)
    return a or b or c


suspect = suspect_frames if MODE == "frames" else suspect_chart


for venue in VENUES:
    items = [r for r in sel if r["venue"] == venue and suspect(r)]
    items.sort(key=lambda r: r["sat"])
    if not items:
        print(venue, "none"); continue
    per = 32
    pages = (len(items) + per - 1) // per
    for pg in range(pages):
        chunk = items[pg * per:(pg + 1) * per]
        rows = (len(chunk) + COLS - 1) // COLS
        sheet = Image.new("RGB", (COLS * (TW + GAP) + GAP, rows * (TH + LABEL + GAP) + GAP), "white")
        d = ImageDraw.Draw(sheet)
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
            d.text((x, y + TH + 2), f"{r['id']} s={r['score']}", fill="black")
            d.text((x, y + TH + 18), r["title"][:62], fill=(40, 40, 90))
        out = ROOT / "data" / f"suspect_{MODE}_{venue}_{pg}.png"
        sheet.save(out)
        print(out, len(chunk))
    # id list in sheet order
    ids = [r["id"] for r in items]
    (ROOT / "data" / f"suspect_{MODE}_{venue}_ids.txt").write_text("\n".join(ids), encoding="utf-8")
    print(venue, "total suspects:", len(items))
