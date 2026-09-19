# -*- coding: utf-8 -*-
import requests, urllib.parse, time, json
H = {"User-Agent": "research-figure-gallery/1.0 (mailto:939123836@qq.com)"}
tests = [
    ("StreamingLLM: Efficient Streaming Language Models with Attention Sinks", 2024),
    ("TextGrad: Automatic Differentiation via Text", 2025),
    ("DreamFusion: Text-to-3D using 2D Diffusion", 2023),
    ("RULER: What's the Real Context Size of Your Long-Context Language Models?", 2025),
]
for t, yr in tests:
    q = urllib.parse.quote(t)
    url = ("https://api.semanticscholar.org/graph/v1/paper/search?query=%s"
           "&fields=title,venue,year,publicationVenue,externalIds&limit=3" % q)
    r = requests.get(url, headers=H, timeout=40)
    print("QUERY:", t[:50], r.status_code)
    if r.status_code == 200:
        for p in r.json().get("data", [])[:3]:
            pv = p.get("publicationVenue") or {}
            print("   ->", (p.get("title") or "")[:60], "| venue:", p.get("venue"),
                  "| year:", p.get("year"), "| pv:", pv.get("name"), "| arxiv:",
                  (p.get("externalIds") or {}).get("ArXiv"))
    else:
        print("   ", r.text[:200])
    time.sleep(3.5)
