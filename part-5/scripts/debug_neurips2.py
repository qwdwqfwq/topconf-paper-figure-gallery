# -*- coding: utf-8 -*-
import json, re, requests
H = {"User-Agent": "Mozilla/5.0 (research figure gallery; contact: 939123836@qq.com)"}
ms = json.load(open(r"C:\Users\黎枭\Doubao\chats\2026-09-16\new-chat\topconf-paper-figure-gallery\data\matched.json", encoding="utf-8"))
m = [x for x in ms if x["venue"] == "neurips" and x["year"] == 2023][0]
r = requests.get(m["abs"], headers=H, timeout=60)
print("abs status", r.status_code)
links = re.findall(r'href="([^"]+\.pdf)"', r.text)
print(links[:5])
# test file/ pattern
h = m["pdf"].split("/hash/")[1].split("-Paper")[0]
for pat in [f"https://proceedings.neurips.cc/paper_files/paper/2023/file/{h}-Paper-Conference.pdf"]:
    rr = requests.get(pat, headers=H, timeout=60, stream=True)
    print(pat, rr.status_code, rr.headers.get("content-type"), next(rr.iter_content(8)))
