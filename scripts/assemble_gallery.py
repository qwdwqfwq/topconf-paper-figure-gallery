# -*- coding: utf-8 -*-
"""Assemble the final gallery: hand-curated v1 set + heuristic-selected bulk set.

- v1 rows live in data/figures.json with JPEGs already in images/<venue>/final/;
- bulk rows come from data/selected.json (score_select.py), crops in images/<venue>/all/;
- converts bulk PNGs to capped-width JPEGs in images/<venue>/final/,
- writes the canonical data/figures.json and assets/figures.js.

Usage: python assemble_gallery.py [target_per_venue=1000]
"""
import json, shutil, sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
TARGET = int(sys.argv[1]) if len(sys.argv) > 1 else 1000
MAXW, Q = 1500, 88

v1 = json.loads((DATA / "figures.json").read_text(encoding="utf-8"))
sel_doc = json.loads((DATA / "selected.json").read_text(encoding="utf-8")) if (DATA / "selected.json").exists() else {"selected": []}
bulk_authors = {}
ba = DATA / "bulk_authors.json"
if ba.exists(): bulk_authors = json.loads(ba.read_text(encoding="utf-8"))

out = list(v1)
have = {f["id"] for f in out}
by_venue = {"iclr": 0, "icml": 0, "neurips": 0, "cvpr": 0, "acl": 0, "aaai": 0}
for f in v1: by_venue[f["venue"]] += 1

for r in sel_doc["selected"]:
    fid, venue = r["id"], r["venue"]
    if fid in have or by_venue[venue] >= TARGET:
        continue
    src = ROOT / "images" / venue / "all" / f"{fid}.png"
    if not src.exists():
        continue
    dst_dir = ROOT / "images" / venue / "final"
    dst_dir.mkdir(parents=True, exist_ok=True)
    jpg = dst_dir / f"{fid}.jpg"
    if not jpg.exists():
        im = Image.open(src).convert("RGB")
        if im.width > MAXW:
            im = im.resize((MAXW, round(im.height * MAXW / im.width)), Image.LANCZOS)
        im.save(jpg, "JPEG", quality=Q, optimize=True, progressive=True)
    authors = r.get("authors") or bulk_authors.get(fid, [])
    out.append({
        "id": fid, "venue": venue, "year": r["year"],
        "title": r["title"], "authors": authors, "pattern": r["pattern"],
        "image": f"images/{venue}/final/{fid}.jpg",
        "paper": r.get("page") or r.get("paper") or "",
        "pdf_source": r.get("pdf", ""), "score": r.get("score"),
    })
    have.add(fid); by_venue[venue] += 1

out.sort(key=lambda f: (f["venue"], f["year"], f["id"]))

# attach intrinsic dimensions (for aspect-ratio placeholders / no layout shift)
nodim = []
for f in out:
    p = ROOT / f["image"]
    if p.exists():
        with Image.open(p) as im:
            f["w"], f["h"] = im.size
    else:
        nodim.append(f["id"])
if nodim:
    print("WARN dims missing for", len(nodim))

(DATA / "figures.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
js = "window.FIGURES = " + json.dumps(out, ensure_ascii=False) + ";\n"
(ROOT / "assets" / "figures.js").write_text(js, encoding="utf-8")
total = sum(Path(ROOT / "images" / v / "final").glob("*.jpg")).__length_hint__() if False else None
import os
sizes = {}
for v in ("iclr", "icml", "neurips", "cvpr", "acl", "aaai"):
    d = ROOT / "images" / v / "final"
    sizes[v] = (len(list(d.glob("*.jpg"))),
                round(sum(f.stat().st_size for f in d.glob("*.jpg")) / 1e6, 1))
print("rows:", len(out), "| per venue:", by_venue)
print("final images:", sizes)
missing = [f["id"] for f in out if not (ROOT / f["image"]).exists()]
print("missing images:", len(missing))
noauth = [f["id"] for f in out if not f.get("authors")]
print("missing authors:", len(noauth))
