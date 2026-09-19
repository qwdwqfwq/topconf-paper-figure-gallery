# -*- coding: utf-8 -*-
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sel = json.loads((ROOT / "data/selected.json").read_text(encoding="utf-8"))["selected"]
miss = []
for r in sel:
    p = ROOT / "images" / r["venue"] / "all" / (r["id"] + ".png")
    if not p.exists():
        miss.append((r["id"], r["venue"], r.get("year")))
print(len(miss))
for m in miss:
    print(*m)
