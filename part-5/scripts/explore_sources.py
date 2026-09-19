# -*- coding: utf-8 -*-
"""Explore proceedings index endpoints for ICLR / ICML / NeurIPS."""
import requests, json, re

HEADERS = {"User-Agent": "Mozilla/5.0 (research figure gallery; contact: 939123836@qq.com)"}

def show(name, url, **kw):
    try:
        r = requests.get(url, headers=HEADERS, timeout=40, **kw)
        print(f"[{name}] {r.status_code} len={len(r.content)} url={r.url}")
        return r
    except Exception as e:
        print(f"[{name}] ERROR {e}")
        return None

# 1. OpenReview API v2: ICLR 2024 submissions, check venue values
r = show("OR-ICLR2024", "https://api2.openreview.net/notes",
         params={"content.venueid": "ICLR.cc/2024/Conference", "limit": 5})
if r and r.status_code == 200:
    d = r.json()
    print("  count field:", d.get("count"))
    for n in d.get("notes", [])[:3]:
        c = n.get("content", {})
        title = c.get("title", {}).get("value") if isinstance(c.get("title"), dict) else c.get("title")
        venue = c.get("venue", {}).get("value") if isinstance(c.get("venue"), dict) else c.get("venue")
        print("  -", venue, "|", str(title)[:80])

# 2. NeurIPS proceedings index 2024
r = show("NeurIPS2024-index", "https://proceedings.neurips.cc/paper_files/paper/2024")
if r and r.status_code == 200:
    links = re.findall(r'hash/([0-9a-f]+)-Abstract-Conference\.html', r.text)
    titles = re.findall(r'-Abstract-Conference\.html"[^>]*>([^<]+)</a>', r.text)
    print("  hash links:", len(links), "| titles:", len(titles))
    for t in titles[:3]:
        print("  -", t[:90])

# 3. PMLR ICML volumes: v202 (2023), v235 (2024), find 2025
for vol, year in [("v202", 2023), ("v235", 2024)]:
    r = show(f"PMLR-{vol}", f"https://proceedings.mlr.press/{vol}/")
    if r and r.status_code == 200:
        papers = re.findall(r'class="title"[^>]*>([^<]+)</p>', r.text)
        pdfs = re.findall(r'href="([^"]+\.pdf)"', r.text)
        print(f"  ICML {year}: titles={len(papers)} pdfs={len(pdfs)}")
        for t in papers[:2]:
            print("  -", t[:90])

r = show("PMLR-root", "https://proceedings.mlr.press/")
if r and r.status_code == 200:
    vols = re.findall(r'<a href="(v\d+)/"[^>]*>([^<]*)</a>', r.text)
    icml = [(v, label) for v, label in vols if "ICML" in label]
    print("  ICML volumes:", icml[-6:])
