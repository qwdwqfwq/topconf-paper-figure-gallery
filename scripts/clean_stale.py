# -*- coding: utf-8 -*-
"""Delete final jpgs not referenced by data/figures.json."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
fig = json.loads((ROOT / "data" / "figures.json").read_text(encoding="utf-8"))
keep = {str((ROOT / f["image"]).resolve()).lower() for f in fig}
VENUES = ("iclr", "icml", "neurips", "cvpr", "acl", "aaai")
removed = 0
for venue in VENUES:
    d = ROOT / "images" / venue / "final"
    if not d.exists():
        continue
    for p in d.glob("*.jpg"):
        if str(p.resolve()).lower() not in keep:
            p.unlink()
            removed += 1
print("removed stale:", removed)
for venue in VENUES:
    d = ROOT / "images" / venue / "final"
    print(venue, len(list(d.glob("*.jpg"))) if d.exists() else 0)
