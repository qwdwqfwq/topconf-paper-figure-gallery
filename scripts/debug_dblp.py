# -*- coding: utf-8 -*-
import requests, urllib.parse, time
H = {"User-Agent": "Mozilla/5.0 (research-figure-gallery; mailto:939123836@qq.com)"}
tests = [
    "StreamingLLM Efficient Streaming Language Models Attention Sinks",
    "TextGrad Automatic Differentiation via Text",
    "DreamFusion Text-to-3D using 2D Diffusion",
]
for t in tests:
    url = "https://dblp.org/search/publ/api?q=%s&format=json&h=5" % urllib.parse.quote(t)
    try:
        r = requests.get(url, headers=H, timeout=40)
        print("QUERY:", t[:45], "status", r.status_code, "len", len(r.text))
        if r.status_code == 200:
            j = r.json()
            hits = j.get("result", {}).get("hits", {}).get("hit", [])
            for h in hits[:4]:
                i = h.get("info", {})
                print("   ->", (i.get("title") or "")[:60], "| venue:", i.get("venue"), "| year:", i.get("year"), "| ee:", (i.get("ee") or "")[:60])
    except Exception as e:
        print("ERR", e)
    time.sleep(2)
