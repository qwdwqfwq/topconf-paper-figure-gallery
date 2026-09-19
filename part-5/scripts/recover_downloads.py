# -*- coding: utf-8 -*-
"""Map PDFs in ~/Downloads to ICLR pool ids by title match on PDF page 1,
move matched files to pdfs/browser/<id>.pdf.
Usage:
  python scripts/recover_downloads.py data/batch_jobs.json   # only ids in job list
  python scripts/recover_downloads.py ALL                    # all ICLR pool ids
"""
import json, re, sys, shutil
from pathlib import Path
import pymupdf as fitz

ROOT = Path(__file__).resolve().parents[1]
mode = sys.argv[1] if len(sys.argv) > 1 else "ALL"
ids = None
if mode != "ALL":
    ids = {j["id"] for j in json.loads(Path(mode).read_text(encoding="utf-8"))}

meta = {}
for line in (ROOT / "data/pool").glob("iclr_*.jsonl"):
    for row in line.read_text(encoding="utf-8").splitlines():
        m = json.loads(row)
        if ids is None or m["id"] in ids:
            meta[m["id"]] = m

STOP = {"a","an","the","of","for","and","or","to","in","on","with","via","by","from",
        "is","are","we","our","as","at","be","this","that","using","towards","toward"}
def norm(s):
    return set(w for w in re.findall(r"[a-z0-9]+", s.lower()) if w not in STOP and len(w) > 1)

titles = {fid: norm(m["title"]) for fid, m in meta.items()}
outdir = ROOT / "pdfs/browser"; outdir.mkdir(parents=True, exist_ok=True)

files = [p for p in (Path.home() / "Downloads").glob("*.pdf")]
print("downloads pdfs:", len(files))

def page1_words(p):
    try:
        d = fitz.open(p)
        t = d[0].get_text()[:3500]
        d.close()
        return norm(t)
    except Exception:
        return set()

scores = []
for f in files:
    if (f.stat().st_size or 0) < 50000:
        continue
    pw = page1_words(f)
    if not pw:
        continue
    for fid, tw in titles.items():
        if not tw or (outdir / f"{fid}.pdf").exists():
            continue
        inter = len(pw & tw)
        sc = inter / max(4, len(tw))
        if sc > 0.6:
            scores.append((sc, inter, f, fid))
scores.sort(reverse=True)
used_f, used_id, pairs = set(), set(), []
for sc, inter, f, fid in scores:
    if f in used_f or fid in used_id:
        continue
    used_f.add(f); used_id.add(fid); pairs.append((sc, f, fid))

locked = []
for sc, f, fid in pairs:
    try:
        shutil.move(str(f), str(outdir / f"{fid}.pdf"))
    except PermissionError:
        locked.append(f)
print("mapped & moved:", len(pairs) - len(locked), "locked:", len(locked))
for f in locked:
    print("  locked:", f.name[:70])
unmatched = [f.name for f in files if f.exists()]
print("unmatched left in Downloads:", len(unmatched))
for n in unmatched[:10]:
    print("  ", n[:70])
