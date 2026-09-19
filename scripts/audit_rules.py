# -*- coding: utf-8 -*-
"""After tightening reject rules, build contact sheets of figures that were
selected before but are rejected now (false-positive audit).

Usage:
    cp data/selected.json data/selected_prev.json
    python scripts/score_select.py 980
    python scripts/audit_rules.py
"""
import json
from pathlib import Path
from PIL import Image, ImageDraw
ROOT = Path(__file__).resolve().parents[1]
prev = {r["id"]: r for r in json.loads((ROOT / "data/selected_prev.json").read_text(encoding="utf-8"))["selected"]}
now = {r["id"] for r in json.loads((ROOT / "data/selected.json").read_text(encoding="utf-8"))["selected"]}
lost = [r for fid, r in prev.items() if fid not in now]
print("lost:", len(lost))
TW, TH, COLS, GAP, LABEL = 360, 250, 4, 14, 44
PER = 32
pages = max(1, (len(lost) + PER - 1) // PER)
for pg in range(pages):
    chunk = lost[pg * PER:(pg + 1) * PER]
    rows = (len(chunk) + COLS - 1) // COLS
    sheet = Image.new("RGB", (COLS * (TW + GAP) + GAP, max(1, rows) * (TH + LABEL + GAP) + GAP), "white")
    d = ImageDraw.Draw(sheet)
    for k, r in enumerate(chunk):
        rr, cc = divmod(k, COLS)
        x, y = GAP + cc * (TW + GAP), GAP + rr * (TH + LABEL + GAP)
        p = ROOT / "images" / r["venue"] / "all" / f"{r['id']}.png"
        if p.exists():
            im = Image.open(p).convert("RGB")
            s = min(TW / im.width, TH / im.height)
            im = im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)
            tile = Image.new("RGB", (TW, TH), "white")
            tile.paste(im, ((TW - im.width) // 2, (TH - im.height) // 2))
            sheet.paste(tile, (x, y))
        d.text((x, y + TH + 2), f"{r['id']} {r.get('reject','?')}", fill="black")
        d.text((x, y + TH + 18), r["title"][:62], fill=(40, 40, 90))
    out = ROOT / "data" / f"qa_lost_{pg}.png"
    sheet.save(out)
    print(out)
