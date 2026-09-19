# -*- coding: utf-8 -*-
"""Delete final jpgs not referenced by data/figures.json."""
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
fig = json.loads((ROOT / "data/figures.json").read_text(encoding="utf-8"))
keep = {str((ROOT / f["image"]).resolve()).lower() for f in fig}
removed = 0
for venue in ("iclr", "icml", "neurips"):
    for p in (ROOT / "images" / venue / "final").glob("*.jpg"):
        if str(p.resolve()).lower() not in keep:
            p.unlink()
            removed += 1
print("removed stale:", removed)
for venue in ("iclr", "icml", "neurips"):
    print(venue, len(list((ROOT / "images" / venue / "final").glob("*.jpg"))))
