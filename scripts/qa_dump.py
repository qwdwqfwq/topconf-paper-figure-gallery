# -*- coding: utf-8 -*-
"""Dump the ids+metrics of a sheet_qa sample for a venue/seed (QA bookkeeping).
Usage: python qa_dump.py <venue> <seed>
"""
import sys, json, random, zlib
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
venue, seed = sys.argv[1], int(sys.argv[2])
sel = json.loads((ROOT / "data/selected.json").read_text(encoding="utf-8"))["selected"]
items = [r for r in sel if r["venue"] == venue]
rng = random.Random(seed * 1009 + zlib.crc32(venue.encode()) % 100000)
sample = rng.sample(items, min(32, len(items)))
for k, r in enumerate(sample):
    print(k, r["id"], f"s={r['score']:.1f}", r["pattern"],
          "vec=%s span=%s bmp=%.2f sat=%.2f white=%.2f rect=%s path=%s curv=%s char=%s lab=%s"
          % (r.get("vec"), r.get("spans"), r.get("bitmap_frac", 0), r.get("sat", 0),
             r.get("white", 0), r.get("rects"), r.get("paths"), r.get("curves"),
             r.get("chars"), r.get("label_density")),
          "|", r["title"][:60])
