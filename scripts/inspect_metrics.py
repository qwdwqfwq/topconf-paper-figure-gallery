# -*- coding: utf-8 -*-
"""Print crop metrics for given ids to design/tune reject rules."""
import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
ids = sys.argv[1:]
rows = {}
for line in (ROOT / "data" / "scores.jsonl").read_text(encoding="utf-8").splitlines():
    r = json.loads(line)
    rows[r["id"]] = r
keys = ["paths", "curves", "rects", "spans", "chars", "bitmap_frac", "sat",
        "white", "colors", "edge", "vec", "label_density", "ar", "w", "h",
        "edge_cut", "score", "reject", "pattern"]
for fid in ids:
    r = rows.get(fid)
    if not r:
        print(fid, "NOT FOUND"); continue
    print(fid, "|", r["title"][:60])
    print("   ", " ".join(f"{k}={r.get(k)}" for k in keys))
