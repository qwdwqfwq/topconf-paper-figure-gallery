# -*- coding: utf-8 -*-
import json, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_all import work
ROOT = Path(__file__).resolve().parents[1]
items = []
for name, idx in [("icml_2024.jsonl", 0), ("icml_2024.jsonl", 50),
                  ("neurips_2024.jsonl", 0), ("neurips_2025.jsonl", 0),
                  ("neurips_2025.jsonl", 30), ("icml_2025.jsonl", 5)]:
    lines = (ROOT/"data"/"pool"/name).read_text(encoding="utf-8").splitlines()
    items.append(json.loads(lines[idx]))
for it in items:
    t0 = time.time()
    r = work(it)
    keys = {k: r.get(k) for k in ("ok","w","h","paths","spans","chars","bitmap_frac","images","edge_cut","reason")}
    print(it["id"], round(time.time()-t0,1), "s", keys)
