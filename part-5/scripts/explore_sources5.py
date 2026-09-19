# -*- coding: utf-8 -*-
"""Round 5: NeurIPS 2025 track suffixes, arXiv API title query test."""
import requests, re, urllib.parse
from collections import Counter

HEADERS = {"User-Agent": "Mozilla/5.0 (research; contact 939123836@qq.com)"}

# NeurIPS 2025 suffixes
r = requests.get("https://proceedings.neurips.cc/paper_files/paper/2025", headers=HEADERS, timeout=40)
suffixes = Counter(re.findall(r'-Abstract-([A-Za-z_0-9]+)\.html', r.text))
print("NeurIPS 2025 track suffixes:", dict(suffixes))
pairs = re.findall(r'hash/([0-9a-f]+)-Abstract-[A-Za-z_0-9]+\.html"[^>]*>([^<]+)</a>', r.text)
print("total titled links:", len(pairs))
for h, t in pairs[:5]:
    print("  ", h[:10], t[:80])

# arXiv API title query
q = urllib.parse.quote('ti:"SWE-bench: Can Language Models Resolve Real-World GitHub Issues?"')
url = f"http://export.arxiv.org/api/query?search_query={q}&max_results=3"
r2 = requests.get(url, headers=HEADERS, timeout=40)
print("\narXiv API status:", r2.status_code, "len", len(r2.content))
ids = re.findall(r'<id>http://arxiv.org/abs/([^<]+)</id>', r2.text)
comments = re.findall(r'<arxiv:comment[^>]*>([^<]*)</arxiv:comment>', r2.text)
titles = re.findall(r'<title>([^<]+)</title>', r2.text)
print("ids:", ids)
print("comments:", comments)
print("titles:", titles[1:3])
