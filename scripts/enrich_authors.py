# -*- coding: utf-8 -*-
"""Enrich figures.json authors from citation_author meta tags:
NeurIPS abstract pages and PMLR paper pages."""
import json, re, time
from pathlib import Path
import requests

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
H = {"User-Agent": "Mozilla/5.0 (research figure gallery; contact: 939123836@qq.com)"}
figs = json.loads((DATA / "figures.json").read_text(encoding="utf-8"))
matched = {m["id"]: m for m in json.loads((DATA / "matched.json").read_text(encoding="utf-8"))}

def authors_from(url):
    try:
        r = requests.get(url, headers=H, timeout=60)
        if r.status_code != 200:
            print("  status", r.status_code, url)
            return []
        names = re.findall(r'<meta name="citation_author" content="([^"]+)"', r.text)
        out = []
        for n in names:
            n = n.strip().replace("*", "")
            if n and n not in out:
                out.append(n)
        return out
    except Exception as e:
        print("  err", e)
        return []

for f in figs:
    if f["venue"] == "iclr" and f["authors"]:
        continue
    m = matched[f["id"]]
    url = None
    if f["venue"] == "neurips":
        url = m.get("abs")
    elif f["venue"] == "icml":
        url = m["pdf"].replace(".pdf", ".html")
    if not url:
        continue
    au = authors_from(url)
    if au:
        f["authors"] = au
        print("OK", f["id"], ", ".join(au[:4])[:70])
    else:
        print("MISS", f["id"], url[:90])
    time.sleep(0.6)

(DATA / "figures.json").write_text(json.dumps(figs, ensure_ascii=False, indent=1), encoding="utf-8")
missing = [f["id"] for f in figs if not f["authors"]]
print("\nmissing authors:", missing)
