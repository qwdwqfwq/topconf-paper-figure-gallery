# -*- coding: utf-8 -*-
import json, requests
H = {"User-Agent": "Mozilla/5.0 (research figure gallery; contact: 939123836@qq.com)"}
ms = json.load(open(r"C:\Users\黎枭\Doubao\chats\2026-09-16\new-chat\topconf-paper-figure-gallery\data\matched.json", encoding="utf-8"))
tests = [m for m in ms if m["venue"] == "neurips" and m["year"] in (2023, 2024)][:4]
for m in tests:
    url = m["pdf"]
    try:
        r = requests.get(url, headers=H, timeout=60, stream=True)
        chunk = next(r.iter_content(2000))
        print(r.status_code, r.headers.get("content-type"), chunk[:12], "|", m["id"], url[:120])
    except Exception as e:
        print("ERR", e, "|", m["id"], url[:120])
