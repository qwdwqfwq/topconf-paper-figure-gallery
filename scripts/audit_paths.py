# -*- coding: utf-8 -*-
"""Case-sensitive audit: figures.json image paths vs git-tracked exact paths."""
import json, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
fig = json.loads((ROOT / "data" / "figures.json").read_text(encoding="utf-8"))
tracked = set(subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True,
                             text=True).stdout.splitlines())
# also filesystem exact names per directory
missing, case_mismatch = [], []
import os
for f in fig:
    p = f["image"].replace("/", os.sep)
    rel = f["image"]
    if rel in tracked:
        continue
    # exists on disk case-insensitively?
    if (ROOT / p).exists():
        case_mismatch.append(rel)
    else:
        missing.append(rel)
print("total figures:", len(fig))
print("path not tracked (exact case):", len(case_mismatch) + len(missing))
print("case mismatches:", len(case_mismatch))
for x in case_mismatch[:20]:
    print("  CASE", x)
print("truly missing:", len(missing))
for x in missing[:20]:
    print("  MISS", x)
