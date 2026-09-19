# -*- coding: utf-8 -*-
"""Probe OpenReview challenge minting flow (one-off investigation)."""
import re, requests, json
H = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36"}
s = requests.Session(); s.trust_env = False; s.headers.update(H)
r = s.get("https://openreview.net/challenge?redirect=https%3A%2F%2Fopenreview.net%2F", timeout=30)
print("challenge page", r.status_code, len(r.text))
open("data/challenge.html", "w", encoding="utf-8").write(r.text)
for m in re.findall(r'<script[^>]*src=["\']([^"\']+)', r.text):
    print("script:", m)
print("cookies after page:", s.cookies.get_dict())
print(r.text[:800])
