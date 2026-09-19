# -*- coding: utf-8 -*-
"""Prepare the next browser download wave: rebuild remaining list (tier-first),
skip ids already attempted twice (persistent 403/withdrawn), write 60 jobs to
data/batch_jobs.json and bump attempt counters in data/attempts.json."""
import json, os, collections
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
done = set()
for line in (DATA / "extract_state.jsonl").read_text(encoding="utf-8").splitlines():
    r = json.loads(line)
    if r.get("ok") or r.get("reason") == "no figure":
        done.add(r["id"])
cache = ROOT / "pdfs" / "browser"
if cache.exists():
    for f in os.listdir(cache):
        done.add(f[:-4])
att = {}
af = DATA / "attempts.json"
if af.exists():
    att = json.loads(af.read_text(encoding="utf-8"))
items = []
for y in (2023, 2024, 2025):
    for line in (DATA / "pool" / f"iclr_{y}.jsonl").read_text(encoding="utf-8").splitlines():
        m = json.loads(line)
        if m["id"] not in done and att.get(m["id"], 0) < 2:
            items.append(m)
items.sort(key=lambda m: (m.get("tier", 9), m["year"], m["id"]))
q = [{"id": m["id"], "url": m["pdf"]} for m in items]
(DATA / "pdf_queue.json").write_text(json.dumps(q), encoding="utf-8")
batch = q[:100]
for j in batch:
    att[j["id"]] = att.get(j["id"], 0) + 1
af.write_text(json.dumps(att), encoding="utf-8")
(DATA / "batch_jobs.json").write_text(json.dumps(batch), encoding="utf-8")
print("remaining(attempt<2):", len(q), "skipped-by-attempts:",
      sum(1 for m in [json.loads(l) for y in (2023,2024,2025) for l in (DATA/'pool'/f'iclr_{y}.jsonl').read_text(encoding='utf-8').splitlines()]
          if m['id'] not in done and att.get(m['id'],0) >= 2))
print("batch:", batch[0]["id"] if batch else "-", "->", batch[-1]["id"] if batch else "-")
