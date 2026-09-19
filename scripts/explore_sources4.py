# -*- coding: utf-8 -*-
"""Round 4: NeurIPS2025 links, DBLP ICLR, OpenReview PDF direct, arXiv PDF."""
import requests, re

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

def get(name, url, **kw):
    try:
        r = requests.get(url, headers=HEADERS, timeout=50, **kw)
        print(f"[{name}] {r.status_code} len={len(r.content)} ctype={r.headers.get('content-type','')[:40]}")
        return r
    except Exception as e:
        print(f"[{name}] ERROR {e}")
        return None

# 1. NeurIPS 2025: all hrefs
r = get("NeurIPS2025", "https://proceedings.neurips.cc/paper_files/paper/2025")
if r:
    hrefs = re.findall(r'href="([^"]+)"', r.text)
    interesting = [h for h in hrefs if "hash" in h or ".html" in h or "api" in h]
    print("  sample hrefs:", interesting[:15])
    print("  any 'paper' in text:", r.text.count("paper_files"))

# 2. DBLP ICLR 2024/2025
for yr in (2024, 2025):
    r = get(f"DBLP-ICLR{yr}", f"https://dblp.org/db/conf/iclr/iclr{yr}.html")
    if r and r.status_code == 200:
        titles = re.findall(r'class="title"[^>]*>\s*(?:<span[^>]*>[^<]*</span>\s*)?([^<]+)', r.text)
        print(f"  titles found: {len(titles)}; first: {titles[:2]}")

# 3. Direct OpenReview PDF (SWE-bench ICLR 2024, id VSt0IEvX5Z)
r = get("OR-pdf", "https://openreview.net/pdf?id=VSt0IEvX5Z")
if r:
    print("  magic bytes:", r.content[:8])

# 4. arXiv PDF
r = get("arxiv-pdf", "https://arxiv.org/pdf/2310.06770")
if r:
    print("  magic bytes:", r.content[:8])
