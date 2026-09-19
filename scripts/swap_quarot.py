# -*- coding: utf-8 -*-
"""Swap QuaRot (plain matplotlib) -> Deep Video Discovery (designed pipeline)."""
import json, re, shutil
from pathlib import Path
import requests
ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
ms = {m["id"]: m for m in json.loads((DATA / "matched.json").read_text(encoding="utf-8"))}
figs = json.loads((DATA / "figures.json").read_text(encoding="utf-8"))
old, new = "neurips2024-25", "neurips2025-35"
m = ms[new]
# authors from arxiv citation_author
r = requests.get(m["abs"], headers={"User-Agent": "Mozilla/5.0"}, timeout=60)
au = re.findall(r'<meta name="citation_author" content="([^"]+)"', r.text)
def fl(n):
    if "," in n:
        a, b = n.split(",", 1); return (b.strip() + " " + a.strip()).strip()
    return n.strip()
au = [fl(x) for x in dict.fromkeys(au) if x.strip()]
# replace image
olddir = ROOT / "images/neurips/final"
for f in olddir.glob(old + ".*"): f.unlink()
shutil.copy2(ROOT / m["image"], olddir / f"{new}.png")
row = {
 "id": new, "venue": "neurips", "year": 2025,
 "title": re.sub(r"\s+", " ", m["title"]),
 "authors": au, "pattern": "pipeline",
 "image": f"images/neurips/final/{new}.png",
 "paper": m.get("abs", ""), "pdf_source": m["pdf"],
}
figs = [f for f in figs if f["id"] != old] + [row]
figs.sort(key=lambda f: (f["venue"], f["year"], f["id"]))
(DATA / "figures.json").write_text(json.dumps(figs, ensure_ascii=False, indent=1), encoding="utf-8")
print("swapped;", au[:4], m["abs"])
