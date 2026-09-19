# -*- coding: utf-8 -*-
import requests, re, urllib.parse, html, time
H = {"User-Agent": "Mozilla/5.0 (research; 939123836@qq.com)"}
tests = [
    "StreamingLLM: Efficient Streaming Language Models with Attention Sinks",
    "TextGrad: Automatic Differentiation via Text",
    "DreamFusion: Text-to-3D using 2D Diffusion",
    "RULER: What's the Real Context Size of Your Long-Context Language Models?",
]
for t in tests:
    q = urllib.parse.quote('ti:"%s"' % t)
    r = requests.get("http://export.arxiv.org/api/query?search_query=%s&max_results=3" % q, headers=H, timeout=40)
    entries = re.findall(r"<entry>(.*?)</entry>", r.text, re.S)
    print("QUERY:", t[:55], "| entries:", len(entries), "| status", r.status_code)
    for e in entries[:2]:
        et = re.search(r"<title>(.*?)</title>", e, re.S).group(1)
        mc = re.search(r"<arxiv:comment[^>]*>(.*?)</arxiv:comment>", e, re.S)
        print("   ->", re.sub(r"\s+", " ", html.unescape(et)).strip()[:75],
              "| comment:", (re.sub(r'\s+',' ', mc.group(1))[:70] if mc else None))
    time.sleep(3.5)
