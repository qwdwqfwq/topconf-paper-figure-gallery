# -*- coding: utf-8 -*-
"""Round 3: inspect NeurIPS 2025 page, PMLR root structure, DBLP, OpenReview PDF."""
import requests, re

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

def get(name, url, **kw):
    try:
        r = requests.get(url, headers=HEADERS, timeout=40, **kw)
        print(f"[{name}] {r.status_code} len={len(r.content)} ctype={r.headers.get('content-type','')[:40]}")
        return r
    except Exception as e:
        print(f"[{name}] ERROR {e}")
        return None

# 1. NeurIPS 2025 page structure
r = get("NeurIPS2025", "https://proceedings.neurips.cc/paper_files/paper/2025")
if r:
    print(r.text[:1500])

# 2. PMLR root: dump ICML-related lines
r = get("PMLR-root", "https://proceedings.mlr.press/")
if r:
    for line in r.text.splitlines():
        if "ICML" in line and ("v2" in line or "href" in line):
            print("  ", line.strip()[:200])
