# -*- coding: utf-8 -*-
"""Round 2: OpenReview access, NeurIPS 2023/2025, PMLR ICML 2025 volume."""
import requests, re

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
}

def show(name, url, **kw):
    try:
        r = requests.get(url, headers=HEADERS, timeout=40, **kw)
        print(f"[{name}] {r.status_code} len={len(r.content)}")
        return r
    except Exception as e:
        print(f"[{name}] ERROR {e}")
        return None

# OpenReview v1 API
r = show("ORv1-ICLR2024", "https://api.openreview.net/notes",
         params={"invitation": "ICLR.cc/2024/Conference/-/Blind_Submission", "limit": 3})
if r and r.status_code == 200:
    d = r.json()
    print("  count:", d.get("count"))
    for n in d.get("notes", [])[:2]:
        print("  -", str(n.get("content", {}).get("title", ""))[:80])

# OpenReview v2 with invitation
r = show("ORv2-ICLR2024-inv", "https://api2.openreview.net/notes",
         params={"invitation": "ICLR.cc/2024/Conference/-/Submission", "limit": 3})
if r and r.status_code == 200:
    d = r.json()
    print("  count:", d.get("count"))
    for n in d.get("notes", [])[:2]:
        c = n.get("content", {})
        t = c.get("title", {})
        print("  -", str(t.get("value") if isinstance(t, dict) else t)[:80])

# OpenReview venue group: accepted posters via venueid with domain header variations
r = show("ORv2-ICLR2024-group", "https://api2.openreview.net/notes",
         params={"content.venueid": "ICLR.cc/2024/Conference", "limit": 3, "offset": 0})

# NeurIPS 2023 and 2025
for year in (2023, 2025):
    r = show(f"NeurIPS{year}", f"https://proceedings.neurips.cc/paper_files/paper/{year}")
    if r and r.status_code == 200:
        n = len(re.findall(r'-Abstract-Conference\.html', r.text))
        print(f"  papers: {n}")

# PMLR root: find ICML 2025 volume
r = show("PMLR-root", "https://proceedings.mlr.press/")
if r and r.status_code == 200:
    for m in re.finditer(r'href="(v\d+)/"[^>]*>(.*?)</a>', r.text, re.S):
        vol, label = m.group(1), re.sub(r"<[^>]+>", "", m.group(2)).strip()
        if "ICML" in label or "ICML" in m.group(0):
            print("  ", vol, label[:80])
    # fallback: search for 2025 / volume listing text
    for m in re.finditer(r'(v\d+)[^0-9]{0,40}(ICML[^<]{0,40})', r.text):
        print("  fallback:", m.group(1), m.group(2)[:60])
