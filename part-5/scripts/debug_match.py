# -*- coding: utf-8 -*-
import json, re
from pathlib import Path
DATA = Path(r"C:\Users\黎枭\Doubao\chats\2026-09-16\new-chat\topconf-paper-figure-gallery\data")

def cv(f): return f.get("value") if isinstance(f, dict) else f

# 1) DreamFusion in 2023 raw export?
for off in range(0, 4000, 1000):
    p = DATA / "openreview" / f"iclr2023_{off}.json"
    if not p.exists(): continue
    j = json.loads(p.read_text(encoding="utf-8"))
    for note in j.get("notes", []):
        c = note.get("content", {})
        t = (cv(c.get("title")) or "")
        if "dreamfusion" in t.lower():
            print("2023 DreamFusion venue =", repr(c.get("venue")), "| id:", note.get("id"))

# 2) TextGrad in 2025 raw export?
for off in range(0, 4000, 1000):
    p = DATA / "openreview" / f"iclr2025_{off}.json"
    if not p.exists(): continue
    j = json.loads(p.read_text(encoding="utf-8"))
    for note in j.get("notes", []):
        c = note.get("content", {})
        t = (cv(c.get("title")) or "")
        if "textgrad" in t.lower().replace(" ", ""):
            print("2025 TextGrad venue =", repr(cv(c.get("venue"))), "| title:", t, "| id:", note.get("id"))

# 3) venue value distribution 2023
from collections import Counter
cnt = Counter()
for off in range(0, 4000, 1000):
    p = DATA / "openreview" / f"iclr2023_{off}.json"
    if not p.exists(): continue
    j = json.loads(p.read_text(encoding="utf-8"))
    for note in j.get("notes", []):
        cnt[(cv(note["content"].get("venue")) or "?")[:30]] += 1
for k, v in cnt.most_common(12):
    print(v, "|", k)
